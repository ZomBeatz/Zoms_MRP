import { describe, expect, it } from "vitest";
import { rulesFor, seasonRules } from "./limits";
import { findIssues } from "./coverage";
import { fillSeason } from "./fill";
import { emptyData } from "./sample";
import type { AppData, Person } from "./types";

const d = (n: number) => `2030-11-${String(n).padStart(2, "0")}T00:00`;
const pilot = (id: string, extra: Partial<Person> = {}): Person => ({ id, name: id, role: "Pilot", quals: ["Bell 412"], training: [], missionIds: [], rotation: null, base: "", phone: "", notes: "", ...extra });

function plan(): AppData {
  const data = emptyData();
  data.aircraft = [{ id: "a1", tail: "N1", type: "Bell 412", base: "", status: "Ready", seats: 2, notes: "" }];
  data.missions = [{ id: "m", name: "Fire", contact: "", location: "", requiredTrainingIds: [], color: "#c2410c", pattern: "solid", notes: "" }];
  data.seasons = [{ id: "s", missionId: "m", start: d(1), end: d(29), aircraftIds: ["a1"], pilotsNeeded: 1, maintainersNeeded: 0, pilotRotation: null, maintainerRotation: null, status: "Confirmed", notes: "" }];
  return data;
}

describe("work limits", () => {
  it("takes the safest of Settings, mission, season and person", () => {
    const data = plan();
    data.missions[0].limits = { maxDaysOn: 14 };
    data.seasons[0].limits = { minDaysOff: 10 };
    expect(seasonRules(data, data.seasons[0])).toEqual({ maxDaysOn: 14, minDaysOff: 10 });
    // A looser number at a lower level doesn't loosen anything.
    data.seasons[0].limits = { maxDaysOn: 30, minDaysOff: 3 };
    expect(seasonRules(data, data.seasons[0])).toEqual({ maxDaysOn: 14, minDaysOff: 7 });
    expect(rulesFor(data, pilot("p", { limits: { maxDaysOn: 10 } }), data.seasons[0])).toEqual({ maxDaysOn: 10, minDaysOff: 7 });
  });

  it("lets a season override the mission and Settings, but not the person", () => {
    const data = plan();
    data.missions[0].limits = { maxDaysOn: 14 };
    data.seasons[0].limits = { maxDaysOn: 28, override: true };
    expect(seasonRules(data, data.seasons[0]).maxDaysOn).toBe(28);
    expect(rulesFor(data, pilot("p", { limits: { maxDaysOn: 20 } }), data.seasons[0]).maxDaysOn).toBe(20);
  });

  it("flags a hitch over the mission's limit, and Fill stays inside it", () => {
    const data = plan();
    data.people = [pilot("p1"), pilot("p2")];
    data.missions[0].limits = { maxDaysOn: 10 };
    data.shifts = [{ id: "x", seasonId: "s", personId: "p1", start: d(1), end: d(15) }];
    expect(findIssues(data).filter((i) => i.id.startsWith("duty-")).map((i) => i.detail)).toEqual([expect.stringContaining("The most is 10 days")]);
    data.shifts = [];
    const added = fillSeason(data, data.seasons[0], "Pilot", null, data.settings.rules);
    expect(added.every((s) => Math.round((new Date(s.end).getTime() - new Date(s.start).getTime()) / 86_400_000) <= 10)).toBe(true);
    expect(findIssues({ ...data, shifts: added }).some((i) => i.id.startsWith("duty-"))).toBe(false);
  });
});
