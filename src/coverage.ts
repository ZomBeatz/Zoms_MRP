import { format } from "date-fns";
import type { AppData, Mission, Person, Season, Shift } from "./types";
import { bookings } from "./bookings";
import { DAY, dayAt, fmtDays, fmtRange, ms, overlaps, plural, toWhen } from "./time";

/**
 * Everything MRP checks before a mission flies: coverage gaps, double bookings, qualifications,
 * time off and duty limits. Pure functions of the data, so the pages and the tests share them.
 */

export type Severity = "danger" | "warn";

export interface Issue {
  id: string;            // stable, so lists keep their order
  severity: Severity;
  title: string;         // "No pilot from 2:00 PM to 4:00 PM"
  detail: string;        // what it's about and what to do
  at: number;            // when it starts (for sorting and "Today")
  seasonId?: string;
  personId?: string;
  aircraftId?: string;
  jobId?: string;
}

/** Spans of [from, to] and how many of the intervals cover each one. */
export function coverageSteps(from: number, to: number, parts: [number, number][]): { a: number; b: number; n: number }[] {
  const edges = new Set<number>([from, to]);
  for (const [a, b] of parts) {
    if (a > from && a < to) edges.add(a);
    if (b > from && b < to) edges.add(b);
  }
  const xs = [...edges].sort((x, y) => x - y);
  const steps: { a: number; b: number; n: number }[] = [];
  for (let i = 0; i < xs.length - 1; i++) {
    const a = xs[i], b = xs[i + 1];
    const n = parts.filter(([p, q]) => p <= a && q >= b).length;
    const last = steps[steps.length - 1];
    if (last && last.n === n && last.b === a) last.b = b;
    else steps.push({ a, b, n });
  }
  return steps;
}

const active = (m: { status: Season["status"] }) => m.status !== "Cancelled" && m.status !== "Done";

export interface MissionCoverage {
  /** Spans where fewer pilots than needed are on board, with how many are missing. */
  pilotGaps: { a: number; b: number; short: number }[];
  maintainerGaps: { a: number; b: number; short: number }[];
  /** 0 to 1: the share of mission time with every pilot seat covered. */
  covered: number;
}

export function missionCoverage(data: AppData, m: Season): MissionCoverage {
  const from = ms(m.start), to = ms(m.end);
  const people = new Map(data.people.map((p) => [p.id, p]));
  const shifts = data.shifts.filter((s) => s.seasonId === m.id);
  const spans = (role: Person["role"]) =>
    shifts.filter((s) => people.get(s.personId)?.role === role).map((s) => [ms(s.start), ms(s.end)] as [number, number]);
  const gaps = (role: Person["role"], need: number) =>
    need <= 0 || to <= from
      ? []
      : coverageSteps(from, to, spans(role)).filter((s) => s.n < need).map((s) => ({ a: s.a, b: s.b, short: need - s.n }));
  const pilotGaps = gaps("Pilot", m.pilotsNeeded);
  const gapTime = pilotGaps.reduce((t, g) => t + (g.b - g.a), 0);
  return {
    pilotGaps,
    maintainerGaps: gaps("Maintainer", m.maintainersNeeded),
    covered: to > from ? 1 - gapTime / (to - from) : 1,
  };
}

/** Everything one person is booked for, as time spans with what each one is. */
export function dutyOf(data: AppData, personId: string) {
  const seasons = new Map(bookings(data).map((m) => [m.id, m]));
  const out: { a: number; b: number; label: string; seasonId?: string; jobId?: string; shiftId?: string }[] = [];
  for (const s of data.shifts) {
    const m = seasons.get(s.seasonId);
    if (s.personId === personId && m && m.status !== "Cancelled")
      out.push({ a: ms(s.start), b: ms(s.end), label: m.name, seasonId: m.id, shiftId: s.id });
  }
  for (const j of data.jobs) {
    if (j.maintainerIds.includes(personId) && !j.done) out.push({ a: ms(j.start), b: ms(j.end), label: j.title, jobId: j.id });
  }
  return out.sort((x, y) => x.a - y.a);
}

