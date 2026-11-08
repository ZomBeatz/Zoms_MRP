import type { Aircraft, AircraftType, AppData, Equipment } from "./types";
import { dateToStart, ms } from "./time";

/**
 * Aircraft types and equipment (the Types & equipment page). Tails, crew ratings and maintenance
 * programs name their type, so the list of types is kept in step with every name in use, and a
 * rename carries through to all of them.
 */

const slug = (s: string) => s.toLowerCase().replace(/\W+/g, "-").replace(/^-|-$/g, "");

/** Every type name used by a tail, a rating or a maintenance program. */
export const typeNamesInUse = (d: Pick<AppData, "aircraft" | "people" | "programs">) =>
  [...new Set([...d.aircraft.map((a) => a.type), ...d.people.flatMap((p) => p.quals ?? []), ...(d.programs ?? []).map((x) => x.type)].map((t) => t?.trim()).filter((t): t is string => !!t))];

/** The data with a type for every name in use (one typed on a tail or a person gets added). Unchanged if none is missing. */
export function withTypes(d: AppData): AppData {
  const have = new Set((d.aircraftTypes ?? []).map((t) => t.name));
  const missing = typeNamesInUse(d).filter((n) => !have.has(n));
  if (!missing.length && d.aircraftTypes) return d;
  const types = [...(d.aircraftTypes ?? [])];
  for (const name of missing) {
    const seats = d.aircraft.find((a) => a.type === name)?.seats ?? 2;
    let id = `ty-${slug(name) || "type"}`;
    while (types.some((t) => t.id === id)) id += "-2";
    types.push({ id, name, seats, equipmentIds: [], notes: "" });
  }
  return { ...d, aircraftTypes: types };
}

/** Rename a type everywhere it's named: its tails, crew ratings, last-flown dates and maintenance program. */
export function renameType(d: AppData, from: string, to: string): AppData {
  if (from === to || !from) return d;
  const swap = (t: string) => (t === from ? to : t);
  return {
    ...d,
    aircraft: d.aircraft.map((a) => (a.type === from ? { ...a, type: to } : a)),
    people: d.people.map((p) => {
      if (!p.quals.includes(from) && !(p.flew && from in p.flew)) return p;
      const flew = p.flew && from in p.flew ? Object.fromEntries(Object.entries(p.flew).map(([k, v]) => [swap(k), v])) : p.flew;
      return { ...p, quals: [...new Set(p.quals.map(swap))], ...(flew ? { flew } : {}) };
    }),
    programs: d.programs.map((x) => (x.type === from ? { ...x, type: to } : x)),
  };
}

/** The type record for a tail, if there is one. */
export const typeOf = (d: Pick<AppData, "aircraftTypes">, a: Pick<Aircraft, "type">): AircraftType | undefined =>
  (d.aircraftTypes ?? []).find((t) => t.name === a.type);

/** Equipment a tail of this type can carry: what the type lists, or everything when it lists none. */
export function equipmentFor(d: Pick<AppData, "aircraftTypes" | "equipment">, typeName: string): Equipment[] {
  const t = (d.aircraftTypes ?? []).find((x) => x.name === typeName);
  const all = d.equipment ?? [];
  return t && t.equipmentIds.length ? all.filter((e) => t.equipmentIds.includes(e.id)) : all;
}

/** Equipment a mission needs that this tail doesn't have. */
export const missingEquipment = (d: Pick<AppData, "equipment">, a: Pick<Aircraft, "equipmentIds">, needs: string[] | undefined): Equipment[] =>
  (needs ?? []).filter((id) => !(a.equipmentIds ?? []).includes(id)).map((id) => (d.equipment ?? []).find((e) => e.id === id)).filter((e): e is Equipment => !!e);

// ---------------------------------------------------------------- status

/**
 * When a tail's status keeps it from flying, as [first midnight, midnight it flies again]; an open end is
 * ±Infinity. In maintenance and AOG run from `statusSince` to `backOn`; retired is for good. null: it can fly.
 */
export function downSpan(a: Pick<Aircraft, "status" | "statusSince" | "backOn">): [number, number] | null {
  if (a.status === "Retired") return [-Infinity, Infinity];
  if (a.status !== "AOG" && a.status !== "In maintenance") return null;
  const from = a.statusSince ? ms(dateToStart(a.statusSince)) : -Infinity;
  const to = a.backOn ? ms(dateToStart(a.backOn)) : Infinity;
  return [from, Math.max(from, to)];
}

/** "AOG", "in maintenance" or "retired", for sentences. */
export const statusWords = (s: Aircraft["status"]) => (s === "AOG" ? "AOG" : s.toLowerCase());

