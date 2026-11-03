import type { AppData, Person, Role, Rotation, Season, Shift } from "./types";
import { dutyOf, missionCoverage, requiredTraining, trainingStatus } from "./coverage";
import { onRotation, seasonTypes } from "./rotation";
import { dayAt, ms, overlaps, toWhen, uid } from "./time";

/**
 * Fill a season's open seats by rotating crew through it on the job's pattern (say 21 on, 14 off).
 *
 * Seat by seat, from the first open day, it picks the best person who can start that day: rated on
 * one of the job's aircraft types, current on its training, not booked, not on time off, on their own
 * rotation if they have one, and rested for the job's days off since their last stretch here. They stay
 * on for the job's "on" days, or until they stop being available (time off, their own rotation, another
 * booking), whichever comes first. The mission's regular crew go first, then whoever has worked least.
 * Days nobody can cover stay open, so the gaps show.
 */
export function fillSeason(data: AppData, season: Season, role: Role, rotation: Rotation | null, opts: { maxDaysOn: number; minDaysOff: number }): Shift[] {
  const need = role === "Pilot" ? season.pilotsNeeded : season.maintainersNeeded;
  const from = ms(season.start), to = ms(season.end);
  if (need <= 0 || !(to > from)) return [];
  const on = Math.max(1, rotation?.on ?? opts.maxDaysOn);
  const off = Math.max(0, rotation?.off ?? opts.minDaysOff);
  const mission = data.missions.find((m) => m.id === season.missionId);
  const types = seasonTypes(data, season);
  const training = mission ? requiredTraining(data, mission, role) : [];

  let current = data;
  const added: Shift[] = [];
  const worked = new Map<string, number>();
  for (const s of data.shifts) worked.set(s.personId, (worked.get(s.personId) ?? 0) + (ms(s.end) - ms(s.start)));

  // Busy spans per person, kept up to date as shifts are added.
  const busy = new Map<string, [number, number][]>();
  const busyOf = (p: Person) => {
    if (!busy.has(p.id)) busy.set(p.id, dutyOf(current, p.id).map((d) => [d.a, d.b] as [number, number]));
    return busy.get(p.id)!;
  };
  const offOf = (p: Person) => data.timeOff.filter((t) => t.personId === p.id).map((t) => [ms(t.start), ms(t.end)] as [number, number]);

  /** Can this person work the day starting at `d` (ignoring rest)? */
  const canWork = (p: Person, d: number) => {
    const e = dayAt(d, 1);
    if (!onRotation(p.rotation, d)) return false;
    if (busyOf(p).some(([a, b]) => overlaps(d, e, a, b))) return false;
    if (offOf(p).some(([a, b]) => overlaps(d, e, a, b))) return false;
    return training.every((id) => trainingStatus(p, id, d, e).state === "ok");
  };
  /** Rested: no work in the `off` days before `d`. */
  const rested = (p: Person, d: number) => !busyOf(p).some(([a, b]) => overlaps(dayAt(d, -off), d, a, b));

  const pool = data.people
    .filter((p) => p.role === role && (!types.length || types.some((t) => p.quals.includes(t))))
    .sort((a, b) => Number(b.missionIds.includes(season.missionId)) - Number(a.missionIds.includes(season.missionId)));

  // Walk the open stretches day by day, filling one seat at a time. Days before `skipUntil` are
  // either covered or have nobody who could take them.
  let skipUntil = from;
  for (let guard = 0; guard < 20000; guard++) {
    const gaps = role === "Pilot" ? missionCoverage(current, season).pilotGaps : missionCoverage(current, season).maintainerGaps;
    // The earliest open day that someone could still take (skip days already tried and found impossible).
    const gap = gaps.find((g) => g.b > skipUntil);
    if (!gap) break;
    const d = dayAt(Math.max(gap.a, skipUntil));
    if (d >= to) break;
    const pick = pool
      .filter((p) => canWork(p, d) && rested(p, d))
      .sort((a, b) => Number(b.missionIds.includes(season.missionId)) - Number(a.missionIds.includes(season.missionId)) || (worked.get(a.id) ?? 0) - (worked.get(b.id) ?? 0) || a.name.localeCompare(b.name))[0];
    if (!pick) {
      skipUntil = dayAt(d, 1); // nobody for this day: leave it open
      continue;
    }
    let end = d;
    const last = Math.min(to, dayAt(d, on));
    while (end < last && canWork(pick, end)) end = dayAt(end, 1);
    const shift: Shift = { id: uid(), seasonId: season.id, personId: pick.id, start: toWhen(d), end: toWhen(end) };
    added.push(shift);
    current = { ...current, shifts: [...current.shifts, shift] };
    busyOf(pick).push([d, end]);
    worked.set(pick.id, (worked.get(pick.id) ?? 0) + (end - d));
    skipUntil = d; // the same day may still have another open seat
  }
  return added;
}