export function findIssues(data: AppData): Issue[] {
  const issues: Issue[] = [];
  const { maxDaysOn, minDaysOff } = data.settings.rules;
  const aircraft = new Map(data.aircraft.map((a) => [a.id, a]));
  const people = new Map(data.people.map((p) => [p.id, p]));
  const all = bookings(data);
  const missions = all.filter(active);
  const missionById = new Map(all.map((m) => [m.id, m]));
  const range = (a: number, b: number) => fmtRange(toWhen(a), toWhen(b));

  for (const m of missions) {
    const from = ms(m.start), to = ms(m.end);
    if (!(to > from)) {
      issues.push({ id: `time-${m.id}`, severity: "danger", title: `“${m.name}” ends before it starts`, detail: "Open the mission and fix its times.", at: from, seasonId: m.id });
      continue;
    }
    const ac = m.aircraftId ? aircraft.get(m.aircraftId) : undefined;
    if (!ac) {
      issues.push({ id: `noac-${m.id}`, severity: "warn", title: `“${m.name}” has no aircraft`, detail: "Pick an aircraft for this mission.", at: from, seasonId: m.id });
    } else {
      if (ac.status === "Grounded" || ac.status === "Retired")
        issues.push({ id: `acstat-${m.id}`, severity: "danger", title: `${ac.tail} is ${ac.status.toLowerCase()}`, detail: `It's booked for “${m.name}”. Pick another aircraft or change its status.`, at: from, seasonId: m.id, aircraftId: ac.id });
      for (const j of data.jobs) {
        if (j.aircraftId === ac.id && j.grounds && !j.done && overlaps(from, to, ms(j.start), ms(j.end)))
          issues.push({ id: `acjob-${m.id}-${j.id}`, severity: "danger", title: `${ac.tail} is in maintenance during “${m.name}”`, detail: `“${j.title}”, ${fmtRange(j.start, j.end)}. Move the job or pick another aircraft.`, at: Math.max(from, ms(j.start)), seasonId: m.id, aircraftId: ac.id, jobId: j.id });
      }
      for (const o of missions) {
        if (o.id > m.id && o.aircraftId === ac.id && overlaps(from, to, ms(o.start), ms(o.end)))
          issues.push({ id: `acdbl-${m.id}-${o.id}`, severity: "danger", title: `${ac.tail} is booked twice`, detail: `“${m.name}” and “${o.name}” overlap. Pick another aircraft for one of them.`, at: Math.max(from, ms(o.start)), seasonId: m.id, aircraftId: ac.id });
      }
    }

    const cov = missionCoverage(data, m);
    for (const g of cov.pilotGaps)
      issues.push({
        id: `pgap-${m.id}-${g.a}`, severity: "danger",
        title: g.short === m.pilotsNeeded ? `No pilot on “${m.name}”` : `“${m.name}” needs ${plural(g.short, "more pilot")}`,
        detail: `${range(g.a, g.b)}. Add a pilot shift to cover it.`, at: g.a, seasonId: m.id,
      });
    for (const g of cov.maintainerGaps)
      issues.push({ id: `mgap-${m.id}-${g.a}`, severity: "warn", title: `“${m.name}” needs ${plural(g.short, "maintainer")} on call`, detail: `${range(g.a, g.b)}.`, at: g.a, seasonId: m.id });

    if (ac) {
      const pilotSpans = data.shifts
        .filter((s) => s.seasonId === m.id && people.get(s.personId)?.role === "Pilot")
        .map((s) => [ms(s.start), ms(s.end)] as [number, number]);
      const crowded = coverageSteps(from, to, pilotSpans).filter((s) => s.n > ac.seats);
      for (const s of crowded)
        issues.push({ id: `seats-${m.id}-${s.a}`, severity: "warn", title: `${plural(s.n, "pilot")} on ${ac.tail}, which has ${plural(ac.seats, "seat")}`, detail: `“${m.name}”, ${range(s.a, s.b)}.`, at: s.a, seasonId: m.id });
    }
  }

  // Shifts: qualifications, outside the mission, time off.
  for (const s of data.shifts) {
    const m = missionById.get(s.seasonId);
    const p = people.get(s.personId);
    if (!m || !p || !active(m)) continue;
    const ac = m.aircraftId ? aircraft.get(m.aircraftId) : undefined;
    if (ac && !p.quals.includes(ac.type))
      issues.push({ id: `qual-${s.id}`, severity: "danger", title: `${p.name} isn't qualified on the ${ac.type}`, detail: `Shift on “${m.name}”, ${fmtRange(s.start, s.end)}. Swap them out or add the qualification.`, at: ms(s.start), seasonId: m.id, personId: p.id });
    // Maintainers often start before the mission (pre-flight) and stay after; pilots fly inside it.
    if (p.role === "Pilot" && (ms(s.start) < ms(m.start) || ms(s.end) > ms(m.end)))
      issues.push({ id: `outside-${s.id}`, severity: "warn", title: `${p.name}'s shift runs outside “${m.name}”`, detail: `The shift is ${fmtRange(s.start, s.end)}; the mission is ${fmtRange(m.start, m.end)}.`, at: ms(s.start), seasonId: m.id, personId: p.id });
    if (!(ms(s.end) > ms(s.start)))
      issues.push({ id: `stime-${s.id}`, severity: "danger", title: `${p.name}'s shift ends before it starts`, detail: `On “${m.name}”.`, at: ms(s.start), seasonId: m.id, personId: p.id });
  }
  for (const j of data.jobs) {
    if (j.done) continue;
    const ac = aircraft.get(j.aircraftId);
    for (const pid of j.maintainerIds) {
      const p = people.get(pid);
      if (p && ac && !p.quals.includes(ac.type))
        issues.push({ id: `jqual-${j.id}-${pid}`, severity: "warn", title: `${p.name} isn't qualified on the ${ac.type}`, detail: `Job “${j.title}” on ${ac.tail}.`, at: ms(j.start), personId: p.id, jobId: j.id, aircraftId: ac.id });
    }
  }

  // People: double bookings, time off, duty and rest.
  for (const p of data.people) {
    const duty = dutyOf(data, p.id).filter((d) => !d.seasonId || active(missionById.get(d.seasonId)!));
    for (let i = 0; i < duty.length; i++)
      for (let k = i + 1; k < duty.length; k++) {
        const x = duty[i], y = duty[k];
        if (y.a >= x.b) break;
        if (x.seasonId && x.seasonId === y.seasonId) continue; // two shifts on one season: a seat swap
        issues.push({ id: `dbl-${p.id}-${x.a}-${y.a}`, severity: "danger", title: `${p.name} is booked twice`, detail: `“${x.label}” and “${y.label}” overlap, ${range(Math.max(x.a, y.a), Math.min(x.b, y.b))}.`, at: Math.max(x.a, y.a), personId: p.id, seasonId: x.seasonId ?? y.seasonId, jobId: x.jobId ?? y.jobId });
      }
    for (const t of data.timeOff.filter((t) => t.personId === p.id))
      for (const d of duty)
        if (overlaps(d.a, d.b, ms(t.start), ms(t.end)))
          issues.push({ id: `off-${t.id}-${d.a}`, severity: "danger", title: `${p.name} is off${t.reason ? ` (${t.reason})` : ""}`, detail: `But booked on “${d.label}”, ${range(d.a, d.b)}.`, at: d.a, personId: p.id, seasonId: d.seasonId, jobId: d.jobId });

    // Hitches: bookings with fewer than the minimum days off between them count as one stretch on.
    let first = -1, last = -1;
    const flush = () => {
      // Rounded, so a day that changes the clock (23 or 25 hours) still counts as one day.
      const days = Math.round(((last - first) / DAY) * 10) / 10;
      if (first >= 0 && days > maxDaysOn)
        issues.push({ id: `duty-${p.id}-${first}`, severity: "danger", title: `${p.name} is on for ${fmtDays(days)} in a row`, detail: `${range(first, last)}. The most is ${plural(maxDaysOn, "day")}. Rotate someone in.`, at: first, personId: p.id });
    };
    for (const d of duty) {
      if (first >= 0 && Math.round(((d.a - last) / DAY) * 10) / 10 < minDaysOff) {
        if (d.a > last)
          issues.push({ id: `rest-${p.id}-${last}`, severity: "warn", title: `${p.name} gets only ${fmtDays((d.a - last) / DAY)} off`, detail: `Before “${d.label}”. The minimum is ${plural(minDaysOff, "day")}.`, at: d.a, personId: p.id, seasonId: d.seasonId, jobId: d.jobId });
        last = Math.max(last, d.b);
      } else {
        flush();
        first = d.a;
        last = d.b;
      }
    }
    flush();
  }

  // Training: everyone on a mission needs what the mission asks for, valid for all of their shift.
  const trainings = new Map(data.trainings.map((t) => [t.id, t]));
  for (const s of data.shifts) {
    const m = missionById.get(s.seasonId);
    const p = people.get(s.personId);
    if (!m || !p || !active(m)) continue;
    for (const tid of requiredTraining(data, m, p.role)) {
      const t = trainings.get(tid);
      if (!t) continue;
      const st = trainingStatus(p, tid, ms(s.start), ms(s.end));
      if (st.state === "ok") continue;
      issues.push({
        id: `train-${s.id}-${tid}`, severity: "danger",
        title: st.state === "missing" ? `${p.name} hasn't done ${t.name}` : st.state === "expired" ? `${p.name}'s ${t.name} has run out` : `${p.name}'s ${t.name} runs out during “${m.name}”`,
        detail: `“${m.name}” needs it.${st.expires ? ` It ${st.state === "expired" ? "ran out" : "runs out"} ${fmtDate(st.expires)}.` : ""} Swap them out or record the training.`,
        at: ms(s.start), seasonId: m.id, personId: p.id,
      });
    }
  }
  // Training people need for the missions they work: run out (and no renewal booked), or running out soon.
  const now = Date.now();
  for (const p of data.people) {
    for (const [tid, needers] of neededTraining(data, p)) {
      const t = trainings.get(tid);
      if (!t) continue;
      const done = p.training.filter((r) => r.trainingId === tid && ms(`${r.completed}T00:00`) <= now);
      const booked = p.training.some((r) => r.trainingId === tid && ms(`${r.completed}T00:00`) > now);
      if (booked || done.some((r) => !r.expires)) continue;
      const latest = done.map((r) => r.expires!).sort().at(-1);
      const missions = needers.map((m) => `“${m.name}”`).join(", ");
      const needs = needers.length === 1 ? "needs" : "need";
      if (!latest || ms(`${latest}T00:00`) <= now)
        issues.push({ id: `lapsed-${p.id}-${tid}`, severity: "warn", title: latest ? `${p.name}'s ${t.name} has run out` : `${p.name} hasn't done ${t.name}`,
          detail: `${missions} ${needs} it, so they can't be booked there until it's done.`, at: now, personId: p.id });
      else if (ms(`${latest}T00:00`) <= dayAt(now, data.settings.expiryWarningDays))
        issues.push({ id: `renew-${p.id}-${tid}`, severity: "warn", title: `${p.name}'s ${t.name} runs out ${fmtDate(latest)}`,
          detail: `${missions} ${needs} it. Book the renewal before then.`, at: ms(`${latest}T00:00`), personId: p.id });
    }
  }

  return issues.sort((a, b) => (a.severity === b.severity ? a.at - b.at : a.severity === "danger" ? -1 : 1));
}

