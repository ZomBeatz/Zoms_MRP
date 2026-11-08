import { describe, expect, it } from "vitest";
import { daysSince, staleOn } from "./currency";
import { findIssues } from "./coverage";
import { emptyData } from "./sample";
import type { AppData, Person } from "./types";

const d = (m: number, n: number) => `2030-${String(m).padStart(2, "0")}-${String(n).padStart(2, "0")}T00:00`;
const t = (m: number, n: number) => new Date(d(m, n)).getTime();
const pilot = (id: string, extra: Partial<Person> = {}): Person => ({ id, name: id, role: "Pilot", quals: ["Bell 412"], training: [], missionIds: [], rotation: null, base: "", phone: "", notes: "", ...extra });

function plan(): AppData {
  const data = emptyData();
  data.settings.currencyDays = 90;
  data.aircraft = [{ id: "a", tail: "N1", type: "Bell 412", base: "", status: "Airworthy", seats: 2, notes: "" }];
  data.missions = [{ id: "m", name: "Fire", contact: "", location: "", requiredTrainingIds: [], color: "#c2410c", pattern: "solid", notes: "" }];
  data.seasons = [
    { id: "old", missionId: "m", start: d(1, 1), end: d(2, 1), aircraftIds: ["a"], pilotsNeeded: 1, maintainersNeeded: 0, pilotRotation: null, maintainerRotation: null, status: "Done", notes: "" },
    { id: "new", missionId: "m", start: d(11, 1), end: d(11, 29), aircraftIds: ["a"], pilotsNeeded: 1, maintainersNeeded: 0, pilotRotation: null, maintainerRotation: null, status: "Confirmed", notes: "" },
  ];
  data.people = [pilot("ann")];
  data.shifts = [{ id: "s1", seasonId: "old", personId: "ann", start: d(1, 1), end: d(2, 1) }, { id: "s2", seasonId: "new", personId: "ann", start: d(11, 1), end: d(11, 15) }];
  return data;
}

describe("currency", () => {
  it("counts days since a pilot last flew the type, from the schedule or a typed date", () => {
    const data = plan();
    expect(daysSince(data, data.people[0], "Bell 412", t(11, 1))).toBe(273);
    data.people[0].flew = { "Bell 412": "2030-09-30" };
    expect(daysSince(data, data.people[0], "Bell 412", t(11, 1))).toBe(31);
  });

  it("warns about a booking after too long, and not without a record", () => {
    const data = plan();
    expect(findIssues(data).filter((i) => i.id.startsWith("curr-")).map((i) => i.title)).toEqual(["ann hasn't flown the Bell 412 in 273 days"]);
    data.shifts = data.shifts.filter((s) => s.id !== "s1");
    expect(staleOn(data, data.people[0], ["Bell 412"], t(11, 1))).toBeNull();
    data.settings.currencyDays = 0;
    data.shifts.push({ id: "s1", seasonId: "old", personId: "ann", start: d(1, 1), end: d(2, 1) });
    expect(findIssues(data).some((i) => i.id.startsWith("curr-"))).toBe(false);
  });
});
