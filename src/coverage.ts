import { format } from "date-fns";
import { validUntil, type AppData, type Mission, type Person, type Season, type Shift } from "./types";
import { bookings } from "./bookings";
import { downSpan, missingEquipment, statusWords } from "./aircraftTypes";
import { slotSpan, slotsOf, tailSpan } from "./slots";
import { fmtRotation, onRotationFor, seasonSeats, seasonTypes } from "./rotation";
import { jobLimits, ruleSetOf, rulesFor } from "./limits";
import { dueList } from "./program";
import { currencyDays, staleOn } from "./currency";
import { flightSpans, pilotHoursPerDay, pilotOverLimit } from "./flight";
import { DAY, dateToStart, dayAt, fmtDay, fmtDays, fmtRange, ms, overlaps, plural, toWhen } from "./time";

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
  /** The shift, course or time off it's about, so it can be opened right where it's fixed. */
  shiftId?: string;
  trainingId?: string;
  timeOffId?: string;
  /** The other half of a clash (a second season, shift or job). */
  otherSeasonId?: string;
  otherShiftId?: string;
  otherJobId?: string;
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
  /** Maintainer gaps, by the season's choice of when they're needed. `days`: days a week still to book (some days a week). */
  maintainerGaps: { a: number; b: number; short: number; days?: number }[];
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
    maintainerGaps: maintainerGaps(m, gaps("Maintainer", m.maintainersNeeded)),
    covered: to > from ? 1 - gapTime / (to - from) : 1,
  };
}