/** Pilots or maintainers free for the whole of [a, b], qualified on the type, best first. */
export function whoCanCover(data: AppData, role: Person["role"], a: number, b: number, type: string | null, except: Shift["id"][] = [], required: string[] = [], missionId?: string) {
  return data.people
    .filter((p) => p.role === role)
    .map((p) => {
      const busy = dutyOf(data, p.id).some((d) => !except.includes(d.shiftId ?? "") && overlaps(a, b, d.a, d.b));
      const off = data.timeOff.some((t) => t.personId === p.id && overlaps(a, b, ms(t.start), ms(t.end)));
      const qualified = !type || p.quals.includes(type);
      const trained = required.every((id) => {
        const t = data.trainings.find((x) => x.id === id);
        return !t || (t.appliesTo !== "Both" && t.appliesTo !== role) || trainingStatus(p, id, a, b).state === "ok";
      });
      const regular = !!missionId && p.missionIds.includes(missionId);
      return { person: p, busy, off, qualified, trained, regular, ok: !busy && !off && qualified && trained };
    })
    .sort((x, y) => Number(y.ok) - Number(x.ok) || Number(y.regular) - Number(x.regular) || Number(y.qualified && y.trained) - Number(x.qualified && x.trained) || x.person.name.localeCompare(y.person.name));
}

