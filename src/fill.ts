import type { AppData, Person, Role, Rotation, Season, Shift } from "./types";
import { dutyOf, missionCoverage, requiredTraining, trainingStatus } from "./coverage";
import { onRotation, seasonTypes } from "./rotation";
import { jobLimits, seasonRules, stricter } from "./limits";
import { staleOn } from "./currency";
import { flightSpans, pilotHoursPerDay, pilotOverLimit } from "./flight";
import { booking } from "./bookings";
import { DAY, dayAt, ms, overlaps, toWhen, uid } from "./time";

/**
 * Fill a season's open seats by rotating crew through it on the job's pattern (say 21 on, 14 off).
 *
 * Seat by seat, from the first open day, it picks the best person who can start that day: rated on
 * one of the job's aircraft types, current on its training, not booked, not on time off, on their own
 * rotation if they have one, and rested for the job's days off since their last stretch here. They stay
 * on for the job's "on" days, or until they stop being available (time off, their own rotation, another
 * booking, or the flight-hour limit in Settings), whichever comes first. The mission's regular crew go first, then whoever has worked least.
 * Days nobody can cover stay open, so the gaps show.
 */
export function fillSeason(data: AppData, season: Season, role: Role, rotation: Rotation | null,
  opts: { maxDaysOn: number; minDaysOff: number; window?: [number, number]; skip?: Set<string> }): Shift[] {
  const need = role === "Pilot" ? season.pilotsNeeded : season.maintainersNeeded;
  // Only open days inside `window` (the Balance page's period) are filled, and shifts stop at its end.
  const from = Math.max(ms(season.start), opts.window?.[0] ?? -Infinity), to = Math.min(ms(season.end), opts.window?.[1] ?? Infinity);
  if (need <= 0 || !(to > from)) return [];
  // The limits for this season (Settings, its mission and season), then each person's own on top.
  const base = seasonRules(data, season, opts);
  const limitsOf = (p: Person) => stricter(base, p.limits);
  // The job's rotation, but never longer than the most days on in a row allowed.
  const on = Math.max(1, Math.min(rotation?.on ?? base.maxDaysOn, base.maxDaysOn));
  const off = Math.max(0, rotation?.off ?? opts.minDaysOff);
  const mission = data.missions.find((m) => m.id === season.missionId);
  const types = seasonTypes(data, season);
  // What this job asks for (its own requirements, else its client's), with what everyone and its aircraft types need.
  const training = mission ? requiredTraining(data, booking(mission, season), role) : [];
  const limits = jobLimits(data, season);

  let current = data;
  const added: Shift[] = [];
  const worked = new Map<string, number>();
  // Who has worked least goes first: within the period when there is one, so the work evens out there.
  const [wa, wb] = opts.window ?? [-Infinity, Infinity];
  for (const s of data.shifts) worked.set(s.personId, (worked.get(s.personId) ?? 0) + Math.max(0, Math.min(ms(s.end), wb) - Math.max(ms(s.start), wa)));

  // Busy spans per person, kept up to date as shifts are added.
  const busy = new Map<string, [number, number][]>();
  const busyOf = (p: Person) => {
    if (!busy.has(p.id)) busy.set(p.id, dutyOf(current, p.id).map((d) => [d.a, d.b] as [number, number]));
    return busy.get(p.id)!;
  };
  const offOf = (p: Person) => data.timeOff.filter((t) => t.personId === p.id && !t.soft).map((t) => [ms(t.start), ms(t.end)] as [number, number]);
  /** Days they'd rather not work (a preference): booked only when nobody else can. */
  const prefersOff = (p: Person, d: number) => data.timeOff.some((t) => t.personId === p.id && t.soft && overlaps(d, dayAt(d, 1), ms(t.start), ms(t.end)));

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
  /**
   * Days on in a row if they also worked [a, b): bookings with fewer than the minimum days off between
   * them count as one stretch, before and after, like the hitch check does.
   */
  const stretch = (p: Person, a: number, b: number) => {
    const spans = [...busyOf(p), [a, b] as [number, number]].sort((x, y) => x[0] - y[0]);
    let lo = -1, hi = -1, found = 0;
    for (const [x, y] of spans) {
      if (lo >= 0 && Math.round(((x - hi) / DAY) * 10) / 10 < limitsOf(p).minDaysOff) hi = Math.max(hi, y);
      else {
        if (lo <= a && a < hi) found = hi - lo;
        lo = x;
        hi = y;
      }
    }
    if (lo <= a && a < hi) found = hi - lo;
    return Math.round((found / DAY) * 10) / 10;
  };
  /** Some days off but fewer than the minimum, between [a, b) and their other bookings. */
  const shortRest = (p: Person, a: number, b: number) => busyOf(p).some(([x, y]) => {
    const gap = Math.round(((x >= b ? x - b : a - y) / DAY) * 10) / 10;
    return (x >= b || y <= a) && gap > 0 && gap < limitsOf(p).minDaysOff;
  });
  // Pilots: no more flight hours in any window than allowed (Settings), counting this job's flying.
  const limited = role === "Pilot" && limits.flightLimits.length > 0;
  const perDay = limited ? pilotHoursPerDay(data, season) : 0;
  const flies = (p: Person, a: number, b: number) => !perDay || !pilotOverLimit(data, [...flightSpans(current, p.id), { a, b, perDay, limits: limits.flightLimits }]);
  const fits = (p: Person, a: number, b: number) => stretch(p, a, b) <= limitsOf(p).maxDaysOn && !shortRest(p, a, b) && flies(p, a, b);

  const pool = data.people
    .filter((p) => p.role === role && !opts.skip?.has(p.id) && (!types.length || types.some((t) => p.quals.includes(t))))
    .sort((a, b) => Number(b.missionIds.includes(season.missionId)) - Number(a.missionIds.includes(season.missionId)));

  // Walk the open stretches day by day, filling one seat at a time. Days before `skipUntil` are
  // either covered or have nobody who could take them.
  let skipUntil = from;
  for (let guard = 0; guard < 20000; guard++) {
    const gaps: { a: number; b: number; days?: number }[] = role === "Pilot" ? missionCoverage(current, season).pilotGaps : missionCoverage(current, season).maintainerGaps;
    // The earliest open day that someone could still take (skip days already tried and found impossible).
    const gap = gaps.find((g) => g.b > skipUntil);
    if (!gap) break;
    const d = dayAt(Math.max(gap.a, skipUntil));
    if (d >= to) break;
    const candidates = pool
      // Not current on the type (Settings) counts like training that's run out: Fill won't book them.
      .filter((p) => canWork(p, d) && rested(p, d) && fits(p, d, dayAt(d, 1)) && !staleOn(current, p, types, d))
      .sort((a, b) => Number(prefersOff(a, d)) - Number(prefersOff(b, d)) || Number(b.missionIds.includes(season.missionId)) - Number(a.missionIds.includes(season.missionId)) || (worked.get(a.id) ?? 0) - (worked.get(b.id) ?? 0) || a.name.localeCompare(b.name));
    // Up to the job's "on" days, but not past the open days (that would put more people on than seats).
    let last = Math.min(to, dayAt(d, on), gap.b);
    // Maintainers needed only some days: book just the days that count (the start or end, or the days a week still open).
    if (role === "Maintainer" && (season.maintainerNeed?.mode ?? "always") !== "always")
      last = Math.min(last, gap.days ? dayAt(d, gap.days) : Infinity);
    // The best one who can stay at least the fewest days in a hitch (schedule limitations), unless the open days end sooner.
    const shortest = Math.min(limits.minDaysOn, Math.round((last - d) / DAY));
    let pick: Person | undefined, end = d;
    for (const p of candidates) {
      let e = d;
      while (e < last && canWork(p, e) && fits(p, d, dayAt(e, 1))) e = dayAt(e, 1);
      if (Math.round((e - d) / DAY) >= shortest) { pick = p; end = e; break; }
    }
    if (!pick) {
      skipUntil = dayAt(d, 1); // nobody for this day: leave it open
      continue;
    }
    // Taking over from someone whose shift on this job ends today (in this role, not already handed over).
    const from_ = current.shifts.find((x) => x.seasonId === season.id && ms(x.end) === d && x.personId !== pick.id
      && current.people.find((p) => p.id === x.personId)?.role === role && !current.shifts.some((y) => y.after === x.id));
    const shift: Shift = { id: uid(), seasonId: season.id, personId: pick.id, start: toWhen(d), end: toWhen(end), ...(from_ ? { after: from_.id } : {}) };
    added.push(shift);
    current = { ...current, shifts: [...current.shifts, shift] };
    busyOf(pick).push([d, end]);
    worked.set(pick.id, (worked.get(pick.id) ?? 0) + (end - d));
    skipUntil = d; // the same day may still have another open seat
  }
  return added;
}
