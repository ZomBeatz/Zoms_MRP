import type { AppData, Person, Role, Season } from "./types";
import { bookings } from "./bookings";
import { dutyOf, findIssues, missionCoverage } from "./coverage";
import { fillSeason } from "./fill";
import { DAY, ms } from "./time";

/**
 * Making the most of the crew over a period (the Balance page): how busy everyone is, and a fresh plan
 * that rebuilds the shifts inside the period on the same rules as Fill the schedule (ratings, training,
 * time off, personal rotations, rest between hitches), with jobs and people that are locked left alone.
 */

export interface Locks {
  /** Seasons whose shifts stay exactly as they are. */
  seasons: Set<string>;
  /** People whose shifts stay as they are, and who aren't given new ones. */
  people: Set<string>;
}

const live = (s: Season) => s.status !== "Cancelled" && s.status !== "Done";
const clip = (a: number, b: number, from: number, to: number) => Math.max(0, Math.min(b, to) - Math.max(a, from));
/** Flying and confirmed jobs are crewed first, then planned ones, earliest first. */
const rank = { Flying: 0, Confirmed: 1, Planned: 2, Done: 3, Cancelled: 4 } as const;

/** The seasons running at some point in the period. */
export const seasonsIn = (data: AppData, from: number, to: number) =>
  bookings(data).filter((b) => live(b) && ms(b.start) < to && ms(b.end) > from).sort((a, b) => rank[a.status] - rank[b.status] || ms(a.start) - ms(b.start));

/**
 * A new plan for the period. Seasons in `fresh` (the ones whose crew size changed, or all of them) start
 * over: their unlocked shifts inside the period come off. Then every unlocked season's open seats are filled
 * in turn, sharing the crew between them. Shifts outside the period, or running over its edges, stay.
 */
export function rebalance(data: AppData, from: number, to: number, locks: Locks, fresh: Set<string> | "all" = "all"): AppData {
  const open = seasonsIn(data, from, to).filter((b) => !locks.seasons.has(b.id));
  const ids = new Set(open.filter((b) => fresh === "all" || fresh.has(b.id)).map((b) => b.id));
  let d: AppData = {
    ...data,
    shifts: data.shifts.filter((s) => !ids.has(s.seasonId) || locks.people.has(s.personId) || ms(s.start) < from || ms(s.end) > to),
  };
  for (const b of open)
    for (const role of ["Pilot", "Maintainer"] as Role[]) {
      const season = d.seasons.find((x) => x.id === b.id)!;
      const added = fillSeason(d, season, role, role === "Pilot" ? season.pilotRotation : season.maintainerRotation,
        { ...d.settings.rules, window: [from, to], skip: locks.people });
      if (added.length) d = { ...d, shifts: [...d.shifts, ...added] };
    }
  return d;
}

export interface PersonLoad {
  person: Person;
  /** Days booked in the period (shifts and maintenance). */
  on: number;
  /** Days of time off in the period. */
  off: number;
  /** Share of the days they could work that they're booked: 0 to 1 (or more when booked over leave). */
  share: number;
}

export interface BalanceStats {
  /** Seat-days with nobody in them, pilots and maintainers, inside the period. */
  openDays: number;
  /** Rule problems starting in the period, not counting open seats (those are `openDays`): all, and the serious ones. */
  problems: number;
  serious: number;
  people: PersonLoad[];
  /** The busiest person's days on. */
  busiest: number;
}

export function balanceStats(data: AppData, from: number, to: number): BalanceStats {
  const days = (to - from) / DAY;
  let open = 0;
  for (const b of seasonsIn(data, from, to)) {
    const cov = missionCoverage(data, b);
    // A "days a week" gap counts the days still to book that week, not the whole week.
    const gaps: { a: number; b: number; short: number; days?: number }[] = [...cov.pilotGaps, ...cov.maintainerGaps];
    for (const g of gaps) open += g.days ? g.days : (clip(g.a, g.b, from, to) / DAY) * g.short;
  }
  const issues = findIssues(data).filter((i) => i.at >= from && i.at < to && !/^[pm]gap-/.test(i.id));
  const people = data.people.map((p): PersonLoad => {
    const on = dutyOf(data, p.id).reduce((t, x) => t + clip(x.a, x.b, from, to), 0) / DAY;
    const off = data.timeOff.filter((t) => t.personId === p.id).reduce((t, x) => t + clip(ms(x.start), ms(x.end), from, to), 0) / DAY;
    const can = Math.max(1, days - off);
    return { person: p, on, off, share: on / can };
  });
  return {
    openDays: Math.round(open),
    problems: issues.length,
    serious: issues.filter((i) => i.severity === "danger").length,
    people,
    busiest: Math.round(Math.max(0, ...people.map((x) => x.on))),
  };
}