const fmtDate = (d: string) => format(new Date(`${d}T00:00`), "MMM d, yyyy");

/** The training a mission needs from someone in this role. */
export function requiredTraining(data: AppData, m: Pick<Mission, "requiredTrainingIds">, role?: Person["role"]): string[] {
  const ids = [...new Set(m.requiredTrainingIds ?? [])];
  if (!role) return ids;
  return ids.filter((id) => {
    const t = data.trainings.find((x) => x.id === id);
    return t && (t.appliesTo === "Both" || t.appliesTo === role);
  });
}

/**
 * The training one person needs: what the missions they work (and any upcoming one they're booked on) ask for.
 * Returns training id → the missions that need it.
 */
export function neededTraining(data: AppData, p: Person): Map<string, Mission[]> {
  const now = Date.now();
  const theirs = new Set(p.missionIds);
  const seasons = new Map(data.seasons.map((x) => [x.id, x]));
  for (const s of data.shifts) {
    const season = seasons.get(s.seasonId);
    if (s.personId === p.id && season && active(season) && ms(season.end) > now) theirs.add(season.missionId);
  }
  const need = new Map<string, Mission[]>();
  for (const m of data.missions) {
    if (!theirs.has(m.id)) continue;
    for (const t of requiredTraining(data, m, p.role)) need.set(t, [...(need.get(t) ?? []), m]);
  }
  return need;
}

export type TrainingState = "ok" | "missing" | "expired" | "runs-out";

/** Whether a person's training covers [a, b): done, and not run out before b. */
export function trainingStatus(p: Person, trainingId: string, a: number, b: number): { state: TrainingState; expires?: string } {
  const recs = p.training.filter((r) => r.trainingId === trainingId && ms(`${r.completed}T00:00`) <= a);
  if (!recs.length) return { state: "missing" };
  if (recs.some((r) => !r.expires)) return { state: "ok" };
  const latest = recs.map((r) => r.expires!).sort().at(-1)!;
  const end = ms(`${latest}T00:00`);
  if (end <= a) return { state: "expired", expires: latest };
  if (end < b) return { state: "runs-out", expires: latest };
  return { state: "ok", expires: latest };
}
