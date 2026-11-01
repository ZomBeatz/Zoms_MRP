import { addDays, format, isSameDay, isSameYear, isToday, isTomorrow, isYesterday, startOfDay } from "date-fns";
import type { When } from "./types";

export const HOUR = 3_600_000;

/** "2026-11-02T08:00" → milliseconds, read as local time. */
export const ms = (w: When) => new Date(w).getTime();

/** A Date (or ms) → "2026-11-02T08:00" for storage and datetime-local fields. */
export const toWhen = (d: Date | number) => format(d, "yyyy-MM-dd'T'HH:mm");

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

// The system's own clock format (12 or 24 hours), per DESIGN.md "Dates and times".
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
export const fmtTime = (w: When | number) => timeFmt.format(typeof w === "number" ? w : ms(w));

/** "Today", "Tomorrow", "Nov 2", or "Nov 2, 2027" for other years. */
export function fmtDay(d: Date | number | When): string {
  const date = new Date(typeof d === "string" ? ms(d) : d);
  if (isToday(date)) return "Today";
  if (isTomorrow(date)) return "Tomorrow";
  if (isYesterday(date)) return "Yesterday";
  return format(date, isSameYear(date, new Date()) ? "MMM d" : "MMM d, yyyy");
}

/** "Today 8:00 AM to 4:00 PM", or "Nov 2 8:00 PM to Nov 3 6:00 AM" across midnight. */
export function fmtRange(a: When, b: When): string {
  // Whole days (the usual case) read as dates; anything else shows the times too.
  if (a.endsWith("T00:00") && b.endsWith("T00:00")) return fmtDates(a, b);
  const sameDay = isSameDay(ms(a), ms(b));
  return sameDay
    ? `${fmtDay(a)} ${fmtTime(a)} to ${fmtTime(b)}`
    : `${fmtDay(a)} ${fmtTime(a)} to ${fmtDay(b)} ${fmtTime(b)}`;
}

/** "6 h", "1.5 h", "45 min". */
export function fmtHours(h: number): string {
  if (h < 1 && h > 0) return `${Math.round(h * 60)} min`;
  return `${Number(h.toFixed(1))} h`;
}

export const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

/** Two intervals overlap (touching ends don't count, so a handover at 12:00 is fine). */
export const overlaps = (a1: number, a2: number, b1: number, b2: number) => a1 < b2 && b1 < a2;

/** Merge intervals and return the parts of [from, to] they don't cover. */
export function uncovered(from: number, to: number, parts: [number, number][]): [number, number][] {
  const sorted = parts
    .map(([a, b]) => [Math.max(a, from), Math.min(b, to)] as [number, number])
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);
  const gaps: [number, number][] = [];
  let at = from;
  for (const [a, b] of sorted) {
    if (a > at) gaps.push([at, a]);
    at = Math.max(at, b);
  }
  if (at < to) gaps.push([at, to]);
  return gaps;
}

/** Midnight today, as a starting point for the schedule. */
export const today = () => startOfDay(new Date());
export { addDays, startOfDay };

export const DAY = 24 * HOUR;

/** Whole days between two midnights, counting a clock change as a normal day. */
export const daysBetween = (a: number, b: number) => Math.round((b - a) / DAY);

/** "1 day", "14 days", "3.5 days". */
export const fmtDays = (n: number) => plural(Number(n.toFixed(n < 10 ? 1 : 0)), "day");

// Date fields: a stored start is that day's midnight; a stored end is the midnight after the last day.
export const startToDate = (w: When) => w.slice(0, 10);
export const endToDate = (w: When) => format(ms(w) - 1, "yyyy-MM-dd");
export const dateToStart = (d: string): When => `${d}T00:00`;
export const dateToEnd = (d: string): When => toWhen(addDays(new Date(`${d}T00:00`), 1));

/** "Nov 2 to Nov 15 (14 days)", or "Nov 2 (1 day)". */
export function fmtDates(a: When, b: When): string {
  const first = new Date(ms(a)), last = new Date(ms(b) - 1);
  const n = daysBetween(startOfDay(first).getTime(), startOfDay(addDays(last, 1)).getTime());
  const day = (d: Date) => format(d, isSameYear(d, new Date()) ? "MMM d" : "MMM d, yyyy");
  return isSameDay(first, last) ? `${day(first)} (1 day)` : `${day(first)} to ${day(last)} (${plural(n, "day")})`;
}

/** Midnight `n` days from a day, by the calendar. */
export const dayAt = (d: Date | number, n = 0) => {
  const x = new Date(d);
  return new Date(x.getFullYear(), x.getMonth(), x.getDate() + n).getTime();
};
