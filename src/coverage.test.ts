import { describe, expect, it } from "vitest";
import { coverageSteps, findIssues, missionCoverage, neededTraining, trainingStatus } from "./coverage";
import { emptyData } from "./sample";
import type { AppData, Person } from "./types";

const DAY = 86_400_000;
/** Midnight on Nov `n`, 2030 (well clear of today, so nothing "runs out soon"). */
const d = (n: number) => `2030-11-${String(n).padStart(2, "0")}T00:00`;
const pilot = (id: string, name: string, quals: string[]): Person => ({ id, name, role: "Pilot", quals, training: [], missionIds: [], rotation: null, base: "", phone: "", notes: "" });

function base(): AppData {
  const data = emptyData();
  data.aircraft = [{ id: "a1", tail: "N1", type: "Bell 412", base: "", status: "Ready", seats: 2, notes: "" }];
  data.people = [pilot("p1", "Alex", ["Bell 412"]), pilot("p2", "Maya", ["Bell 412"]), pilot("p3", "Sam", ["AS350"])];
  data.missions = [{ id: "fire", name: "Fire season", contact: "", requiredTrainingIds: [], location: "", color: "#c2410c", pattern: "solid", notes: "" }];
  data.seasons = [{ id: "m1", missionId: "fire", start: d(1), end: d(29), aircraftIds: ["a1"], pilotRotation: null, maintainerRotation: null, pilotsNeeded: 1, maintainersNeeded: 0, status: "Confirmed", notes: "" }];
  return data;
}

describe("coverage", () => {
  it("counts overlapping spans", () => {
    expect(coverageSteps(0, 10, [[0, 5], [3, 10]])).toEqual([{ a: 0, b: 3, n: 1 }, { a: 3, b: 5, n: 2 }, { a: 5, b: 10, n: 1 }]);
  });

  it("finds the days between two hitches nobody covers", () => {
    const data = base();
    data.shifts = [
      { id: "s1", seasonId: "m1", personId: "p1", start: d(1), end: d(13) },
      { id: "s2", seasonId: "m1", personId: "p2", start: d(15), end: d(29) },
    ];
    const cov = missionCoverage(data, data.seasons[0]);
    expect(cov.pilotGaps).toHaveLength(1);
    expect(Math.round((cov.pilotGaps[0].b - cov.pilotGaps[0].a) / DAY)).toBe(2);
    expect(findIssues(data).some((i) => i.id.startsWith("pgap-"))).toBe(true);
  });

  it("a clean 14-day handover has no gap and no conflict", () => {
    const data = base();
    data.shifts = [
      { id: "s1", seasonId: "m1", personId: "p1", start: d(1), end: d(15) },
      { id: "s2", seasonId: "m1", personId: "p2", start: d(15), end: d(29) },
    ];
    expect(findIssues(data)).toEqual([]);
  });

  it("flags unqualified pilots, double bookings and too many days on", () => {
    const data = base();
    data.settings.rules.maxDaysOn = 21;
    data.missions.push({ ...data.missions[0], id: "other", name: "Other" });
    data.seasons.push({ ...data.seasons[0], id: "m2", missionId: "other", aircraftIds: [], start: d(3), end: d(5) });
    data.shifts = [
      { id: "s1", seasonId: "m1", personId: "p3", start: d(1), end: d(29) },
      { id: "s2", seasonId: "m2", personId: "p3", start: d(3), end: d(5) },
    ];
    const ids = findIssues(data).map((i) => i.id.split("-")[0]);
    expect(ids).toContain("qual");
    expect(ids).toContain("dbl");
    expect(ids).toContain("duty");
  });

  it("an aircraft in grounding maintenance can't fly the mission", () => {
    const data = base();
    data.jobs = [{ id: "j1", aircraftId: "a1", title: "Gearbox", kind: "Repair", start: d(10), end: d(12), maintainerIds: [], grounds: true, done: false, notes: "" }];
    expect(findIssues(data).some((i) => i.id.startsWith("acjob-"))).toBe(true);
  });

  it("needs the mission's training, current for the whole hitch", () => {
    const data = base();
    data.trainings = [{ id: "t1", name: "Mountain flying", validMonths: 12, appliesTo: "Pilot", notes: "" }];
    data.missions[0].requiredTrainingIds = ["t1"];
    data.shifts = [{ id: "s1", seasonId: "m1", personId: "p1", start: d(1), end: d(29) }];
    expect(findIssues(data).some((i) => i.id.startsWith("train-"))).toBe(true);

    // Done, but it runs out in the middle of the hitch.
    data.people[0].training = [{ trainingId: "t1", completed: "2029-11-10", expires: "2030-11-10" }];
    expect(trainingStatus(data.people[0], "t1", Date.parse(d(1)), Date.parse(d(29))).state).toBe("runs-out");
    expect(findIssues(data).some((i) => i.id.startsWith("train-"))).toBe(true);

    data.people[0].training = [{ trainingId: "t1", completed: "2030-06-01", expires: "2031-06-01" }];
    expect(findIssues(data).some((i) => i.id.startsWith("train-"))).toBe(false);
  });

  it("people need only the training of the missions they work", () => {
    const data = base();
    data.trainings = [{ id: "t1", name: "NVG", validMonths: 12, appliesTo: "Pilot", notes: "" }];
    data.missions.push({ ...data.missions[0], id: "night", name: "Night medevac", requiredTrainingIds: ["t1"] });
    data.seasons.push({ ...data.seasons[0], id: "m2", missionId: "night" });
    data.people[0].missionIds = ["fire"];
    data.people[1].missionIds = ["night"];
    expect(neededTraining(data, data.people[0]).has("t1")).toBe(false);
    expect(neededTraining(data, data.people[1]).get("t1")?.map((m) => m.id)).toEqual(["night"]);
  });
});
