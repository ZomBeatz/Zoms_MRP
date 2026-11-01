import type { Aircraft, AppData, Booking, MaintenanceJob, Person } from "./types";
import { bookings } from "./bookings";
import { dutyOf, trainingStatus } from "./coverage";
import { dayAt, ms, overlaps } from "./time";

/**
 * The fleet, day by day: what each tail is doing, how much of it is used, when it's free,
 * and whether the fleet (and the crew for it) can take on another job.
 */

export type DayUse =
  | { kind: "mission"; mission: Booking }
  | { kind: "maintenance"; job: MaintenanceJob }
  | { kind: "down" }   // grounded or retired
  | { kind: "free" };

// A finished season still used the aircraft; only a cancelled one leaves it free.
const live = (m: Booking) => m.status !== "Cancelled";

/**
 * What one aircraft is doing on the day starting at midnight `day`. Maintenance that grounds it wins over
 * a mission; a mission wins over a check that doesn't; and any maintenance takes a day that would be free.
 * Finished seasons and jobs still count, so the past shows what really happened.
 */
export function dayUse(data: AppData, a: Aircraft, day: number): DayUse {
  if (a.status === "Grounded" || a.status === "Retired") return { kind: "down" };
  const end = dayAt(day, 1);
  const jobs = data.jobs.filter((j) => j.aircraftId === a.id && overlaps(day, end, ms(j.start), ms(j.end)));
  const grounding = jobs.find((j) => j.grounds);
  if (grounding) return { kind: "maintenance", job: grounding };
  const mission = bookings(data).find((m) => m.aircraftId === a.id && live(m) && overlaps(day, end, ms(m.start), ms(m.end)));
  if (mission) return { kind: "mission", mission };
  if (jobs.length) return { kind: "maintenance", job: jobs[0] };
  return { kind: "free" };
}

/** Midnights from `from` up to (not including) `to`. */
export const daysIn = (from: number, to: number) => {
  const out: number[] = [];
  for (let d = from; d < to; d = dayAt(d, 1)) out.push(d);
  return out;
};

export interface TailUse {
  aircraft: Aircraft;
  days: DayUse[];
  mission: number;
  maintenance: number;
  free: number;
  down: number;
  /** Share of the days it could fly that it's on a mission (0 to 1). */
  use: number;
  /** Runs of free days, as [first midnight, midnight after the last]. */
  freeRuns: [number, number][];
}

export function fleetUse(data: AppData, from: number, to: number): TailUse[] {
  const days = daysIn(from, to);
  return data.aircraft
    .filter((a) => a.status !== "Retired")
    .map((a) => {
      const uses = days.map((d) => dayUse(data, a, d));
      const count = (k: DayUse["kind"]) => uses.filter((u) => u.kind === k).length;
      const freeRuns: [number, number][] = [];
      uses.forEach((u, i) => {
        if (u.kind !== "free") return;
        const last = freeRuns[freeRuns.length - 1];
        if (last && last[1] === days[i]) last[1] = dayAt(days[i], 1);
        else freeRuns.push([days[i], dayAt(days[i], 1)]);
      });
      const mission = count("mission"), maintenance = count("maintenance"), free = count("free"), down = count("down");
      const flyable = mission + free;
      return { aircraft: a, days: uses, mission, maintenance, free, down, use: flyable ? mission / flyable : 0, freeRuns };
    })
    .sort((x, y) => x.aircraft.tail.localeCompare(y.aircraft.tail));
}

/** How many aircraft are free each day. */
export function freePerDay(data: AppData, from: number, to: number): { day: number; free: number }[] {
  const fleet = fleetUse(data, from, to);
  return daysIn(from, to).map((day, i) => ({ day, free: fleet.filter((t) => t.days[i].kind === "free").length }));
}

export interface Job {
  start: number;
  end: number;
  /** Aircraft type the job needs, or null for any. */
  type: string | null;
  pilotsNeeded: number;
  /** Training the crew needs. */
  training: string[];
}

