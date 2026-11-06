import type { FlightLimit } from "./types";

/**
 * The crew planner: how few pilots can staff a job, and the rotation that does it.
 *
 * A job is some aircraft over some days. Each aircraft is staffed so many hours a day (12, 24…), which
 * with the longest duty day and the rest needed between duty days sets how many pilots it needs on
 * each day (24 hours with 14-hour duty days is two). The rules are the most days on in a row, the
 * fewest days off between, travel days at each end of a hitch, and any flight-hour limits.
 *
 * Pilots can only fly the aircraft types they're rated on, and a night pilot may need a night
 * qualification, so the seats are split into groups (one per type, and night seats apart) and each
 * group is planned on its own. Within a group, pilots are planned on one rotation, each starting a
 * little after the last, so the same number are on every day. Over a long job no plan can use fewer
 * pilots in a group than these averages allow:
 *   seats × (days on + days off) ÷ days on      (everyone needs their days off)
 *   flight hours a day × window ÷ flight limit  (everyone can only fly so much)
 * The planner finds the smallest number that really works for the job's length, which can be fewer
 * than the averages on a short job, and trims hitch ends nobody needs.
 */

export interface PlanAircraft {
  label: string;
  /** The aircraft type, so only pilots rated on it count. Empty = any pilot. */
  type?: string;
  /** Hours a day it has to be staffed (12, 24…). 0 = not staffed. */
  staffedHours: number;
  /** Flight hours it flies on a day. */
  flightHours: number;
  /** One pilot each day flies the night and needs to be night qualified. */
  night?: boolean;
  /** What a flight hour costs, for the job's cost. */
  hourCost?: number | null;
}

export interface PlanInput {
  aircraft: PlanAircraft[];
  /** How many days the job runs. */
  days: number;
  maxDaysOn: number;
  minDaysOff: number;
  /** The longest duty day; a longer staffed day takes more pilots. 0 = no limit. */
  maxDutyHours: number;
  /** Fewest hours off between duty days; a duty day can be no longer than 24 minus this. 0 = no limit. */
  minRestHours?: number;
  /** Days travelling at each end of a hitch: they count as days on, not days off, and cover no seat. */
  travelDays?: number;
  /** The most flight hours a pilot can fly in any so-many days (100 in 30, 1,000 in 365). */
  flightLimits: FlightLimit[];
}

/** One group of seats only some pilots can take (a type, or its night seats), planned on its own. */
export interface GroupPlan {
  /** "Bell 412", "Bell 412 · night", or "" for any pilot. */
  key: string;
  type: string;
  night: boolean;
  /** Pilots on duty each day in this group. */
  seats: number;
  pilots: number;
  /** The rotation: days on a seat, days off (travel not counted in either). */
  on: number;
  off: number;
  /** Each pilot's hitches on a seat, as [first day, day after the last) counted from the job's first day (0). */
  hitches: [number, number][][];
  /** Flight hours each pilot on duty flies in a day (the flying shared by everyone on). */
  hoursPerPilotDay: number;
  /** For each flight limit, the most hours any pilot flies in one of its windows. */
  mostFlight: { limit: FlightLimit; hours: number }[];
  /** The averages above, before rounding up; the flight one is for the limit that needs the most. */
  restFloor: number;
  flightFloor: { limit: FlightLimit; pilots: number } | null;
  /** What sets the number: the seats themselves, days off, or flight hours. */
  limitedBy: "seats" | "rest" | "flight";
  /** Pilot-days on a seat in the plan. */
  dutyDays: number;
}

export interface CrewPlan {
  groups: GroupPlan[];
  /** Pilots on duty each day, across the aircraft. */
  seats: number;
  seatsByAircraft: number[];
  pilots: number;
  /** The longest a pilot's duty day can be (duty and rest rules together). */
  longestDuty: number;
  travelDays: number;
  /** Pilot-days away, travel included (what crew is paid for), and flight hours over the job. */
  dutyDays: number;
  flightHours: number;
}

