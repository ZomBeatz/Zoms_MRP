import type { AppData, Equipment, JobDefaults, RuleSet, Training, WorkType } from "./types";
import { uid } from "./time";

/**
 * Prebuilt qualifications, equipment, schedule limitations and lines of business, connected: a line of
 * business names the qualifications, equipment and schedule limitations its jobs usually need, so adding
 * it adds them too, and a new client of that line starts with them. Everything is a starting point to
 * check against your operations specifications and contracts, and stays editable once added.
 */

type Qual = Omit<Training, "id" | "notes"> & { key: string };

/** Qualifications, by a key the lines of business refer to. Months 0: never runs out. */
export const QUALIFICATIONS: Qual[] = [
  { key: "cpl", name: "Commercial pilot certificate", nickname: "CPL", kind: "certificate", validMonths: 0, appliesTo: "Pilot", everyone: true },
  { key: "ir", name: "Instrument rating", nickname: "IR", kind: "certificate", validMonths: 0, appliesTo: "Pilot" },
  { key: "medical", name: "Medical certificate", nickname: "Medical", kind: "medical", validMonths: 12, endOfMonth: true, appliesTo: "Pilot", everyone: true, privileges: "commercial" },
  { key: "293", name: "Competency check (135.293)", nickname: "293", kind: "check", validMonths: 12, endOfMonth: true, appliesTo: "Pilot", everyone: true },
  { key: "299", name: "Line check (135.299)", nickname: "299", kind: "check", validMonths: 12, endOfMonth: true, appliesTo: "Pilot" },
  { key: "297", name: "Instrument proficiency check (135.297)", nickname: "IPC", kind: "check", validMonths: 6, endOfMonth: true, appliesTo: "Pilot" },
  { key: "ground", name: "Recurrent ground training", nickname: "Ground", kind: "course", validMonths: 12, endOfMonth: true, appliesTo: "Pilot", everyone: true },
  { key: "crm", name: "Crew resource management", nickname: "CRM", kind: "course", validMonths: 12, appliesTo: "Both" },
  { key: "nvg", name: "Night vision goggles (NVG)", nickname: "NVG", kind: "course", validMonths: 12, appliesTo: "Pilot" },
  { key: "iimc", name: "Inadvertent IMC recovery", nickname: "IIMC", kind: "course", validMonths: 12, appliesTo: "Pilot" },
  { key: "hems", name: "Air ambulance (HEMS) training", nickname: "HEMS", kind: "course", validMonths: 12, appliesTo: "Pilot" },
  { key: "mountain", name: "Mountain flying", nickname: "Mountain", kind: "course", validMonths: 12, appliesTo: "Pilot" },
  { key: "huet", name: "Over water and HUET", nickname: "HUET", kind: "course", validMonths: 36, appliesTo: "Both" },
  { key: "hoist", name: "Hoist rescue", nickname: "Hoist", kind: "course", validMonths: 12, appliesTo: "Pilot" },
  { key: "longline", name: "Long line and vertical reference", nickname: "Long line", kind: "course", validMonths: 12, appliesTo: "Pilot" },
  { key: "extload", name: "External load operations", nickname: "Ext load", kind: "course", validMonths: 12, appliesTo: "Pilot" },
  { key: "bucket", name: "Fire bucket operations", nickname: "Bucket", kind: "course", validMonths: 12, appliesTo: "Pilot" },
  { key: "survival", name: "Survival and cold weather", nickname: "Survival", kind: "course", validMonths: 24, appliesTo: "Both" },
  { key: "dg", name: "Dangerous goods awareness", nickname: "DG", kind: "course", validMonths: 24, appliesTo: "Both" },
  { key: "ap", name: "Mechanic certificate (A&P)", nickname: "A&P", kind: "certificate", validMonths: 0, appliesTo: "Maintainer", everyone: true },
  { key: "ia", name: "Inspection authorization", nickname: "IA", kind: "certificate", validMonths: 24, endOfMonth: true, appliesTo: "Maintainer" },
  { key: "fuel", name: "Fuel handling", nickname: "Fuel", kind: "course", validMonths: 24, appliesTo: "Maintainer" },
];

