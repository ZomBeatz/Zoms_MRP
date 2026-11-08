import { describe, expect, it } from "vitest";
import { equipmentFor, missingEquipment, renameType, withTypes } from "./aircraftTypes";
import { migrate } from "./migrate";
import { emptyData } from "./sample";
import type { AppData } from "./types";

function data(): AppData {
  const d = emptyData();
  d.aircraft = [{ id: "a1", tail: "N1", type: "Bell 412", base: "", status: "Airworthy", seats: 2, notes: "" }, { id: "a2", tail: "N2", type: "AS350", base: "", status: "Airworthy", seats: 1, notes: "" }];
  d.people = [{ id: "p1", name: "Alex", role: "Pilot", quals: ["Bell 412", "AW139"], training: [], missionIds: [], rotation: null, base: "", phone: "", notes: "", flew: { "Bell 412": "2026-10-01" } }];
  d.programs = [{ id: "x", type: "Bell 412", title: "100 hour", everyHours: 100, everyMonths: null, days: 1, grounds: true }];
  return d;
}

describe("aircraft types", () => {
  it("adds a type for every name in use, with the seats of its tails", () => {
    const d = withTypes(data());
    expect(d.aircraftTypes.map((t) => t.name).sort()).toEqual(["AS350", "AW139", "Bell 412"]);
    expect(d.aircraftTypes.find((t) => t.name === "AS350")?.seats).toBe(1);
    // Nothing missing: the same object back.
    expect(withTypes(d)).toBe(d);
  });

  it("an older save gets the new statuses, and costs and inspections off unless they're in use", () => {
    const raw = { ...data(), settings: { ...emptyData().settings, costs: undefined, maintenance: { ...emptyData().settings.maintenance, enabled: true } } };
    raw.aircraft = [{ ...raw.aircraft[0], status: "Ready" as never }, { ...raw.aircraft[1], status: "Grounded" as never }];
    raw.programs = [];
    const d = migrate(raw);
    expect(d.aircraft.map((a) => a.status)).toEqual(["Airworthy", "AOG"]);
    expect(d.settings.costs).toBe(false);
    expect(d.settings.maintenance.enabled).toBe(false);
    // Someone using them keeps them.
    const used = migrate({ ...raw, programs: data().programs, aircraft: [{ ...raw.aircraft[0], hourCost: 900 }] });
    expect(used.settings.costs).toBe(true);
    expect(used.settings.maintenance.enabled).toBe(true);
  });

  it("an older save gets its types and empty equipment lists", () => {
    const raw = { ...data(), aircraftTypes: undefined, equipment: undefined };
    const d = migrate(raw);
    expect(d.aircraftTypes).toHaveLength(3);
    expect(d.equipment).toEqual([]);
    expect(d.aircraft[0].equipmentIds).toEqual([]);
  });

  it("renames a type on its tails, ratings, last-flown dates and program", () => {
    const d = renameType(withTypes(data()), "Bell 412", "Bell 412EP");
    expect(d.aircraft[0].type).toBe("Bell 412EP");
    expect(d.aircraft[1].type).toBe("AS350");
    expect(d.people[0].quals).toEqual(["Bell 412EP", "AW139"]);
    expect(d.people[0].flew).toEqual({ "Bell 412EP": "2026-10-01" });
    expect(d.programs[0].type).toBe("Bell 412EP");
  });

  it("offers a type's own equipment, or all of it when the type lists none", () => {
    const d = withTypes(data());
    d.equipment = [{ id: "hoist", name: "Hoist", notes: "" }, { id: "bucket", name: "Bucket", notes: "" }];
    d.aircraftTypes = d.aircraftTypes.map((t) => (t.name === "AS350" ? { ...t, equipmentIds: ["bucket"] } : t));
    expect(equipmentFor(d, "AS350").map((e) => e.id)).toEqual(["bucket"]);
    expect(equipmentFor(d, "Bell 412").map((e) => e.id)).toEqual(["hoist", "bucket"]);
    expect(missingEquipment(d, { equipmentIds: ["bucket"] }, ["hoist", "bucket"]).map((e) => e.name)).toEqual(["Hoist"]);
  });
});

describe("types of work", () => {
  it("gives each job of a type its own shade of the type's color", async () => {
    const { nextShade, reshade, shadeAt, shadesOf } = await import("./look");
    const shades = shadesOf("#c2410c", 8);
    expect(new Set(shades).size).toBe(8);
    expect(shades[0]).toBe("#c2410c");
    for (const c of shades) expect(c).toMatch(/^#[0-9a-f]{6}$/);
    const d = emptyData();
    d.workTypes = [{ id: "fire", name: "Fire", color: "#c2410c" }];
    const job = (id: string, color: string) => ({ id, name: id, contact: "", location: "", requiredTrainingIds: [], color, pattern: "solid" as const, notes: "", workTypeId: "fire" });
    d.missions = [job("a", shadeAt("#c2410c", 0)), job("b", shadeAt("#c2410c", 1))];
    expect(nextShade(d, "fire")).toBe(shadeAt("#c2410c", 2));
    expect(reshade(d.missions, "fire", "#2563eb").map((m) => m.color)).toEqual([shadeAt("#2563eb", 0), shadeAt("#2563eb", 1)]);
  });
});