/** Of the times with too few maintainers, the ones that count by when the season needs them. */
function maintainerGaps(m: Season, all: { a: number; b: number; short: number }[]): MissionCoverage["maintainerGaps"] {
  const need = m.maintainerNeed ?? { mode: "always", days: 0 };
  const from = ms(m.start), to = ms(m.end);
  const n = Math.max(1, Math.round(need.days || 1));
  if (need.mode === "oncall" || !all.length) return need.mode === "oncall" ? [] : all;
  if (need.mode === "ends") {
    // Set-up at the start and tear-down at the end: only those days count.
    const windows: [number, number][] = [[from, Math.min(to, dayAt(from, n))], [Math.max(from, dayAt(to, -n)), to]];
    if (windows[1][0] <= windows[0][1]) windows.splice(0, 2, [from, to]);
    return all.flatMap((g) => windows.filter(([a, b]) => g.a < b && g.b > a).map(([a, b]) => ({ ...g, a: Math.max(g.a, a), b: Math.min(g.b, b) })));
  }
  if (need.mode === "weekly") {
    // Each week from the first day: at least `n` days (or the whole week, if shorter) with enough on.
    const out: MissionCoverage["maintainerGaps"] = [];
    for (let w = from; w < to; w = dayAt(w, 7)) {
      const end = Math.min(to, dayAt(w, 7));
      const days: number[] = [];
      for (let d = w; d < end; d = dayAt(d, 1)) days.push(d);
      const open = days.filter((d) => all.some((g) => g.a < dayAt(d, 1) && g.b > d));
      const missing = Math.min(n, days.length) - (days.length - open.length);
      if (missing > 0) out.push({ a: open[0], b: end, short: m.maintainersNeeded, days: missing });
    }
    return out;
  }
  return all;
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

/** "Alex hasn't done Hoist rescue", or for a certificate "Alex has no Second class medical on record". */
const notDone = (name: string, t: { name: string; kind?: string }) => (!t.kind || t.kind === "course" ? `${name} hasn't done ${t.name}` : `${name} has no ${t.name} on record`);

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
      issues.push({ id: `time-${m.id}`, severity: "danger", title: `“${m.name}” ends before it starts`, detail: "Open the client and fix its times.", at: from, seasonId: m.id });
      continue;
    }
    const ground = m.kind === "ground";
    const tails = ground ? [] : m.aircraftIds.map((id) => aircraft.get(id)).filter((a): a is NonNullable<typeof a> => !!a);
    const lines = ground ? [] : slotsOf(data, m);
    if (!ground && !lines.length && m.status !== "Planned") {
      // A planned job can wait for its aircraft; once it's confirmed it needs one.
      issues.push({ id: `noac-${m.id}`, severity: "warn", title: `“${m.name}” has no aircraft`, detail: "Pick an aircraft for this job.", at: from, seasonId: m.id });
    }
    // A confirmed job with aircraft still to pick (the type is known, the tail isn't yet).
    if (m.status !== "Planned")
      for (const x of lines.filter((l) => !l.aircraftId)) {
        const [a, b] = slotSpan(m, x);
        issues.push({ id: `slot-${m.id}-${x.id}`, severity: "warn", title: `“${m.name}” still needs ${x.type ? `a ${x.type}` : "an aircraft"}`, detail: `${range(a, b)}. Pick the tail.`, at: a, seasonId: m.id });
      }
    for (const ac of tails) {
      // The days this tail is on the job (its own line's dates, or the whole season).
      const [from, to] = tailSpan(m, ac.id);
      // Equipment the mission needs (a hoist, a bucket) that this tail doesn't have.
      const missing = missingEquipment(data, ac, m.requiredEquipmentIds);
      if (missing.length)
        issues.push({ id: `equip-${m.id}-${ac.id}`, severity: "warn", title: `${ac.tail} doesn't have the ${missing.map((e) => e.name.toLowerCase()).join(" or ")} “${m.name}” needs`,
          detail: `Fit it and tick it on ${ac.tail}, or pick an aircraft that has it.`, at: from, seasonId: m.id, aircraftId: ac.id });
      // Down for maintenance, AOG or retired while it's booked.
      const out = downSpan(ac);
      if (out && overlaps(from, to, out[0], out[1])) {
        const back = ac.backOn && ac.status !== "Retired" ? ` It's expected back ${fmtDay(ms(dateToStart(ac.backOn)))}.` : "";
        issues.push({ id: `acstat-${m.id}-${ac.id}`, severity: "danger", title: `${ac.tail} is ${statusWords(ac.status)} during “${m.name}”`, detail: `${back ? back.trim() + " " : ""}Pick another aircraft or change its status.`, at: Math.max(from, out[0]), seasonId: m.id, aircraftId: ac.id });
      }
      for (const j of data.jobs) {
        if (j.aircraftId === ac.id && j.grounds && !j.done && overlaps(from, to, ms(j.start), ms(j.end)))
          issues.push({ id: `acjob-${m.id}-${j.id}`, severity: "danger", title: `${ac.tail} is in maintenance during “${m.name}”`, detail: `“${j.title}”, ${fmtRange(j.start, j.end)}. Move the job or pick another aircraft.`, at: Math.max(from, ms(j.start)), seasonId: m.id, aircraftId: ac.id, jobId: j.id });
      }
      for (const o of missions) {
        if (o.id > m.id && o.kind !== "ground" && o.aircraftIds.includes(ac.id) && overlaps(from, to, ...tailSpan(o, ac.id)))
          issues.push({ id: `acdbl-${m.id}-${o.id}-${ac.id}`, severity: "danger", title: `${ac.tail} is booked twice`, detail: `“${m.name}” and “${o.name}” overlap. Pick another aircraft for one of them.`, at: Math.max(from, tailSpan(o, ac.id)[0]), seasonId: m.id, aircraftId: ac.id, otherSeasonId: o.id });
      }
    }

    // Duty days longer than allowed (schedule limitations, else Settings), when the season says how long they are.
    const lim = jobLimits(data, m);
    const from_ = ruleSetOf(data, m)?.name ? `“${ruleSetOf(data, m)!.name}”` : "Settings";
    const maxDuty = lim.maxDutyHours;
    if (maxDuty && m.dutyHours && m.dutyHours > maxDuty)
      issues.push({ id: `dutyh-${m.id}`, severity: "danger", at: from, seasonId: m.id, title: `Duty days on “${m.name}” are ${m.dutyHours} hours`,
        detail: `The most is ${maxDuty} hours (${from_}). Shorten the duty day or add crew to split it.` });
    // Rest between duty days: a duty day this long leaves too few hours off before the next.
    const rest = lim.minRestHours;
    if (rest && m.dutyHours && 24 - m.dutyHours < rest && !(maxDuty && m.dutyHours > maxDuty))
      issues.push({ id: `resth-${m.id}`, severity: "danger", at: from, seasonId: m.id, title: `Only ${24 - m.dutyHours} hours off between duty days on “${m.name}”`,
        detail: `Duty days are ${m.dutyHours} hours and the rest between should be at least ${rest} (${from_}). Shorten the duty day or add crew to split it.` });
    // Flight hours a day for each pilot, over what these jobs allow.
    const perPilot = m.kind === "ground" ? 0 : Math.round(pilotHoursPerDay(data, m) * 10) / 10;
    if (lim.maxFlightHoursPerDay && perPilot > lim.maxFlightHoursPerDay)
      issues.push({ id: `flyday-${m.id}`, severity: "warn", at: from, seasonId: m.id, title: `Pilots on “${m.name}” fly about ${perPilot} hours a day`,
        detail: `The most is ${lim.maxFlightHoursPerDay} (${from_}). Add a pilot to share the flying, or plan fewer hours a day.` });
    // Hitches shorter than these jobs allow (not counting ones cut short by the job's own first or last day).
    if (lim.minDaysOn)
      for (const s of data.shifts.filter((x) => x.seasonId === m.id)) {
        const days = Math.round((ms(s.end) - ms(s.start)) / DAY);
        if (days < lim.minDaysOn && ms(s.start) > from && ms(s.end) < to) {
          const who = people.get(s.personId);
          if (who) issues.push({ id: `shorthitch-${s.id}`, severity: "warn", at: ms(s.start), seasonId: m.id, personId: who.id, shiftId: s.id,
            title: `${who.name}'s hitch on “${m.name}” is ${plural(days, "day")}`, detail: `${fmtRange(s.start, s.end)}. Hitches here are at least ${plural(lim.minDaysOn, "day")} (${from_}).` });
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
      issues.push({
        id: `mgap-${m.id}-${g.a}`, severity: "warn", at: g.a, seasonId: m.id,
        title: g.days ? `“${m.name}” needs a maintainer ${plural(g.days, "more day")} the week of ${format(g.a, "MMM d")}` : `“${m.name}” needs ${plural(g.short, "maintainer")} on call`,
        detail: g.days ? `${m.maintainerNeed?.days ?? 1} days a week are needed. Add a maintainer shift that week.` : `${range(g.a, g.b)}.`,
      });

    if (tails.length) {
      const seats = seasonSeats(data, m);
      const pilotSpans = data.shifts
        .filter((s) => s.seasonId === m.id && people.get(s.personId)?.role === "Pilot")
        .map((s) => [ms(s.start), ms(s.end)] as [number, number]);
      const crowded = coverageSteps(from, to, pilotSpans).filter((s) => s.n > seats);
      for (const s of crowded)
        issues.push({ id: `seats-${m.id}-${s.a}`, severity: "warn", title: `${plural(s.n, "pilot")} on “${m.name}”, with ${plural(seats, "pilot seat")}`, detail: `${tails.map((a) => a.tail).join(", ")}, ${range(s.a, s.b)}.`, at: s.a, seasonId: m.id });
    }
  }

  // Down past the day it was expected back: the status needs updating (or the date moved).
  for (const ac of data.aircraft) {
    if ((ac.status === "AOG" || ac.status === "In maintenance") && ac.backOn && ms(dateToStart(ac.backOn)) <= dayAt(Date.now(), 0))
      issues.push({ id: `acback-${ac.id}`, severity: "warn", title: `${ac.tail} was expected back ${fmtDay(ms(dateToStart(ac.backOn)))}`, detail: `It's still ${statusWords(ac.status)}. Mark it airworthy, or move the date.`, at: ms(dateToStart(ac.backOn)), aircraftId: ac.id });
  }

  // Shifts: qualifications, outside the mission, time off.
  for (const s of data.shifts) {
    const m = missionById.get(s.seasonId);
    const p = people.get(s.personId);
    if (!m || !p || !active(m)) continue;
    // Qualified on at least one of the job's aircraft types.
    const types = seasonTypes(data, m);
    if (types.length && !types.some((t) => p.quals.includes(t)))
      issues.push({ id: `qual-${s.id}`, severity: "danger", title: `${p.name} isn't qualified on the ${types.join(" or ")}`, detail: `Shift on “${m.name}”, ${fmtRange(s.start, s.end)}. Swap them out or add the qualification.`, at: ms(s.start), seasonId: m.id, personId: p.id, shiftId: s.id });
    // Booked on their own off days.
    if (p.rotation && !onRotationFor(p, ms(s.start), ms(s.end)))
      issues.push({ id: `offrot-${s.id}`, severity: "warn", title: `${p.name} is booked on their days off`, detail: `Shift on “${m.name}”, ${fmtRange(s.start, s.end)}. Their rotation is ${fmtRotation(p.rotation)}.`, at: ms(s.start), seasonId: m.id, personId: p.id, shiftId: s.id });
    // Maintainers often start before the mission (pre-flight) and stay after; pilots fly inside it.
    if (p.role === "Pilot" && (ms(s.start) < ms(m.start) || ms(s.end) > ms(m.end)))
      issues.push({ id: `outside-${s.id}`, severity: "warn", title: `${p.name}'s shift runs outside “${m.name}”`, detail: `The shift is ${fmtRange(s.start, s.end)}; the job is ${fmtRange(m.start, m.end)}.`, at: ms(s.start), seasonId: m.id, personId: p.id, shiftId: s.id });
    if (!(ms(s.end) > ms(s.start)))
      issues.push({ id: `stime-${s.id}`, severity: "danger", title: `${p.name}'s shift ends before it starts`, detail: `On “${m.name}”.`, at: ms(s.start), seasonId: m.id, personId: p.id, shiftId: s.id });
  }
  for (const j of data.jobs) {
    if (j.done) continue;
    const ac = aircraft.get(j.aircraftId);
    for (const pid of j.maintainerIds) {
      const p = people.get(pid);
      if (p && ac && !p.quals.includes(ac.type))
        issues.push({ id: `jqual-${j.id}-${pid}`, severity: "warn", title: `${p.name} isn't qualified on the ${ac.type}`, detail: `Work order “${j.title}” on ${ac.tail}.`, at: ms(j.start), personId: p.id, jobId: j.id, aircraftId: ac.id });
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
        issues.push({ id: `dbl-${p.id}-${x.a}-${y.a}`, severity: "danger", title: `${p.name} is booked twice`, detail: `“${x.label}” and “${y.label}” overlap, ${range(Math.max(x.a, y.a), Math.min(x.b, y.b))}.`, at: Math.max(x.a, y.a), personId: p.id,
          seasonId: x.seasonId, shiftId: x.shiftId, jobId: x.jobId, otherSeasonId: y.seasonId, otherShiftId: y.shiftId, otherJobId: y.jobId });
      }
    for (const t of data.timeOff.filter((t) => t.personId === p.id && !t.soft))
      for (const d of duty)
        if (overlaps(d.a, d.b, ms(t.start), ms(t.end)))
          issues.push({ id: `off-${t.id}-${d.a}`, severity: "danger", title: `${p.name} is off${t.reason ? ` (${t.reason})` : ""}`, detail: `But booked on “${d.label}”, ${range(d.a, d.b)}.`, at: d.a, personId: p.id, seasonId: d.seasonId, shiftId: d.shiftId, jobId: d.jobId, timeOffId: t.id });

    // Hitches: bookings with fewer than the minimum days off between them count as one stretch on. Each
    // booking brings its own limits (Settings, its mission and season, the person's own); the safest wins.
    const ruleOf = (d: (typeof duty)[number]) => rulesFor(data, p, d.seasonId ? missionById.get(d.seasonId) : null);
    let first = -1, last = -1, most = maxDaysOn, rest = minDaysOff;
    // The booking that takes the stretch past the limit: where someone else can be rotated in.
    let over: (typeof duty)[number] | undefined;
    const days = (a: number, b: number) => Math.round(((b - a) / DAY) * 10) / 10;
    const flush = () => {
      // Rounded, so a day that changes the clock (23 or 25 hours) still counts as one day.
      const n = days(first, last);
      if (first >= 0 && n > most)
        issues.push({ id: `duty-${p.id}-${first}`, severity: "danger", title: `${p.name} is on for ${fmtDays(n)} in a row`, detail: `${range(first, last)}. The most is ${plural(most, "day")}. Rotate someone in.`, at: first, personId: p.id,
          seasonId: over?.seasonId, shiftId: over?.shiftId, jobId: over?.jobId });
    };
    for (const d of duty) {
      const r = ruleOf(d);
      const needOff = Math.max(rest, r.minDaysOff);
      if (first >= 0 && days(last, d.a) < needOff) {
        if (d.a > last)
          issues.push({ id: `rest-${p.id}-${last}`, severity: "warn", title: `${p.name} gets only ${fmtDays((d.a - last) / DAY)} off`, detail: `Before “${d.label}”. The minimum is ${plural(needOff, "day")}.`, at: d.a, personId: p.id, seasonId: d.seasonId, shiftId: d.shiftId, jobId: d.jobId });
        most = Math.min(most, r.maxDaysOn);
        rest = needOff;
        if (!over && days(first, Math.max(last, d.b)) > most) over = d;
        last = Math.max(last, d.b);
      } else {
        flush();
        first = d.a;
        last = d.b;
        most = r.maxDaysOn;
        rest = r.minDaysOff;
        over = days(d.a, d.b) > most ? d : undefined;
      }
    }
    flush();

    // Flight hours: the most in any so-many days (Settings), from the flying planned on their shifts.
    const flew = p.role === "Pilot" ? pilotOverLimit(data, flightSpans(data, p.id)) : null;
    if (flew) {
      const { limit: fl, at } = flew;
      const shift = data.shifts.find((s) => s.personId === p.id && ms(s.end) > at && ms(s.start) < dayAt(at, fl.days));
      issues.push({ id: `fly-${p.id}-${at}`, severity: "danger", title: `${p.name} flies about ${flew.hours} hours in ${fl.days} days`,
        detail: `${range(at, dayAt(at, fl.days))}. The most is ${fl.hours} hours. Rotate someone in.`, at, personId: p.id, seasonId: shift?.seasonId, shiftId: shift?.id });
    }
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
        title: st.state === "missing" ? notDone(p.name, t) : st.state === "expired" ? `${p.name}'s ${t.name} has run out` : `${p.name}'s ${t.name} runs out during “${m.name}”`,
        detail: `${t.everyone && !(m.requiredTrainingIds ?? []).includes(tid) ? `Every ${p.role.toLowerCase()} needs it` : `“${m.name}” needs it`}.${st.expires ? ` It ${st.state === "expired" ? "ran out" : "runs out"} ${fmtDate(st.expires)}.` : ""} Swap them out or record the qualification.`,
        at: ms(s.start), seasonId: m.id, personId: p.id, shiftId: s.id, trainingId: tid,
      });
    }
  }
  // Currency: a pilot booked on a type they haven't flown in too long (only when there's a record to go on).
  if (currencyDays(data))
    for (const s of data.shifts) {
      const m = missionById.get(s.seasonId);
      const p = people.get(s.personId);
      if (!m || !p || !active(m) || ms(s.end) <= Date.now()) continue;
      const stale = staleOn(data, p, seasonTypes(data, m), ms(s.start));
      if (stale)
        issues.push({
          id: `curr-${s.id}`, severity: "warn", at: ms(s.start), seasonId: m.id, personId: p.id, shiftId: s.id,
          title: `${p.name} hasn't flown the ${stale.type} in ${stale.days} days`,
          detail: `Before “${m.name}”, ${fmtRange(s.start, s.end)}. Current means within ${currencyDays(data)} days (Settings). Swap them out, plan a refresher flight, or record when they last flew it.`,
        });
    }

  // Training people need for the missions they work: run out (and no renewal booked), or running out soon.
  const now = Date.now();
  for (const p of data.people) {
    for (const [tid, needers] of neededTraining(data, p)) {
      const t = trainings.get(tid);
      if (!t) continue;
      const done = p.training.filter((r) => r.trainingId === tid && ms(`${r.completed}T00:00`) <= now);
      const booked = p.training.some((r) => r.trainingId === tid && ms(`${r.completed}T00:00`) > now);
      if (booked || done.some((r) => !validUntil(r))) continue;
      const latest = done.map((r) => validUntil(r)!).sort().at(-1);
      const missions = needers.length ? needers.map((m) => `“${m.name}”`).join(", ") : p.role === "Pilot" ? "Every pilot" : "Every maintainer";
      const needs = needers.length > 1 ? "need" : "needs";
      if (!latest || ms(`${latest}T00:00`) <= now)
        issues.push({ id: `lapsed-${p.id}-${tid}`, severity: "warn", title: latest ? `${p.name}'s ${t.name} has run out` : notDone(p.name, t),
          detail: `${missions} ${needs} it, so they can't be booked ${needers.length ? "there" : "on any job"} until it's on record.`, at: now, personId: p.id, trainingId: tid });
      else if (ms(`${latest}T00:00`) <= dayAt(now, data.settings.expiryWarningDays))
        issues.push({ id: `renew-${p.id}-${tid}`, severity: "warn", title: `${p.name}'s ${t.name} runs out ${fmtDate(latest)}`,
          detail: `${missions} ${needs} it. Book the renewal before then.`, at: ms(`${latest}T00:00`), personId: p.id, trainingId: tid });
    }
  }

  // Inspections from the maintenance programs: overdue, or due soon and not planned.
  if (data.settings.maintenance?.enabled)
    for (const due of dueList(data)) {
      if (due.state !== "overdue" && due.state !== "soon") continue;
      const late = due.state === "overdue";
      const when = due.at !== null ? format(due.at, "MMM d, yyyy") : "";
      issues.push({
        id: `mxdue-${due.aircraft.id}-${due.item.id}`, severity: late ? "danger" : "warn", at: due.at ?? Date.now(), aircraftId: due.aircraft.id,
        title: late ? `${due.aircraft.tail}'s ${due.item.title} is overdue` : `${due.aircraft.tail}'s ${due.item.title} is due ${when}`,
        detail: (due.by === "hours" ? `At about ${due.hoursDue} flight hours${due.hoursNow !== null ? ` (about ${due.hoursNow} now)` : ""}` : `${due.item.everyMonths} months since it was last done`) + `${late ? `, ${when}` : ""}. Plan it in a free stretch before then.`,
      });
    }

  const ignored = new Set((data.ignored ?? []).map((x) => x.id));
  return issues.filter((i) => !ignored.has(i.id)).sort((a, b) => (a.severity === b.severity ? a.at - b.at : a.severity === "danger" ? -1 : 1));
}

