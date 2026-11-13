import { describe, expect, it } from "vitest";
import { crewFor, jobHitch, rulesFor, seasonRules } from "./limits";
import { findIssues, missionCoverage } from "./coverage";
import { fillSeason } from "./fill";
import { emptyData } from "./sample";
import type { AppData, Person } from "./types";

const d = (n: number) => `2030-11-${String(n).padStart(2, "0")}T00:00`;
const pilot = (id: string, extra: Partial<Person> = {}): Person => ({ id, name: id, role: "Pilot", quals: ["Bell 412"], training: [], missionIds: [], rotation: null, base: "", phone: "", notes: "", ...extra });

function plan(): AppData {
  const data = emptyData();
  data.aircraft = [{ id: "a1", tail: "N1", type: "Bell 412", base: "", status: "Airworthy", seats: 2, notes: "" }];
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

  it("uses a mission's kind of contract instead of Settings, looser or stricter", () => {
    const data = emptyData();
    data.settings.rules = { maxDaysOn: 14, minDaysOff: 7 };
    data.settings.ruleSets = [{ id: "fire", name: "Fire", maxDaysOn: 21, minDaysOff: 14 }];
    data.missions = [{ id: "m", name: "Fire", contact: "", location: "", requiredTrainingIds: [], color: "#000", pattern: "solid", notes: "", ruleSetId: "fire" }];
    expect(seasonRules(data, { missionId: "m" })).toEqual({ maxDaysOn: 21, minDaysOff: 14 });
    data.missions[0].limits = { maxDaysOn: 18 };
    expect(seasonRules(data, { missionId: "m" })).toEqual({ maxDaysOn: 18, minDaysOff: 14 });
  });
});

describe("how many people a job's rotation needs", () => {
  it("counts the fewest who can cover every day", () => {
    expect(crewFor(1, { on: 21, off: 7 }, 365)).toBe(2);
    expect(crewFor(2, { on: 21, off: 7 }, 365)).toBe(3);
    expect(crewFor(1, { on: 14, off: 14 }, 365)).toBe(2);
    expect(crewFor(1, { on: 7, off: 14 }, 365)).toBe(3);
    // A job no longer than one hitch needs only the seats.
    expect(crewFor(2, { on: 21, off: 7 }, 21)).toBe(2);
    expect(crewFor(0, { on: 21, off: 7 }, 60)).toBe(0);
  });

  it("uses the job's rotation, kept within the limits", () => {
    const data = plan();
    const s = { ...data.seasons[0], pilotRotation: { on: 30, off: 3 }, maintainerRotation: null };
    // Longer than the most days on, and fewer days off than the least: the limits win.
    expect(jobHitch(data, s, "Pilot")).toEqual({ on: data.settings.rules.maxDaysOn, off: data.settings.rules.minDaysOff });
    // No rotation: the hitch rules.
    expect(jobHitch(data, s, "Maintainer")).toEqual({ on: data.settings.rules.maxDaysOn, off: data.settings.rules.minDaysOff });
  });

  // Fill staggers hitch ends so that many is enough. The job runs through the March clock change, which
  // once cut a hitch short (an hour under three days counted as under three days).
  it("is enough for Fill the schedule to cover the job", () => {
    for (const [seats, on, off] of [[1, 21, 7], [2, 21, 7], [3, 21, 7], [2, 14, 14], [2, 7, 7], [3, 14, 14], [2, 21, 14]]) {
      const data = plan();
      const season = { ...data.seasons[0], start: "2031-01-01T00:00", end: "2031-05-01T00:00", pilotsNeeded: seats, pilotRotation: { on, off } };
      data.seasons = [season];
      data.shifts = [];
      const n = crewFor(seats, jobHitch(data, season, "Pilot"), 120);
      data.people = Array.from({ length: n }, (_, i) => pilot(`p${i}`));
      const shifts = fillSeason(data, season, "Pilot", season.pilotRotation, data.settings.rules);
      expect(missionCoverage({ ...data, shifts }, season).covered, `${seats} at a time, ${on} on, ${off} off`).toBe(1);
    }
  });
});
