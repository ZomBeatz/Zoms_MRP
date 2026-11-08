import type { AircraftSlot, AppData, Season } from "./types";
import { ms, toWhen } from "./time";

/**
 * A season's aircraft, line by line: the type each needs, the tail once it's picked, and its own dates
 * when it doesn't fly the whole season. Seasons saved before lines existed have one line per tail.
 */

export function slotsOf(data: Pick<AppData, "aircraft">, s: Pick<Season, "aircraftIds" | "slots">): AircraftSlot[] {
  if (s.slots) return s.slots;
  return s.aircraftIds.map((id) => ({ id: `slot-${id}`, type: data.aircraft.find((a) => a.id === id)?.type ?? "", aircraftId: id }));
}

/** The dates a line flies, as [first midnight, midnight after the last], inside its season. */
export function slotSpan(s: Pick<Season, "start" | "end">, slot: Pick<AircraftSlot, "start" | "end">): [number, number] {
  const a = ms(s.start), b = ms(s.end);
  return [Math.max(a, slot.start ? ms(slot.start) : a), Math.min(b, slot.end ? ms(slot.end) : b)];
}

/** The dates one tail is on a season: its line's, or the whole season. */
export function tailSpan(s: Pick<Season, "start" | "end" | "slots">, aircraftId: string): [number, number] {
  const slot = s.slots?.find((x) => x.aircraftId === aircraftId);
  return slot ? slotSpan(s, slot) : [ms(s.start), ms(s.end)];
}

/** A season (or booking) with its dates narrowed to one tail's, for drawing that tail's row. */
export function onTail<S extends Pick<Season, "start" | "end" | "slots">>(s: S, aircraftId: string): S {
  const [a, b] = tailSpan(s, aircraftId);
  return a === ms(s.start) && b === ms(s.end) ? s : { ...s, start: toWhen(a), end: toWhen(b) };
}

/** The season with these lines, and `aircraftIds` set to the tails picked on them. */
export const withSlots = <S extends Season>(s: S, slots: AircraftSlot[]): S =>
  ({ ...s, slots, aircraftIds: [...new Set(slots.map((x) => x.aircraftId).filter((id): id is string => !!id))] });

/** Lines still waiting for a tail. */
export const openSlots = (data: Pick<AppData, "aircraft">, s: Pick<Season, "aircraftIds" | "slots">) => slotsOf(data, s).filter((x) => !x.aircraftId);
