import type { AppData, Mission, Season, Shift } from "./types";
import { defaultSettings, emptyData } from "./sample";

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
        id: b.id, missionId: m.id, start: b.start, end: b.end, aircraftId: b.aircraftId ?? null,
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
  d.seasons = d.seasons ?? [];
  delete d.areas;

  const settings = { ...defaultSettings(), ...d.settings, rules: { ...defaultSettings().rules, ...d.settings?.rules } };
  settings.scheduleSpan = Math.min(365, Math.max(7, Math.round(Number(settings.scheduleSpan) || 30)));
  if (!["missions", "aircraft", "people"].includes(settings.scheduleGroup)) settings.scheduleGroup = "aircraft";
  return { ...d, settings };
}