export type PlanResult = { ok: true; plan: CrewPlan } | { ok: false; reason: string };

/** The longest duty day allowed by the duty limit and the rest needed before the next one. */
export const longestDuty = (maxDutyHours: number, minRestHours = 0) =>
  Math.min(maxDutyHours > 0 ? maxDutyHours : 24, minRestHours > 0 ? 24 - minRestHours : 24);

/** Pilots each aircraft needs on a day: its staffed hours split into duty days no longer than allowed. */
export const seatsFor = (a: PlanAircraft, maxDutyHours: number, minRestHours = 0) => {
  const most = longestDuty(maxDutyHours, minRestHours);
  return a.staffedHours <= 0 || most <= 0 ? 0 : Math.max(1, Math.ceil(a.staffedHours / most - 1e-9));
};

/** "Bell 412 · night" */
export const groupKey = (type: string, night: boolean) => [type, night ? "night" : ""].filter(Boolean).join(" · ");

const MAX_PILOTS = 150;

/** The most days on duty in any `w` days, for a pilot on `on` days of every `cycle`. */
function mostOnIn(on: number, cycle: number, w: number) {
  if (on >= cycle) return w;
  if (cycle === Infinity) return Math.min(on, w);
  const full = Math.floor(w / cycle);
  return full * on + Math.min(on, w - full * cycle);
}

/**
 * Pilots on `on` days in every `cycle`, the i-th starting at day floor(i × cycle ÷ n) of it, with the
 * whole pattern shifted by `phase`. Their hitches over the job, cut at its first and last day.
 */
function pattern(n: number, on: number, cycle: number, phase: number, days: number): [number, number][][] {
  return patternAt(Array.from({ length: n }, (_, i) => Math.floor((i * cycle) / n) - phase), on, cycle, days);
}

/** Pilots on `on` days in every `cycle`, each starting at their own offset. */
function patternAt(offsets: number[], on: number, cycle: number, days: number): [number, number][][] {
  const out: [number, number][][] = [];
  for (const start of offsets) {
    const mine: [number, number][] = [];
    // Hitches that start at start + k × cycle and touch [0, days).
    for (let s = start - Math.ceil((start + on) / cycle) * cycle; s < days; s += cycle) {
      const a = Math.max(0, s), b = Math.min(days, s + on);
      if (b > a) mine.push([a, b]);
    }
    out.push(mine);
  }
  return out;
}

const countOn = (hitches: [number, number][][], days: number) => {
  const c = new Array<number>(days).fill(0);
  for (const h of hitches) for (const [a, b] of h) for (let d = a; d < b; d++) c[d]++;
  return c;
};

/** Shorten hitches at either end where more pilots are on than the seats need. */
function trimSpare(hitches: [number, number][][], days: number, seats: number) {
  const c = countOn(hitches, days);
  for (const h of hitches)
    for (const span of h) {
      while (span[1] > span[0] && c[span[1] - 1] > seats) c[--span[1]]--;
      while (span[1] > span[0] && c[span[0]] > seats) c[span[0]++]--;
    }
  return hitches.map((h) => h.filter(([a, b]) => b > a));
}

/**
 * A plan for exactly `n` pilots, or null if they can't do it. `ok` says whether a rotation keeps
 * under the flight limit.
 */