/** Can this pilot fly that day: qualified on the type, not booked, not off, training current for the day. */
function pilotFree(data: AppData, p: Person, type: string, day: number, training: string[]) {
  const end = dayAt(day, 1);
  if (!p.quals.includes(type)) return false;
  if (dutyOf(data, p.id).some((d) => overlaps(day, end, d.a, d.b))) return false;
  if (data.timeOff.some((t) => t.personId === p.id && overlaps(day, end, ms(t.start), ms(t.end)))) return false;
  return training.every((id) => {
    const t = data.trainings.find((x) => x.id === id);
    return !t || (t.appliesTo !== "Both" && t.appliesTo !== "Pilot") || trainingStatus(p, id, day, end).state === "ok";
  });
}

export interface SupportAnswer {
  aircraft: Aircraft;
  /** "yes": tail and crew free; "crew": tail free but not enough pilots some days; "no": the tail can't. */
  verdict: "yes" | "crew" | "no";
  reasons: string[];
  /** Days with fewer free, qualified, current pilots than needed. */
  shortDays: number;
  /** Fewest pilots free on any day. */
  fewestPilots: number;
  /** When it's busy: the first day (within a year) it's free for the job's whole length. */
  earliest?: number;
}

/** First midnight from `from` (looking up to a year ahead) when the tail is free for `length` days in a row. */
export function earliestFree(data: AppData, a: Aircraft, from: number, length: number): number | undefined {
  const horizon = dayAt(from, 365 + length);
  const uses = daysIn(from, horizon).map((d) => dayUse(data, a, d).kind === "free");
  let run = 0;
  for (let i = 0; i < uses.length; i++) {
    run = uses[i] ? run + 1 : 0;
    if (run === length) return dayAt(from, i - length + 1);
  }
  return undefined;
}

/**
 * For each tail, could it take this job? Crew is checked day by day (pilots can rotate through it),
 * ignoring hitch length, so it's a first answer, not a roster.
 */
export function canSupport(data: AppData, job: Job): SupportAnswer[] {
  const days = daysIn(job.start, job.end);
  const pilots = data.people.filter((p) => p.role === "Pilot");
  const crewCache = new Map<string, { short: number; fewest: number }>();
  const crewFor = (type: string) => {
    if (!crewCache.has(type)) {
      const counts = days.map((d) => pilots.filter((p) => pilotFree(data, p, type, d, job.training)).length);
      crewCache.set(type, { short: counts.filter((n) => n < job.pilotsNeeded).length, fewest: counts.length ? Math.min(...counts) : 0 });
    }
    return crewCache.get(type)!;
  };

  return data.aircraft
    .filter((a) => a.status !== "Retired")
    .map((a): SupportAnswer => {
      const reasons: string[] = [];
      if (job.type && a.type !== job.type) reasons.push(`It's a ${a.type}.`);
      if (a.status === "Grounded") reasons.push("It's grounded.");
      if (job.pilotsNeeded > a.seats) reasons.push(`It has ${a.seats} pilot seat${a.seats === 1 ? "" : "s"}.`);
      for (const m of bookings(data))
        if (m.aircraftId === a.id && live(m) && overlaps(job.start, job.end, ms(m.start), ms(m.end))) reasons.push(`Booked on “${m.name}”.`);
      for (const j of data.jobs)
        if (j.aircraftId === a.id && j.grounds && !j.done && overlaps(job.start, job.end, ms(j.start), ms(j.end))) reasons.push(`In maintenance (“${j.title}”).`);
      const crew = crewFor(a.type);
      // Only bookings and maintenance are worth waiting out; the wrong type or too few seats never clear.
      const wrongKind = (job.type && a.type !== job.type) || a.status === "Grounded" || job.pilotsNeeded > a.seats;
      if (reasons.length)
        return { aircraft: a, verdict: "no", reasons, shortDays: crew.short, fewestPilots: crew.fewest, earliest: wrongKind ? undefined : earliestFree(data, a, job.start, days.length) };
      if (crew.short) reasons.push(`Not enough free, qualified, current pilots on ${crew.short} day${crew.short === 1 ? "" : "s"}.`);
      return { aircraft: a, verdict: crew.short ? "crew" : "yes", reasons, shortDays: crew.short, fewestPilots: crew.fewest };
    })
    .sort((x, y) => ["yes", "crew", "no"].indexOf(x.verdict) - ["yes", "crew", "no"].indexOf(y.verdict) || x.aircraft.tail.localeCompare(y.aircraft.tail));
}