export const EQUIPMENT: { key: string; name: string }[] = [
  { key: "bucket", name: "Fire bucket" },
  { key: "hook", name: "Cargo hook" },
  { key: "hoist", name: "Rescue hoist" },
  { key: "medical", name: "Medical interior" },
  { key: "nvis", name: "NVG-compatible cockpit" },
  { key: "floats", name: "Emergency floats" },
  { key: "searchlight", name: "Searchlight" },
  { key: "camera", name: "Camera or sensor mount" },
];

type Limits = Omit<RuleSet, "id"> & { key: string };

/** Schedule limitations: starting points for common kinds of contract. Check them against your own. */
export const LIMITATIONS: Limits[] = [
  { key: "fire", name: "Wildland fire", maxDaysOn: 14, minDaysOff: 2, maxDutyHours: 14, minRestHours: 10, maxFlightHoursPerDay: 8, flightLimits: [{ hours: 42, days: 6 }] },
  { key: "ems", name: "Air medical (EMS)", maxDaysOn: 7, minDaysOff: 7, maxDutyHours: 14, minRestHours: 10 },
  { key: "utility", name: "Utility and survey", maxDaysOn: 14, minDaysOff: 7, maxDutyHours: 14, minRestHours: 10, maxFlightHoursPerDay: 8 },
  { key: "tours", name: "Tours and charters", maxDaysOn: 6, minDaysOff: 1, maxDutyHours: 14, minRestHours: 10 },
  { key: "hangar", name: "Hangar on-call", maxDaysOn: 7, minDaysOff: 7, minDaysOn: 7 },
];

export interface LineTemplate {
  key: string;
  name: string;
  color: string;
  quals: string[];
  equipment: string[];
  limits: string;
  defaults: Omit<JobDefaults, "requiredTrainingIds" | "requiredEquipmentIds" | "ruleSetId">;
}

/** Lines of business, each with what its jobs usually need. */
export const LINES: LineTemplate[] = [
  { key: "fire", name: "Wildland fire", color: "#c2410c", quals: ["bucket", "mountain", "longline"], equipment: ["bucket", "hook"], limits: "fire",
    defaults: { pilots: 1, maintainers: 1, pilotRotation: { on: 14, off: 2 }, maintainerRotation: { on: 14, off: 2 }, dutyHours: 14 } },
  { key: "ems", name: "Air medical (EMS)", color: "#be123c", quals: ["nvg", "iimc", "hems"], equipment: ["medical", "nvis"], limits: "ems",
    defaults: { pilots: 1, maintainers: 0, pilotRotation: { on: 7, off: 7 }, dutyHours: 12 } },
  { key: "sar", name: "Search and rescue", color: "#b91c1c", quals: ["hoist", "nvg", "huet"], equipment: ["hoist", "searchlight", "nvis"], limits: "ems",
    defaults: { pilots: 2, maintainers: 1, pilotRotation: { on: 7, off: 7 }, maintainerRotation: { on: 7, off: 7 }, dutyHours: 12 } },
  { key: "utility", name: "Utilities and line patrol", color: "#0f766e", quals: ["extload", "longline"], equipment: ["hook"], limits: "utility",
    defaults: { pilots: 1, maintainers: 0, pilotRotation: { on: 14, off: 7 }, dutyHours: 12 } },
  { key: "survey", name: "Survey and research", color: "#a16207", quals: ["mountain"], equipment: ["camera"], limits: "utility",
    defaults: { pilots: 1, maintainers: 0, pilotRotation: { on: 14, off: 7 }, dutyHours: 12 } },
  { key: "tours", name: "Tours and charters", color: "#2563eb", quals: [], equipment: [], limits: "tours",
    defaults: { pilots: 1, maintainers: 0, dutyHours: 12 } },
  { key: "hangar", name: "Hangar on-call", color: "#475569", quals: ["fuel"], equipment: [], limits: "hangar",
    defaults: { ground: true, pilots: 0, maintainers: 1, maintainerNeed: { mode: "always", days: 1 }, maintainerRotation: { on: 7, off: 7 } } },
];

