import type { AppData, Person, PersonRotation, Rotation, Season } from "./types";
import { DAY, dayAt, plural } from "./time";

/**
 * Rotations: hitch patterns in days. A season says how its crew rotate through the job; a person can
 * have a fixed rotation of their own, and is only available on their on days.
 */

/** "21 on, 14 off". */
export const fmtRotation = (r: Rotation) => `${plural(r.on, "day")} on, ${plural(r.off, "day")} off`;

/** Is someone on their rotation on the day starting at midnight `day`? (Always, without one.) */
export function onRotation(rot: PersonRotation | null, day: number): boolean {
  if (!rot || rot.on <= 0) return true;
  const n = Math.round((day - new Date(`${rot.start}T00:00`).getTime()) / DAY);
  const cycle = rot.on + Math.max(0, rot.off);
  return ((n % cycle) + cycle) % cycle < rot.on;
}

/** Whether a person is on their rotation for every day of [a, b). */
export function onRotationFor(p: Person, a: number, b: number): boolean {
  if (!p.rotation) return true;
  for (let d = dayAt(a); d < b; d = dayAt(d, 1)) if (!onRotation(p.rotation, d)) return false;
  return true;
}

/** The stretches of [from, to) a person is off rotation, for shading on the schedule. */
export function offRotationSpans(p: Person, from: number, to: number): [number, number][] {
  if (!p.rotation) return [];
  const out: [number, number][] = [];
  for (let d = dayAt(from); d < to; d = dayAt(d, 1)) {
    if (onRotation(p.rotation, d)) continue;
    const last = out[out.length - 1];
    if (last && last[1] === d) last[1] = dayAt(d, 1);
    else out.push([d, dayAt(d, 1)]);
  }
  return out;
}

/** The aircraft types a season flies (several aircraft can mean several types). */
export const seasonTypes = (data: AppData, s: Pick<Season, "aircraftIds">): string[] =>
  [...new Set(s.aircraftIds.map((id) => data.aircraft.find((a) => a.id === id)?.type).filter((t): t is string => !!t))];

/** "N412AK, N414AK" or "No aircraft yet". */
export const seasonTails = (data: AppData, s: Pick<Season, "aircraftIds">, none = "No aircraft yet") =>
  s.aircraftIds.map((id) => data.aircraft.find((a) => a.id === id)?.tail).filter(Boolean).join(", ") || none;

/** Pilot seats across a season's aircraft. */
export const seasonSeats = (data: AppData, s: Pick<Season, "aircraftIds">) =>
  s.aircraftIds.reduce((t, id) => t + (data.aircraft.find((a) => a.id === id)?.seats ?? 0), 0);
