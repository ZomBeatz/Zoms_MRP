import type { AppData, Booking, FlightLimit } from "./types";
import { bookings } from "./bookings";
import { hoursPerDay } from "./program";
import { dayAt, ms } from "./time";
import { jobLimits } from "./limits";

/**
 * Pilot flight hours, for the "most flight hours in so many days" limits (Settings › Hitches and days off),
 * such as 100 in 30, 300 in 90 and 1,000 in 365. A pilot on a season flies its aircraft's flight hours a day
 * shared by the pilots on it: two aircraft at 6 hours with two pilots is 6 hours each. A shift with the
 * hours actually flown typed in uses those instead, spread over its days.
 */

/** The limits that are on. */
export const flightLimits = (data: AppData) => (data.settings.flightLimits ?? []).filter((l) => l.hours > 0 && l.days > 0);

/** Flight hours a day for each pilot on a season. */
export function pilotHoursPerDay(data: AppData, b: Pick<Booking, "aircraftIds" | "pilotsNeeded">) {
  const hours = b.aircraftIds.reduce((t, id) => {
    const a = data.aircraft.find((x) => x.id === id);
    return t + (a ? hoursPerDay(data, a) : 0);
  }, 0);
  return b.pilotsNeeded > 0 ? hours / b.pilotsNeeded : 0;
}

/** Flying at `perDay` hours a day over [a, b), on a job whose flight-hour limits are `limits` (missing: Settings'). */
export interface FlightSpan { a: number; b: number; perDay: number; limits?: FlightLimit[] }

/** The first limit these spans go over, with how much they fly in that window. */
export function overLimit(data: AppData, spans: FlightSpan[], limits: FlightLimit[] = flightLimits(data)) {
  for (const l of limits) {
    const most = mostFlown(spans, l.days);
    if (most.hours > l.hours + 1e-6) return { limit: l, ...most };
  }
  return null;
}

/** A pilot's flying: each shift with its hours a day. */
export function flightSpans(data: AppData, personId: string): FlightSpan[] {
  const seasons = new Map(bookings(data).map((b) => [b.id, b]));
  const out: FlightSpan[] = [];
  for (const s of data.shifts) {
    const b = seasons.get(s.seasonId);
    if (s.personId !== personId || !b || b.status === "Cancelled") continue;
    const days = Math.max(1, Math.round((ms(s.end) - ms(s.start)) / 86_400_000));
    const perDay = s.flown != null && s.flown >= 0 ? s.flown / days : pilotHoursPerDay(data, b);
    if (perDay > 0) out.push({ a: ms(s.start), b: ms(s.end), perDay, limits: jobLimits(data, b).flightLimits });
  }
  return out;
}

const DAY_MS = 86_400_000;

/** Hours flown in [from, to): whole days, so a day the clocks change still counts as one. */
const flownIn = (spans: FlightSpan[], from: number, to: number) =>
  spans.reduce((t, s) => t + Math.round(Math.max(0, Math.min(s.b, to) - Math.max(s.a, from)) / DAY_MS) * s.perDay, 0);

/** The most hours flown in any `days` days, and when that window starts. The busiest window starts on a shift's first day or ends on its last. */
export function mostFlown(spans: FlightSpan[], days: number): { hours: number; at: number } {
  let best = { hours: 0, at: 0 };
  for (const s of spans)
    for (const from of [s.a, dayAt(s.b, -days)]) {
      const hours = flownIn(spans, from, dayAt(from, days));
      if (hours > best.hours + 1e-9) best = { hours, at: from };
    }
  return { hours: Math.round(best.hours * 10) / 10, at: best.at };
}

/**
 * The first flight-hour limit a pilot's flying goes over, checking each job's limits (its schedule
 * limitations', else Settings') against all their flying: a pilot on an EMS job and a fire job is held to both.
 */
export function pilotOverLimit(data: AppData, spans: FlightSpan[]) {
  const sets = new Map<string, FlightLimit[]>();
  for (const s of spans) {
    const ls = s.limits ?? flightLimits(data);
    sets.set(JSON.stringify(ls), ls);
  }
  for (const ls of sets.values()) {
    const over = overLimit(data, spans, ls);
    if (over) return over;
  }
  return null;
}
