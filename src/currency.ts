import type { AppData, Person } from "./types";
import { bookings } from "./bookings";
import { seasonTypes } from "./rotation";
import { DAY, ms } from "./time";

/**
 * Pilot currency: how long since a pilot last flew each aircraft type. It comes from their past shifts on
 * jobs with that type, or a "last flew" date typed on their Ratings (flying done elsewhere), whichever is
 * later. Settings › Hitches and days off sets how many days count as current (0 turns it off).
 */

/** The last midnight-after-a-day the pilot flew this type, before `before`, or null if there's no record. */
export function lastFlew(data: AppData, p: Person, type: string, before: number): number | null {
  let last: number | null = null;
  const typed = p.flew?.[type];
  if (typed) {
    const t = ms(`${typed}T00:00`) + DAY;
    if (t <= before) last = t;
  }
  const seasons = new Map(bookings(data).map((b) => [b.id, b]));
  for (const s of data.shifts) {
    if (s.personId !== p.id) continue;
    const b = seasons.get(s.seasonId);
    if (!b || b.status === "Cancelled" || !seasonTypes(data, b).includes(type)) continue;
    const end = Math.min(ms(s.end), before);
    if (ms(s.start) < before && (last === null || end > last)) last = end;
  }
  return last;
}

/** Days since they last flew it (at `at`), or null with no record. */
export function daysSince(data: AppData, p: Person, type: string, at: number): number | null {
  const last = lastFlew(data, p, type, at);
  return last === null ? null : Math.round((at - last) / DAY);
}

/** Whether currency is checked at all, and the most days allowed. */
export const currencyDays = (data: AppData) => data.settings.currencyDays ?? 0;

/** Not current on any of these types at `at`: every one with a record is older than the limit. Null if fine or unknown. */
export function staleOn(data: AppData, p: Person, types: string[], at: number): { type: string; days: number } | null {
  const limit = currencyDays(data);
  if (!limit || p.role !== "Pilot") return null;
  const rated = types.filter((t) => p.quals.includes(t));
  const known = rated.map((type) => ({ type, days: daysSince(data, p, type, at) })).filter((x): x is { type: string; days: number } => x.days !== null);
  if (!known.length || known.some((x) => x.days <= limit)) return null;
  return known.sort((a, b) => a.days - b.days)[0];
}
