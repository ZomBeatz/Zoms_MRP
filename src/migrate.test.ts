import { describe, expect, it } from "vitest";
import { migrate } from "./migrate";

describe("older saves", () => {
  it("turns same-named dated missions into one mission with seasons", () => {
    const old = {
      version: 1, aircraft: [], trainings: [], timeOff: [], jobs: [],
      areas: [{ id: "ar", name: "Ridge", requiredTrainingIds: ["mtn"] }],
      missions: [
        { id: "b1", name: "Fire", contact: "Dispatch", areaId: "ar", requiredTrainingIds: [], color: "#c2410c", pattern: "stripes", start: "2026-05-15T00:00", end: "2026-09-16T00:00", aircraftId: "a1", pilotsNeeded: 2, maintainersNeeded: 1, status: "Done", notes: "" },
        { id: "b2", name: "Fire", contact: "Dispatch", requiredTrainingIds: ["fire"], color: "#c2410c", pattern: "stripes", start: "2027-05-15T00:00", end: "2027-09-16T00:00", aircraftId: "a1", pilotsNeeded: 2, maintainersNeeded: 1, status: "Planned", notes: "" },
        { id: "b3", name: "Medevac", contact: "", requiredTrainingIds: ["nvg"], color: "#be123c", pattern: "solid", start: "2026-01-05T00:00", end: "2026-12-21T00:00", aircraftId: "a2", pilotsNeeded: 2, maintainersNeeded: 0, status: "Flying", notes: "" },
      ],
      shifts: [{ id: "s1", missionId: "b2", personId: "p1", start: "2027-05-15T00:00", end: "2027-05-29T00:00" }],
      people: [{ id: "p1", name: "Alex", role: "Pilot", quals: [], training: [], missionIds: ["b1", "b2"], base: "", phone: "", notes: "" }],
      settings: { theme: "system", scheduleSpan: 3, scheduleGroup: "customers" },
    };
    const d = migrate(old);
    expect(d.missions.map((m) => m.name)).toEqual(["Medevac", "Fire"]);
    const fire = d.missions.find((m) => m.name === "Fire")!;
    expect(fire.requiredTrainingIds.sort()).toEqual(["fire", "mtn"]);
    expect(d.seasons.filter((s) => s.missionId === fire.id).map((s) => s.id)).toEqual(["b1", "b2"]);
    expect(d.shifts[0].seasonId).toBe("b2");
    expect(d.people[0].missionIds).toEqual([fire.id]);
    expect(d.settings.scheduleSpan).toBe(7);
    expect(d.settings.scheduleGroup).toBe("aircraft");
  });
});