const same = (a: string, b?: string) => !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/** The qualification already set up under this library entry's name or nickname, if any. */
export const existingQual = (data: Pick<AppData, "trainings">, q: Qual) =>
  data.trainings.find((t) => same(t.name, q.name) || (q.nickname && same(t.nickname ?? "", q.nickname) && t.kind === q.kind));

/** Add library qualifications by key (any already set up are kept as they are). Returns the data and each key's id. */
export function addQualifications(data: AppData, keys: string[]): { data: AppData; ids: Record<string, string> } {
  const trainings = [...data.trainings];
  const ids: Record<string, string> = {};
  for (const key of keys) {
    const q = QUALIFICATIONS.find((x) => x.key === key);
    if (!q) continue;
    const have = existingQual({ trainings }, q);
    if (have) { ids[key] = have.id; continue; }
    const { key: _k, ...rest } = q;
    const t: Training = { id: `q-${key}-${uid()}`, notes: "", ...rest };
    trainings.push(t);
    ids[key] = t.id;
  }
  return { data: { ...data, trainings }, ids };
}

function addEquipment(data: AppData, keys: string[]): { data: AppData; ids: Record<string, string> } {
  const equipment = [...data.equipment];
  const ids: Record<string, string> = {};
  for (const key of keys) {
    const e = EQUIPMENT.find((x) => x.key === key);
    if (!e) continue;
    const have = equipment.find((x) => same(x.name, e.name));
    if (have) { ids[key] = have.id; continue; }
    const item: Equipment = { id: `e-${key}-${uid()}`, name: e.name, notes: "" };
    equipment.push(item);
    ids[key] = item.id;
  }
  return { data: { ...data, equipment }, ids };
}

function addLimitations(data: AppData, key: string): { data: AppData; id: string | null } {
  const l = LIMITATIONS.find((x) => x.key === key);
  if (!l) return { data, id: null };
  const sets = data.settings.ruleSets ?? [];
  const have = sets.find((x) => same(x.name, l.name));
  if (have) return { data, id: have.id };
  const { key: _k, ...rest } = l;
  const set: RuleSet = { id: `rs-${key}-${uid()}`, ...rest };
  return { data: { ...data, settings: { ...data.settings, ruleSets: [...sets, set] } }, id: set.id };
}

/**
 * Add lines of business from the library, with the qualifications, equipment and schedule limitations they
 * need (any already set up, matched by name, are used as they are). A line already there is left alone.
 */
export function addLines(data: AppData, keys: string[]): AppData {
  let d = data;
  for (const key of keys) {
    const line = LINES.find((x) => x.key === key);
    if (!line || d.workTypes.some((w) => same(w.name, line.name))) continue;
    const q = addQualifications(d, line.quals); d = q.data;
    const e = addEquipment(d, line.equipment); d = e.data;
    const l = addLimitations(d, line.limits); d = l.data;
    const w: WorkType = {
      id: `wt-${key}-${uid()}`, name: line.name, color: line.color,
      defaults: { ...line.defaults, requiredTrainingIds: line.quals.map((k) => q.ids[k]).filter(Boolean), requiredEquipmentIds: line.equipment.map((k) => e.ids[k]).filter(Boolean), ruleSetId: l.id },
    };
    d = { ...d, workTypes: [...d.workTypes, w] };
  }
  return d;
}

/** "NVG" or the name, for tight spaces; `both` gives "Night vision goggles (NVG)" style when they differ. */
export function qualLabel(t: Pick<Training, "name" | "nickname">, short = false): string {
  const n = t.nickname?.trim();
  if (!n) return t.name;
  if (short) return n;
  return t.name.toLowerCase().includes(n.toLowerCase()) ? t.name : `${t.name} (${n})`;
}