function tryPilots(n: number, seats: number, days: number, maxOn: number, minOff: number, ok: (on: number, off: number) => boolean) {
  // A job no longer than a hitch: everyone stays for all of it.
  if (days <= maxOn && n === seats && ok(days, minOff))
    return { on: days, off: minOff, hitches: Array.from({ length: n }, (): [number, number][] => [[0, days]]) };
  // Longest hitches first (fewest crew changes); within that, the most rest that still works.
  for (let on = Math.min(maxOn, days); on >= 1; on--) {
    // A hitch this long breaks a flight limit however much rest follows it.
    if (!ok(on, Infinity)) continue;
    let best: { off: number; phase: number } | null = null;
    // At least a day off, or two hitches in a row would be one long one.
    for (let off = Math.max(1, minOff); off <= minOff + 3 * days; off++) {
      const cycle = on + off;
      // On a long job too few on average can't work; a short one is just tried.
      if (days >= 2 * cycle && n * on < seats * cycle) break;
      // Breaking a flight limit is quick to see; more rest may fix it, so try the next.
      if (!ok(on, off)) continue;
      // Over a job at least a cycle long every phase comes round, so only a short job tries them all.
      const phases = days >= cycle ? 1 : cycle;
      let found = -1;
      for (let phase = 0; phase < phases && found < 0; phase++)
        if (countOn(pattern(n, on, cycle, phase, days), days).every((x) => x >= seats)) found = phase;
      if (found < 0) break; // more rest only makes it worse
      best = { off, phase: found };
      if (days < cycle && best) break; // nobody comes back: more rest means nothing
    }
    if (best) return { on, off: best.off, hitches: pattern(n, on, on + best.off, best.phase, days) };
  }
  return null;
}

/**
 * On a short job (under two rotations) evenly spread starts aren't always best: a pilot can do a short
 * first hitch and come back for the end. Try every set of starts for a few pilots on the longest hitches
 * and least rest (trimmed afterwards to what's needed).
 */
function tryStarts(n: number, seats: number, days: number, on: number, off: number) {
  const cycle = on + off;
  let tries = 0;
  const offsets: number[] = [];
  const walk = (from: number): [number, number][][] | null => {
    if (offsets.length === n) {
      const h = patternAt(offsets, on, cycle, days);
      return countOn(h, days).every((x) => x >= seats) ? h : null;
    }
    for (let o = from; o < cycle && tries < 100_000; o++) {
      tries++;
      offsets.push(o);
      const h = walk(o);
      offsets.pop();
      if (h) return h;
    }
    return null;
  };
  const h = walk(0);
  return h ? { on, off, hitches: h } : null;
}

/** One group's plan: the fewest pilots for these seats and this flying on the rules. */
function planGroup(seats: number, flying: number, days: number, maxOn: number, minOff: number, limits: FlightLimit[]):
  Omit<GroupPlan, "key" | "type" | "night"> | string {
  const perDay = flying / seats;
  // Each flight limit caps how many days a pilot can be on in any of its windows.
  const caps = limits.map((l) => ({ l, days: perDay > 0 ? Math.floor(l.hours / perDay + 1e-9) : Infinity }));
  const tight = caps.find((c) => c.days < 1);
  if (tight) return `Each pilot would fly ${round1(perDay)} hours a day, more than the ${tight.l.hours} allowed in ${tight.l.days} days.`;
  const ok = (on: number, off: number) => caps.every((c) => mostOnIn(on, on + off, Math.min(c.l.days, days)) <= c.days);

  const restFloor = (seats * (maxOn + minOff)) / maxOn;
  // Over a job shorter than a limit's window, a pilot can only fly that limit's hours in all of it.
  const floors = limits.map((l) => ({ limit: l, pilots: (flying * Math.min(l.days, days)) / l.hours }));
  const flightFloor = floors.length ? floors.reduce((a, b) => (b.pilots > a.pilots ? b : a)) : null;

  // Start at what no plan can beat, so a tight limit doesn't try every smaller crew first: each pilot
  // is on at most so many of the job's days, and flies at most each limit's hours in its window.
  const least = Math.max(
    seats,
    Math.ceil((seats * days) / mostOnIn(maxOn, maxOn + Math.max(1, minOff), days) - 1e-9),
    ...floors.map((f) => Math.ceil(f.pilots - 1e-9)),
    // Pilots work whole days, so each is on at most the whole days a limit allows in its window.
    ...caps.filter((c) => c.days < Infinity).map((c) => Math.ceil((seats * Math.min(c.l.days, days)) / Math.min(c.days, c.l.days, days) - 1e-9)),
  );
  if (least > MAX_PILOTS) return `It would take more than ${MAX_PILOTS} pilots on these rules.`;
  for (let n = least; n <= MAX_PILOTS; n++) {
    const off1 = Math.max(1, minOff);
    const found = tryPilots(n, seats, days, maxOn, minOff, ok)
      ?? (days < 2 * (maxOn + off1) && days > maxOn && n <= 6 && ok(maxOn, off1) ? tryStarts(n, seats, days, maxOn, off1) : null);
    if (!found) continue;
    const hitches = trimSpare(found.hitches, days, seats);
    const duty = hitches.reduce((t, h) => t + h.reduce((u, [a, b]) => u + b - a, 0), 0);
    const limitedBy: GroupPlan["limitedBy"] = n === seats ? "seats" : flightFloor && flightFloor.pilots > restFloor ? "flight" : "rest";
    return {
      seats, pilots: n, on: found.on, off: found.off, hitches, hoursPerPilotDay: perDay,
      mostFlight: limits.map((l) => ({ limit: l, hours: round1(Math.max(0, ...hitches.map((h) => mostIn(h, Math.min(l.days, days)))) * perDay) })),
      restFloor, flightFloor, limitedBy, dutyDays: duty,
    };
  }
  return `It would take more than ${MAX_PILOTS} pilots on these rules.`;
}

