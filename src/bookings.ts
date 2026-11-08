import type { AppData, Booking, Mission, Season } from "./types";

/**
 * Every season with its mission's name, look and training folded in. Cached per data object
 * (the store makes a new one on every change), so pages and checks can call it freely.
 */
const cache = new WeakMap<AppData, Booking[]>();
export function bookings(data: AppData): Booking[] {
  let out = cache.get(data);
  if (!out) {
    const missions = new Map(data.missions.map((m) => [m.id, m]));
    out = data.seasons.flatMap((s) => {
      const m = missions.get(s.missionId);
      return m ? [booking(m, s)] : [];
    });
    cache.set(data, out);
  }
  return out;
}

export const booking = (m: Mission, s: Season): Booking => ({
  ...s, name: m.name, contact: m.contact, location: m.location, requiredTrainingIds: m.requiredTrainingIds, requiredEquipmentIds: m.requiredEquipmentIds ?? [], color: m.color, pattern: m.pattern, kind: m.kind ?? "flight",
});

/** The seasons of one mission, earliest first. */
export const seasonsOf = (data: AppData, missionId: string) =>
  data.seasons.filter((s) => s.missionId === missionId).sort((a, b) => a.start.localeCompare(b.start));
