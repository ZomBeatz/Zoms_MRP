import { format } from "date-fns";
import type { AppData, Booking, Person } from "./types";
import { bookings } from "./bookings";
import { dutyOf, findIssues, missionCoverage, neededTraining, trainingStatus, type Issue, type TrainingState } from "./coverage";
import { daysIn, fleetUse, freePerDay, type TailUse } from "./fleet";
import { DAY, ms } from "./time";
import { tailSpan } from "./slots";

/**
 * How the business and its resources are used over a period: days per mission (customer),
 * how busy each aircraft and person was, and how much mission time was fully crewed.
 * The Reports page shows it; the PDF and Excel reports draw it.
 */

const clip = (a: number, b: number, from: number, to: number) => Math.max(0, Math.min(b, to) - Math.max(a, from));

export function report(data: AppData, from: number, to: number) {
  const days = (to - from) / DAY;
  const missions = bookings(data).filter((m) => m.status !== "Cancelled" && clip(ms(m.start), ms(m.end), from, to) > 0);
  const mDays = (m: Booking) => clip(ms(m.start), ms(m.end), from, to) / DAY;

  const fleet = data.aircraft.filter((a) => a.status !== "Retired").map((a) => {
    const flying = missions.filter((m) => m.aircraftIds.includes(a.id)).reduce((t, m) => t + clip(...tailSpan(m, a.id), from, to) / DAY, 0);
    const maint = data.jobs.filter((j) => j.aircraftId === a.id).reduce((t, j) => t + clip(ms(j.start), ms(j.end), from, to) / DAY, 0);
    return { a, flying, maint, idle: Math.max(0, days - flying - maint) };
  });

  const crew = data.people.map((p) => {
    const on = dutyOf(data, p.id).reduce((t, d) => t + clip(d.a, d.b, from, to), 0) / DAY;
    const off = data.timeOff.filter((t) => t.personId === p.id && !t.soft).reduce((t, o) => t + clip(ms(o.start), ms(o.end), from, to), 0) / DAY;
    return { p, on, off };
  });

  let total = 0, covered = 0;
  for (const m of missions) {
    const n = mDays(m);
    total += n;
    covered += n * missionCoverage(data, m).covered;
  }

  return {
    days, missions, total, crewedShare: total ? covered / total : 1,
    // One bar per mission (all its seasons in the period together).
    byMission: data.missions
      .map((m) => ({ m, days: missions.filter((x) => x.missionId === m.id).reduce((t, x) => t + mDays(x), 0) }))
      .filter((x) => x.days > 0)
      .sort((x, y) => y.days - x.days),
    fleet: fleet.sort((x, y) => y.flying - x.flying),
    crew: crew.sort((x, y) => y.on - x.on),
  };
}

/** One bar on a board: a span of days with what it is. */
export interface Span { a: number; b: number; label: string; color: string; kind: "mission" | "maintenance" | "off" | "down" }

export const REPORT_COLORS = { maintenance: "#b7791f", off: "#9aa3b5", down: "#5b6375", free: "#dcfce7" };

export interface TrainingRow { person: Person; course: string; neededFor: string; state: TrainingState; expires?: string }

/** Everything the PDF and Excel reports show for a period. */
export interface FullReport extends ReturnType<typeof report> {
  from: number;
  to: number;
  /** The midnights in the period, for the boards. */
  dayList: number[];
  tails: TailUse[];
  freeEachDay: { day: number; free: number }[];
  /** Each person's shifts, maintenance and time off in the period, pilots first. */
  people: { p: Person; spans: Span[] }[];
  training: TrainingRow[];
  jobs: AppData["jobs"];
  issues: Issue[];
  /** "Nov 1, 2026 to Jan 31, 2027" (the last day, not the midnight after it). */
  periodText: string;
}

export function fullReport(data: AppData, from: number, to: number): FullReport {
  const base = report(data, from, to);
  const seasons = new Map(bookings(data).map((b) => [b.id, b]));
  const people = [...data.people]
    .sort((x, y) => (x.role === y.role ? x.name.localeCompare(y.name) : x.role === "Pilot" ? -1 : 1))
    .map((p) => {
      const spans: Span[] = [];
      for (const s of data.shifts) {
        const b = seasons.get(s.seasonId);
        if (s.personId === p.id && b && b.status !== "Cancelled" && clip(ms(s.start), ms(s.end), from, to) > 0)
          spans.push({ a: ms(s.start), b: ms(s.end), label: b.name, color: b.color, kind: "mission" });
      }
      for (const j of data.jobs)
        if (j.maintainerIds.includes(p.id) && clip(ms(j.start), ms(j.end), from, to) > 0)
          spans.push({ a: ms(j.start), b: ms(j.end), label: j.title, color: REPORT_COLORS.maintenance, kind: "maintenance" });
      for (const t of data.timeOff)
        if (t.personId === p.id && clip(ms(t.start), ms(t.end), from, to) > 0)
          spans.push({ a: ms(t.start), b: ms(t.end), label: t.reason || "Time off", color: REPORT_COLORS.off, kind: "off" });
      return { p, spans: spans.sort((x, y) => x.a - y.a) };
    });

  // Problems first, then what runs out during the period, then the rest.
  const order: Record<TrainingState, number> = { missing: 0, expired: 1, "runs-out": 2, ok: 3 };
  const training: TrainingRow[] = [];
  for (const p of data.people)
    for (const [tid, missions] of neededTraining(data, p)) {
      const t = data.trainings.find((x) => x.id === tid);
      if (!t) continue;
      const st = trainingStatus(p, tid, from, to);
      training.push({ person: p, course: t.name, neededFor: missions.map((m) => m.name).join(", ") || `Every ${p.role.toLowerCase()}`, state: st.state, expires: st.expires });
    }
  training.sort((x, y) => order[x.state] - order[y.state] || x.person.name.localeCompare(y.person.name));

  return {
    ...base, from, to,
    dayList: daysIn(from, to),
    tails: fleetUse(data, from, to).sort((x, y) => x.aircraft.type.localeCompare(y.aircraft.type) || x.aircraft.tail.localeCompare(y.aircraft.tail)),
    freeEachDay: freePerDay(data, from, to),
    people,
    training,
    jobs: data.jobs.filter((j) => clip(ms(j.start), ms(j.end), from, to) > 0).sort((x, y) => x.start.localeCompare(y.start)),
    issues: findIssues(data).filter((i) => i.at >= from && i.at < to).sort((x, y) => (x.severity === y.severity ? x.at - y.at : x.severity === "danger" ? -1 : 1)),
    periodText: `${format(from, "MMM d, yyyy")} to ${format(to - DAY / 2, "MMM d, yyyy")}`,
  };
}

/** "zoms-mrp-report-2026-11-01-to-2027-01-31.pdf" */
export const reportName = (from: number, to: number, ext: "pdf" | "xlsx") =>
  `zoms-mrp-report-${format(from, "yyyy-MM-dd")}-to-${format(to - DAY / 2, "yyyy-MM-dd")}.${ext}`;

export const TRAINING_WORDS: Record<TrainingState, string> = { ok: "Current", "runs-out": "Runs out", expired: "Ran out", missing: "Not done" };
