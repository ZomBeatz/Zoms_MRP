import type { AppData, Shift } from "./types";
import { dayAt, ms, toWhen } from "./time";

/**
 * Dragging the end of a shift on the schedule, like trimming a clip. A handover (one person's shift
 * ending the day the next one's starts, on the same job and in the same role) moves together, so the
 * seat stays covered: a roll edit. Shifts keep at least one day, and pilots stay inside their season
 * (maintainers can come early or stay late for pre-flight).
 */

export type Edge = "start" | "end";

/**
 * The shift on the other side of a handover at this edge, if any: the one linked as taking over (Fill
 * links them), else the only one that meets it there. With two people swapping the same day and no link,
 * it's not a guess: there's no partner and only the dragged shift moves.
 */
export function partnerOf(data: AppData, shift: Shift, edge: Edge): Shift | undefined {
  const role = data.people.find((p) => p.id === shift.personId)?.role;
  const meets = data.shifts.filter((s) => s.id !== shift.id && s.seasonId === shift.seasonId
    && data.people.find((p) => p.id === s.personId)?.role === role
    && (edge === "end" ? s.start === shift.end : s.end === shift.start));
  const linked = edge === "end" ? meets.find((s) => s.after === shift.id) : meets.find((s) => s.id === shift.after);
  if (linked) return linked;
  // An unlinked one only counts when it's the only one, and isn't linked to someone else.
  const free = meets.filter((s) => (edge === "end" ? !s.after : !data.shifts.some((x) => x.after === s.id)));
  return meets.length === 1 && free.length === 1 ? free[0] : undefined;
}

/** How many days the edge can move each way, keeping both shifts at least a day and pilots in their season. */
export function trimRange(data: AppData, shift: Shift, edge: Edge, partner?: Shift): [number, number] {
  const season = data.seasons.find((x) => x.id === shift.seasonId);
  const pilot = data.people.find((p) => p.id === shift.personId)?.role === "Pilot";
  const days = (a: number, b: number) => Math.round((b - a) / 86_400_000);
  const a = ms(shift.start), b = ms(shift.end);
  let lo = -Infinity, hi = Infinity;
  if (edge === "end") {
    lo = -(days(a, b) - 1); // keep a day
    if (pilot && season) hi = days(b, ms(season.end));
    if (partner) hi = Math.min(hi, days(ms(partner.start), ms(partner.end)) - 1);
  } else {
    hi = days(a, b) - 1;
    if (pilot && season) lo = -days(ms(season.start), a);
    if (partner) lo = Math.max(lo, -(days(ms(partner.start), ms(partner.end)) - 1));
  }
  return [lo, hi];
}

/** The plan with the edge moved `by` days (kept inside the range), and its handover partner unless `solo`. */
export function trim(data: AppData, shiftId: string, edge: Edge, by: number, solo = false): { data: AppData; moved: number; partner?: Shift } {
  const shift = data.shifts.find((s) => s.id === shiftId);
  if (!shift) return { data, moved: 0 };
  const partner = solo ? undefined : partnerOf(data, shift, edge);
  const [lo, hi] = trimRange(data, shift, edge, partner);
  const moved = Math.max(lo, Math.min(hi, Math.round(by)));
  if (!moved) return { data, moved: 0, partner };
  const at = toWhen(dayAt(ms(edge === "end" ? shift.end : shift.start), moved));
  const shifts = data.shifts.map((s) =>
    s.id === shift.id ? { ...s, [edge]: at }
    : partner && s.id === partner.id ? { ...s, [edge === "end" ? "start" : "end"]: at }
    : s);
  return { data: { ...data, shifts }, moved, partner };
}

/** Move a whole shift `by` days (pilots stay inside their season). Its handovers aren't moved. */
export function move(data: AppData, shiftId: string, by: number): { data: AppData; moved: number } {
  const shift = data.shifts.find((s) => s.id === shiftId);
  if (!shift) return { data, moved: 0 };
  const season = data.seasons.find((x) => x.id === shift.seasonId);
  const pilot = data.people.find((p) => p.id === shift.personId)?.role === "Pilot";
  const days = (a: number, b: number) => Math.round((b - a) / 86_400_000);
  let lo = -Infinity, hi = Infinity;
  if (pilot && season) {
    lo = -days(ms(season.start), ms(shift.start));
    hi = days(ms(shift.end), ms(season.end));
  }
  const moved = Math.max(Math.min(lo, 0), Math.min(Math.max(hi, 0), Math.round(by)));
  if (!moved) return { data, moved: 0 };
  const shifts = data.shifts.map((s) => (s.id === shiftId ? { ...s, start: toWhen(dayAt(ms(s.start), moved)), end: toWhen(dayAt(ms(s.end), moved)) } : s));
  return { data: { ...data, shifts }, moved };
}