/** The ignored problems that are still there (fixed ones drop off the list). */
export function ignoredIssues(data: AppData) {
  if (!data.ignored?.length) return [];
  const live = new Set(findIssues({ ...data, ignored: [] }).map((i) => i.id));
  return data.ignored.filter((x) => live.has(x.id));
}

/** Pilots or maintainers free for the whole of [a, b], qualified on the type, best first. */
export function whoCanCover(data: AppData, role: Person["role"], a: number, b: number, types: string[] | string | null, except: Shift["id"][] = [], required: string[] = [], missionId?: string) {
  const anyOf = types === null ? [] : Array.isArray(types) ? types : [types];
  return data.people
    .filter((p) => p.role === role)
    .map((p) => {
      const busy = dutyOf(data, p.id).some((d) => !except.includes(d.shiftId ?? "") && overlaps(a, b, d.a, d.b));
      const off = data.timeOff.some((t) => t.personId === p.id && !t.soft && overlaps(a, b, ms(t.start), ms(t.end)));
      const qualified = !anyOf.length || anyOf.some((t) => p.quals.includes(t));
      const onRot = onRotationFor(p, a, b);
      const trained = required.every((id) => {
        const t = data.trainings.find((x) => x.id === id);
        return !t || (t.appliesTo !== "Both" && t.appliesTo !== role) || trainingStatus(p, id, a, b).state === "ok";
      });
      const regular = !!missionId && p.missionIds.includes(missionId);
      // Flown the type recently enough (or no record to say otherwise).
      const current = !staleOn(data, p, anyOf, a);
      return { person: p, busy, off, qualified, trained, current, regular, onRotation: onRot, ok: !busy && !off && qualified && trained && current && onRot };
    })
    .sort((x, y) => Number(y.ok) - Number(x.ok) || Number(y.regular) - Number(x.regular) || Number(y.qualified && y.trained) - Number(x.qualified && x.trained) || x.person.name.localeCompare(y.person.name));
}

