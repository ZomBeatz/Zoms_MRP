import { describe, expect, it } from "vitest";
import { equipmentFor, missingEquipment, renameType, withTypes } from "./aircraftTypes";
import { migrate } from "./migrate";
import { emptyData } from "./sample";
import type { AppData } from "./types";

function data(): AppData {
  const d = emptyData();
  d.aircraft = [{ id: "a1", tail: "N1", type: "Bell 412", base: "", status: "Ready", seats: 2, notes: "" }, { id: "a2", tail: "N2", type: "AS350", base: "", status: "Ready", seats: 1, notes: "" }];
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