export function planCrew(input: PlanInput): PlanResult {
  const days = Math.round(input.days);
  if (!(days > 0)) return { ok: false, reason: "Pick the job's dates." };
  const travel = Math.max(0, Math.round(input.travelDays ?? 0));
  // Travel days count as days on and come out of the time on a seat; they don't count as rest.
  const maxOn = Math.round(input.maxDaysOn) - 2 * travel;
  if (maxOn < 1) return { ok: false, reason: `With ${travel} travel days each way, a ${input.maxDaysOn}-day hitch leaves no days on the job.` };
  const minOff = Math.max(0, Math.round(input.minDaysOff));
  const rest = input.minRestHours ?? 0;
  const most = longestDuty(input.maxDutyHours, rest);
  if (most <= 0) return { ok: false, reason: `${rest} hours of rest leaves no time for a duty day.` };
  const seatsByAircraft = input.aircraft.map((a) => seatsFor(a, input.maxDutyHours, rest));
  const seats = seatsByAircraft.reduce((t, x) => t + x, 0);
  if (!seats) return { ok: false, reason: "Add an aircraft and how many hours a day it's staffed." };
  const limits = input.flightLimits.filter((l) => l.hours > 0 && l.days > 0);

  // Split the seats into groups: each type, with a night aircraft's night pilot apart. Flying is shared by seat.
  const groups = new Map<string, { type: string; night: boolean; seats: number; flying: number }>();
  const add = (type: string, night: boolean, n: number, flying: number) => {
    const key = groupKey(type, night);
    const g = groups.get(key) ?? { type, night, seats: 0, flying: 0 };
    g.seats += n;
    g.flying += flying;
    groups.set(key, g);
  };
  input.aircraft.forEach((a, i) => {
    const n = seatsByAircraft[i];
    if (!n) return;
    const type = (a.type ?? "").trim(), per = Math.max(0, a.flightHours) / n;
    if (a.night) {
      add(type, true, 1, per);
      if (n > 1) add(type, false, n - 1, per * (n - 1));
    } else add(type, false, n, per * n);
  });

  const out: GroupPlan[] = [];
  for (const [key, g] of [...groups].sort((x, y) => x[0].localeCompare(y[0]))) {
    // Between two stretches on a seat: travel home, the days off, travel back.
    const r = planGroup(g.seats, g.flying, days, maxOn, minOff + 2 * travel, limits);
    if (typeof r === "string") return { ok: false, reason: groups.size > 1 ? `${key || "Any pilot"}: ${r}` : r };
    out.push({ key, type: g.type, night: g.night, ...r, off: r.off - 2 * travel });
  }
  const hitchCount = out.reduce((t, g) => t + g.hitches.reduce((u, h) => u + h.length, 0), 0);
  return {
    ok: true,
    plan: {
      groups: out, seats, seatsByAircraft, pilots: out.reduce((t, g) => t + g.pilots, 0), longestDuty: most, travelDays: travel,
      dutyDays: out.reduce((t, g) => t + g.dutyDays, 0) + hitchCount * 2 * travel,
      flightHours: input.aircraft.reduce((t, a, i) => t + (seatsByAircraft[i] ? Math.max(0, a.flightHours) * days : 0), 0),
    },
  };
}

