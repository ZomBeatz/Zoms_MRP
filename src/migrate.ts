import type { AppData, Mission, Season, Shift } from "./types";
import { defaultSettings, emptyData } from "./sample";
import { withTypes } from "./aircraftTypes";

/**
 * Bring any older save up to today's shape, so saves from earlier versions keep opening.
 *
 * - 0.1: training lived on "areas"; it now belongs to each mission.
 * - 0.2: each mission was one dated block, and blocks with the same name were one customer's work.
 *   Now a mission holds the lasting details and its seasons hold the dates; shifts point at seasons
 *   and people's "works on" lists point at missions.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function migrate(raw: any): AppData {
  const d = { ...emptyData(), ...raw } as AppData & { areas?: { id: string; requiredTrainingIds: string[] }[] };
  d.people = (d.people ?? []).map((p) => ({ ...p, training: p.training ?? [], missionIds: p.missionIds ?? [] }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const oldBlocks = (d.missions ?? []).filter((m: any) => typeof m.start === "string") as any[];
  if (oldBlocks.length && !(raw.seasons?.length)) {
    const missions: Mission[] = [];
    const seasons: Season[] = [];
    const missionOf = new Map<string, string>(); // old block id → mission id
    for (const b of [...oldBlocks].sort((x, y) => x.start.localeCompare(y.start))) {
      const fromArea = d.areas?.find((a) => a.id === b.areaId)?.requiredTrainingIds ?? [];
      let m = missions.find((x) => x.name === b.name);
      if (!m) {
        m = {
          id: b.id, name: b.name, contact: b.contact ?? "", location: b.location ?? "", notes: "",
          requiredTrainingIds: [...new Set([...(b.requiredTrainingIds ?? []), ...fromArea])],
          color: b.color || "#2563eb", pattern: b.pattern || "solid",
        };
        missions.push(m);
      } else {
        m.requiredTrainingIds = [...new Set([...m.requiredTrainingIds, ...(b.requiredTrainingIds ?? []), ...fromArea])];
      }
      missionOf.set(b.id, m.id);
      // The season keeps the block's id, so shifts can keep pointing at it.
      seasons.push({
        id: b.id, missionId: m.id, start: b.start, end: b.end, aircraftIds: b.aircraftId ? [b.aircraftId] : [], pilotRotation: null, maintainerRotation: null,
        pilotsNeeded: b.pilotsNeeded ?? 1, maintainersNeeded: b.maintainersNeeded ?? 0, status: b.status ?? "Planned", notes: b.notes ?? "",
      });
    }
    d.missions = missions;
    d.seasons = seasons;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    d.shifts = (d.shifts ?? []).map((s: any): Shift => ({ id: s.id, seasonId: s.seasonId ?? s.missionId, personId: s.personId, start: s.start, end: s.end }));
    d.people = d.people.map((p) => ({ ...p, missionIds: [...new Set(p.missionIds.map((id) => missionOf.get(id) ?? id))] }));
  }
  d.missions = d.missions.map((m) => ({ ...m, contact: m.contact ?? "", location: m.location ?? "", notes: m.notes ?? "", color: m.color || "#2563eb", pattern: m.pattern || "solid", requiredTrainingIds: m.requiredTrainingIds ?? [] }));
  // 0.1: a season had one aircraft and no rotations.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  d.seasons = (d.seasons ?? []).map(({ aircraftId, ...x }: any) => ({
    ...x, aircraftIds: x.aircraftIds ?? (aircraftId ? [aircraftId] : []), pilotRotation: x.pilotRotation ?? null, maintainerRotation: x.maintainerRotation ?? null,
  }));
  d.people = d.people.map((p) => ({ ...p, rotation: p.rotation ?? null }));
  delete d.areas;

  // 0.2.6: aircraft types and equipment are lists of their own. Types start from every name already in use
  // (tails, crew ratings, maintenance programs), with the seats of the first tail of each.
  d.workTypes = d.workTypes ?? [];
  d.equipment = (d.equipment ?? []).map((e) => ({ ...e, notes: e.notes ?? "" }));
  d.aircraft = (d.aircraft ?? []).map((a) => ({ ...a, equipmentIds: a.equipmentIds ?? [] }));
  // 0.2.6: statuses are Airworthy, In maintenance, AOG and Retired, and each tail keeps a log.
  d.aircraft = d.aircraft.map((a) => {
    const old = a.status as string;
    const status = old === "Ready" ? "Airworthy" : old === "Grounded" ? "AOG" : a.status;
    return { ...a, status, log: a.log ?? [] };
  });
  d.missions = d.missions.map((m) => ({ ...m, requiredEquipmentIds: m.requiredEquipmentIds ?? [] }));
  d.aircraftTypes = (d.aircraftTypes ?? []).map((t) => ({ ...t, equipmentIds: t.equipmentIds ?? [], notes: t.notes ?? "", seats: t.seats || 2 }));

  // 0.2.3: maintenance programs, and settings for them.
  d.programs = d.programs ?? [];
  d.ignored = d.ignored ?? [];
  const settings = { ...defaultSettings(), ...d.settings, rules: { ...defaultSettings().rules, ...d.settings?.rules }, maintenance: { ...defaultSettings().maintenance, ...d.settings?.maintenance } };
  // 0.2.4: several flight-hour limits (the one from before, if it was set).
  const old = (d.settings as { flightLimit?: { hours: number; days: number } } | undefined)?.flightLimit;
  settings.flightLimits = Array.isArray(d.settings?.flightLimits) ? d.settings.flightLimits : old && old.hours > 0 ? [{ hours: old.hours, days: old.days || 30 }] : [];
  delete (settings as { flightLimit?: unknown }).flightLimit;
  // 0.2.6: costs and maintenance programs are off unless they're in use (older saves had programs on by default).
  if (typeof d.settings?.costs !== "boolean") {
    const inUse = (d.programs ?? []).length > 0 || d.aircraft.some((a) => a.hours || a.hourCost);
    settings.costs = d.people.some((p) => p.dayRate) || d.aircraft.some((a) => a.hourCost) || d.missions.some((m) => m.dayCharge);
    settings.maintenance = { ...settings.maintenance, enabled: !!d.settings?.maintenance?.enabled && inUse };
  }
  settings.scheduleSpan = Math.min(365, Math.max(7, Math.round(Number(settings.scheduleSpan) || 30)));
  if (!["missions", "aircraft", "people"].includes(settings.scheduleGroup)) settings.scheduleGroup = "aircraft";
  return withTypes({ ...d, settings });
}

/**
 * Settings after restoring a backup: the plan's rules come with it (hitch, duty, rest and flight limits,
 * kinds of contract that its missions point at, maintenance, preferences); how this device shows things stays.
 */
export function restoredSettings(here: AppData["settings"], backup: AppData["settings"]): AppData["settings"] {
  const { theme, sidebarCollapsed, scheduleSpan, scheduleGroup } = here;
  return { ...backup, theme, sidebarCollapsed, scheduleSpan, scheduleGroup };
}
