import { describe, expect, it } from "vitest";
import { canSupport, fleetUse, freePerDay } from "./fleet";
import { emptyData } from "./sample";
import type { AppData, Person } from "./types";

const d = (n: number) => `2030-11-${String(n).padStart(2, "0")}T00:00`;
const t = (n: number) => new Date(d(n)).getTime();
const pilot = (id: string, quals: string[]): Person => ({ id, name: id, role: "Pilot", quals, training: [], missionIds: [], rotation: null, base: "", phone: "", notes: "" });

function base(): AppData {
  const data = emptyData();
  data.aircraft = [
    { id: "a1", tail: "N1", type: "Bell 412", base: "", status: "Ready", seats: 2, notes: "" },
    { id: "a2", tail: "N2", type: "Bell 412", base: "", status: "Ready", seats: 2, notes: "" },
  ];
  data.people = [pilot("p1", ["Bell 412"]), pilot("p2", ["Bell 412"])];
  data.missions = [{ id: "fire", name: "Fire", contact: "", requiredTrainingIds: [], location: "", color: "#c2410c", pattern: "solid", notes: "" }];
  data.seasons = [{ id: "m1", missionId: "fire", start: d(1), end: d(11), aircraftIds: ["a1"], pilotRotation: null, maintainerRotation: null, pilotsNeeded: 2, maintainersNeeded: 0, status: "Confirmed", notes: "" }];
  data.jobs = [{ id: "j1", aircraftId: "a2", title: "Inspection", kind: "Inspection", start: d(5), end: d(7), maintainerIds: [], grounds: true, done: false, notes: "" }];
  return data;
}

describe("fleet", () => {
  it("counts mission, maintenance and free days per tail", () => {
    const [n1, n2] = fleetUse(base(), t(1), t(21));
    expect([n1.mission, n1.free]).toEqual([10, 10]);
    expect(n1.use).toBe(0.5);
    expect([n2.maintenance, n2.free]).toEqual([2, 18]);
    expect(n1.freeRuns).toEqual([[t(11), t(21)]]);
  });

  it("counts free aircraft each day", () => {
    const free = freePerDay(base(), t(4), t(8)).map((x) => x.free);
    expect(free).toEqual([1, 0, 0, 1]);
  });

  it("says which tails can take a job, and whether there's crew", () => {
    const data = base();
    // N2 is in maintenance on the 5th and 6th; N1 is on the fire mission until the 11th.
    const early = canSupport(data, { start: t(2), end: t(4), type: "Bell 412", pilotsNeeded: 2, training: [] });
    const n2 = early.find((x) => x.aircraft.tail === "N2")!;
    // Both pilots are free (the fire mission has no shifts), so N2 can do it.
    expect(n2.verdict).toBe("yes");
    expect(early.find((x) => x.aircraft.tail === "N1")!.verdict).toBe("no");

    // Book both pilots on the fire mission: now N2 is free but there's nobody to fly it.
    data.shifts = [
      { id: "s1", seasonId: "m1", personId: "p1", start: d(1), end: d(11) },
      { id: "s2", seasonId: "m1", personId: "p2", start: d(1), end: d(11) },
    ];
    expect(canSupport(data, { start: t(2), end: t(4), type: "Bell 412", pilotsNeeded: 1, training: [] }).find((x) => x.aircraft.tail === "N2")!.verdict).toBe("crew");
  });
});

describe("earliest free", () => {
  it("finds the first run of free days long enough for the job", async () => {
    const { earliestFree } = await import("./fleet");
    const data = base();
    // N1 is on the fire mission until the 11th, so a 5-day job starting the 2nd fits from the 11th.
    expect(earliestFree(data, data.aircraft[0], t(2), 5)).toBe(t(11));
    // N2 has maintenance on the 5th and 6th: a 3-day job fits on the 2nd, a 4-day job only from the 7th.
    expect(earliestFree(data, data.aircraft[1], t(2), 3)).toBe(t(2));
    expect(earliestFree(data, data.aircraft[1], t(2), 4)).toBe(t(7));
  });
});