/** The most days on duty in any `w` days, for a list of hitches. */
function mostIn(h: [number, number][], w: number) {
  let most = 0;
  for (const [a] of h) {
    let t = 0;
    for (const [x, y] of h) t += Math.max(0, Math.min(y, a + w) - Math.max(x, a));
    most = Math.max(most, t);
  }
  return most;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** One way to change the answer by changing a rule. */
export interface WhatIf { text: string; pilots: number }

/**
 * What it would take to need one pilot fewer (the smallest change to each rule that does it), and what
 * one more pilot would buy (the most days off it allows).
 */
export function whatIfs(input: PlanInput, plan: CrewPlan, budgetMs = 250): WhatIf[] {
  const out: WhatIf[] = [];
  // It runs as you type, so it gives up on what it hasn't tried once its time is up.
  const until = Date.now() + budgetMs;
  const pilots = (i: PlanInput) => {
    if (Date.now() > until) return Infinity;
    const r = planCrew(i);
    return r.ok ? r.plan.pilots : Infinity;
  };
  const fewer = plan.pilots - 1;
  if (fewer >= plan.seats) {
    for (let off = input.minDaysOff - 1; off >= 1; off--)
      if (pilots({ ...input, minDaysOff: off }) <= fewer) {
        out.push({ text: `${off} days off instead of ${input.minDaysOff}`, pilots: fewer });
        break;
      }
    for (let on = input.maxDaysOn + 1; on <= Math.min(input.maxDaysOn + 30, input.days + 2 * (input.travelDays ?? 0)); on++)
      if (pilots({ ...input, maxDaysOn: on }) <= fewer) {
        out.push({ text: `hitches up to ${on} days instead of ${input.maxDaysOn}`, pilots: fewer });
        break;
      }
    if (input.travelDays)
      for (let t = input.travelDays - 1; t >= 0; t--)
        if (pilots({ ...input, travelDays: t }) <= fewer) {
          out.push({ text: t ? `${t} travel days each way instead of ${input.travelDays}` : "no travel days", pilots: fewer });
          break;
        }
    input.flightLimits.forEach((l, i) => {
      if (!plan.groups.some((g) => g.limitedBy === "flight" && g.flightFloor?.limit === l)) return;
      for (let h = Math.ceil(l.hours / 5) * 5 + 5; h <= l.hours * 2; h += 5)
        if (pilots({ ...input, flightLimits: input.flightLimits.map((x, j) => (j === i ? { ...x, hours: h } : x)) }) <= fewer) {
          out.push({ text: `${h} flight hours in ${l.days} days instead of ${l.hours}`, pilots: fewer });
          break;
        }
    });
  }
  // One more pilot: as much rest as it allows, keeping the hitch length.
  const more = plan.pilots + 1;
  const on = Math.max(...plan.groups.map((g) => g.on)) + 2 * plan.travelDays;
  let off = input.minDaysOff;
  while (off < input.minDaysOff + 60 && pilots({ ...input, minDaysOff: off + 1, maxDaysOn: on }) <= more) off++;
  // Only worth saying when someone comes back for a second hitch.
  if (off > input.minDaysOff && on + off < input.days) out.push({ text: `${off} days off after each ${on}-day hitch`, pilots: more });
  return out;
}