const fmtDate = (d: string) => format(new Date(`${d}T00:00`), "MMM d, yyyy");

/** The training a mission needs from someone in this role. */
export function requiredTraining(data: AppData, m: Pick<Mission, "requiredTrainingIds"> & Partial<Pick<Season, "aircraftIds" | "slots">>, role?: Person["role"]): string[] {
  if (!role) return [...new Set(m.requiredTrainingIds ?? [])];
  // With a role: also what everyone in it needs, whatever the job (a pilot certificate, a medical), and, on a
  // job, what its aircraft types need (a type course).
  const ids = [...new Set([...(m.requiredTrainingIds ?? []), ...data.trainings.filter((t) => t.everyone).map((t) => t.id),
    ...(m.aircraftIds ? typeTraining(data, seasonTypes(data, m as Pick<Season, "aircraftIds" | "slots">)) : [])])];
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
  const applies = (id: string) => { const t = data.trainings.find((x) => x.id === id); return !!t && (t.appliesTo === "Both" || t.appliesTo === p.role); };
  const need = new Map<string, Mission[]>();
  const add = (id: string, by?: Pick<Mission, "id" | "name">) => {
    if (!applies(id)) return;
    const list = need.get(id) ?? [];
    if (by && !list.some((x) => x.id === by.id)) list.push(by as Mission);
    need.set(id, list);
  };
  // Needed by everyone in their role: no client to name.
  for (const t of data.trainings) if (t.everyone) add(t.id);
  // What the clients they work ask for.
  for (const m of data.missions) if (p.missionIds.includes(m.id)) for (const id of m.requiredTrainingIds ?? []) add(id, m);
  // What the jobs they're booked on ask for (a job's own requirements, its aircraft types').
  const booked = new Set(data.shifts.filter((s) => s.personId === p.id).map((s) => s.seasonId));
  for (const b of bookings(data)) {
    if (!booked.has(b.id) || !active(b) || ms(b.end) <= now) continue;
    for (const id of requiredTraining(data, b, p.role)) if (!data.trainings.find((x) => x.id === id)?.everyone) add(id, { id: b.missionId, name: b.name });
  }
  // What the aircraft types they're rated on ask for, named by the type.
  for (const t of data.aircraftTypes ?? []) if (p.quals.includes(t.name)) for (const id of t.requiredTrainingIds ?? []) add(id, { id: `type:${t.id}`, name: `the ${t.name}` });
  return need;
}

/** Qualifications the given aircraft types ask of everyone who flies or works on them. */
export function typeTraining(data: AppData, types: string[]): string[] {
  return [...new Set((data.aircraftTypes ?? []).filter((t) => types.includes(t.name)).flatMap((t) => t.requiredTrainingIds ?? []))];
}

export type TrainingState = "ok" | "missing" | "expired" | "runs-out";

/** Whether a person's training covers [a, b): done, and not run out before b. */
export function trainingStatus(p: Person, trainingId: string, a: number, b: number): { state: TrainingState; expires?: string } {
  const recs = p.training.filter((r) => r.trainingId === trainingId && ms(`${r.completed}T00:00`) <= a);
  if (!recs.length) return { state: "missing" };
  if (recs.some((r) => !validUntil(r))) return { state: "ok" };
  const latest = recs.map((r) => validUntil(r)!).sort().at(-1)!;
  const end = ms(`${latest}T00:00`);
  if (end <= a) return { state: "expired", expires: latest };
  if (end < b) return { state: "runs-out", expires: latest };
  return { state: "ok", expires: latest };
}
