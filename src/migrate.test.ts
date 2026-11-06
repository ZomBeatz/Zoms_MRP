import { describe, expect, it } from "vitest";
import { migrate, restoredSettings } from "./migrate";

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

  it("gives a save from before 0.2.4 no flight-hour limit, rest of 10 hours, no rule sets, and the question still to ask", () => {
    const d = migrate({ version: 1, aircraft: [], trainings: [], people: [], missions: [], seasons: [], shifts: [], jobs: [], timeOff: [], settings: { rules: { maxDaysOn: 21, minDaysOff: 7 } } });
    expect(d.settings.flightLimits).toEqual([]);
    expect(d.settings.minRestHours).toBe(10);
    expect(d.settings.ruleSets).toEqual([]);
    expect(d.settings.asked).toEqual([]);
  });

  it("keeps a flight-hour limit set in the first 0.2.4 builds as the first of the list", () => {
    const d = migrate({ version: 1, aircraft: [], trainings: [], people: [], missions: [], seasons: [], shifts: [], jobs: [], timeOff: [], settings: { flightLimit: { hours: 100, days: 30 } } });
    expect(d.settings.flightLimits).toEqual([{ hours: 100, days: 30 }]);
    expect("flightLimit" in d.settings).toBe(false);
  });
});

describe("restoring a backup", () => {
  it("brings the plan's rules and keeps this device's look", () => {
    const here = { ...migrate({ missions: [], aircraft: [] }).settings, theme: "dark" as const, sidebarCollapsed: true };
    const backup = {
      ...migrate({ missions: [], aircraft: [] }).settings, theme: "light" as const, sidebarCollapsed: false,
      flightLimits: [{ hours: 100, days: 30 }], minRestHours: 12, ruleSets: [{ id: "ems", name: "EMS", maxDaysOn: 7, minDaysOff: 7 }],
    };
    const s = restoredSettings(here, backup);
    expect(s.flightLimits).toEqual([{ hours: 100, days: 30 }]);
    expect(s.minRestHours).toBe(12);
    expect(s.ruleSets.map((r) => r.id)).toEqual(["ems"]);
    expect(s.theme).toBe("dark");
    expect(s.sidebarCollapsed).toBe(true);
  });
});
