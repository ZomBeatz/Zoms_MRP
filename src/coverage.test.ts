import { describe, expect, it } from "vitest";
import { coverageSteps, findIssues, missionCoverage, neededTraining, trainingStatus } from "./coverage";
import { emptyData } from "./sample";
import { withSlots } from "./slots";
import type { AppData, Person, Season } from "./types";

const DAY = 86_400_000;
/** Midnight on Nov `n`, 2030 (well clear of today, so nothing "runs out soon"). */
const d = (n: number) => `2030-11-${String(n).padStart(2, "0")}T00:00`;
const pilot = (id: string, name: string, quals: string[]): Person => ({ id, name, role: "Pilot", quals, training: [], missionIds: [], rotation: null, base: "", phone: "", notes: "" });

function base(): AppData {
  const data = emptyData();
  data.aircraft = [{ id: "a1", tail: "N1", type: "Bell 412", base: "", status: "Airworthy", seats: 2, notes: "" }];
  data.people = [pilot("p1", "Alex", ["Bell 412"]), pilot("p2", "Maya", ["Bell 412"]), pilot("p3", "Sam", ["AS350"])];
  data.missions = [{ id: "fire", name: "Fire season", contact: "", requiredTrainingIds: [], location: "", color: "#c2410c", pattern: "solid", notes: "" }];
  data.seasons = [{ id: "m1", missionId: "fire", start: d(1), end: d(29), aircraftIds: ["a1"], pilotRotation: null, maintainerRotation: null, pilotsNeeded: 1, maintainersNeeded: 0, status: "Confirmed", notes: "" }];
  return data;
}

describe("coverage", () => {
  it("books a tail only for its own dates within a season", () => {
    const data = base();
    // A second season on the same tail, the 20th to the 29th.
    data.missions.push({ ...data.missions[0], id: "survey", name: "Survey" });
    data.seasons.push({ ...data.seasons[0], id: "m2", missionId: "survey", start: d(20), end: d(29) });
    const dbl = () => findIssues({ ...data }).filter((i) => i.id.startsWith("acdbl-"));
    expect(dbl()).toHaveLength(1);
    // The fire season only has the tail until the 15th: no clash.
    data.seasons[0] = withSlots(data.seasons[0], [{ id: "l1", type: "Bell 412", aircraftId: "a1", end: d(15) }]);
    expect(dbl()).toHaveLength(0);
  });

  it("asks for the tail on a confirmed season's line that has only a type", () => {
    const data = base();
    data.seasons[0] = withSlots(data.seasons[0], [{ id: "l1", type: "Bell 412", aircraftId: "a1" }, { id: "l2", type: "AS350", aircraftId: null, start: d(10) }]);
    const open = findIssues({ ...data }).filter((i) => i.id.startsWith("slot-"));
    expect(open).toHaveLength(1);
    expect(open[0].title).toContain("AS350");
    expect(data.seasons[0].aircraftIds).toEqual(["a1"]);
    // Planned seasons can wait.
    data.seasons[0].status = "Planned";
    expect(findIssues({ ...data }).some((i) => i.id.startsWith("slot-"))).toBe(false);
  });

  it("ground duty needs no aircraft and no type rating", () => {
    const data = base();
    data.missions[0] = { ...data.missions[0], kind: "ground" };
    data.seasons[0] = { ...data.seasons[0], aircraftIds: [], pilotsNeeded: 0, maintainersNeeded: 1 };
    data.people.push({ ...data.people[2], id: "m1", name: "Drew", role: "Maintainer", quals: [] });
    data.shifts = [{ id: "s1", seasonId: "m1", personId: "m1", start: d(1), end: d(29) }];
    const ids = findIssues({ ...data }).map((i) => i.id.split("-")[0]);
    expect(ids).not.toContain("noac");
    expect(ids).not.toContain("qual");
    expect(ids).not.toContain("mgap");
  });

  it("keeps a tail in maintenance or AOG off missions only while it's down", () => {
    const data = base();
    const acstat = () => findIssues({ ...data }).filter((i) => i.id.startsWith("acstat-"));
    expect(acstat()).toHaveLength(0);
    // AOG from the 10th with no return date: the season (1st to 28th) is hit.
    data.aircraft[0] = { ...data.aircraft[0], status: "AOG", statusSince: "2030-11-10", backOn: null };
    expect(acstat()).toHaveLength(1);
    expect(acstat()[0].title).toContain("AOG");
    // In maintenance and back before the season starts: fine.
    data.aircraft[0] = { ...data.aircraft[0], status: "In maintenance", statusSince: "2030-10-01", backOn: "2030-11-01" };
    expect(acstat()).toHaveLength(0);
    // Back a day into it: a problem again.
    data.aircraft[0] = { ...data.aircraft[0], backOn: "2030-11-02" };
    expect(acstat()).toHaveLength(1);
    // Airworthy: nothing.
    data.aircraft[0] = { ...data.aircraft[0], status: "Airworthy", statusSince: null, backOn: null };
    expect(acstat()).toHaveLength(0);
  });

  it("asks for a status update once a tail is past the day it was expected back", () => {
    const data = base();
    data.aircraft[0] = { ...data.aircraft[0], status: "AOG", statusSince: "2020-01-01", backOn: "2020-02-01" };
    expect(findIssues({ ...data }).some((i) => i.id === "acback-a1")).toBe(true);
    data.aircraft[0] = { ...data.aircraft[0], backOn: "2099-02-01" };
    expect(findIssues({ ...data }).some((i) => i.id === "acback-a1")).toBe(false);
  });

  it("flags a tail that lacks equipment its mission needs", () => {
    const data = base();
    data.equipment = [{ id: "hoist", name: "Rescue hoist", notes: "" }, { id: "bucket", name: "Fire bucket", notes: "" }];
    data.missions[0].requiredEquipmentIds = ["bucket"];
    // A new object each time: bookings are cached per data object.
    const equip = () => findIssues({ ...data }).filter((i) => i.id.startsWith("equip-"));
    expect(equip()).toHaveLength(1);
    expect(equip()[0]).toMatchObject({ seasonId: "m1", aircraftId: "a1", severity: "warn" });
    expect(equip()[0].title).toContain("fire bucket");
    data.aircraft[0].equipmentIds = ["hoist", "bucket"];
    expect(equip()).toHaveLength(0);
    // Not on a cancelled season.
    data.aircraft[0].equipmentIds = [];
    data.seasons[0].status = "Cancelled";
    expect(equip()).toHaveLength(0);
  });

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

describe("when maintainers are needed", () => {
  const maint = (id: string): Person => ({ ...pilot(id, id, ["Bell 412"]), role: "Maintainer" });
  /** A 28-day season needing one maintainer, chosen how, with maintainer shifts on the given days (Nov n to n+len). */
  const setup = (need: Season["maintainerNeed"], shifts: [number, number][] = []) => {
    const data = base();
    data.people.push(maint("m1"));
    data.seasons[0] = { ...data.seasons[0], maintainersNeeded: 1, maintainerNeed: need };
    data.shifts = shifts.map(([a, b], i) => ({ id: `ms${i}`, seasonId: "m1", personId: "m1", start: d(a), end: d(b) }));
    return missionCoverage(data, data.seasons[0]).maintainerGaps;
  };

  it("all the time: every day without one is a gap", () => {
    expect(setup(undefined)).toEqual([{ a: new Date(d(1)).getTime(), b: new Date(d(29)).getTime(), short: 1 }]);
    expect(setup({ mode: "always", days: 2 }, [[1, 15]])).toHaveLength(1);
  });

  it("on call: never a gap", () => {
    expect(setup({ mode: "oncall", days: 2 })).toEqual([]);
  });

  it("start and end: only the first and last days count", () => {
    const gaps = setup({ mode: "ends", days: 3 });
    expect(gaps.map((g) => [new Date(g.a).getDate(), new Date(g.b).getDate()])).toEqual([[1, 4], [26, 29]]);
    expect(setup({ mode: "ends", days: 3 }, [[1, 4], [26, 29]])).toEqual([]);
  });

  it("days a week: a week with too few days booked is a gap, saying how many more", () => {
    // Four weeks; the first has 2 days booked, the second 1, the rest none.
    const gaps = setup({ mode: "weekly", days: 2 }, [[1, 3], [8, 9]]);
    expect(gaps.map((g) => [new Date(g.a).getDate(), g.days])).toEqual([[9, 1], [15, 2], [22, 2]]);
  });
});

describe("filling maintainers who are needed only some days", () => {
  it("books just the start and end for set-up and tear-down", async () => {
    const { fillSeason } = await import("./fill");
    const data = base();
    data.people.push({ ...pilot("m1", "Mo", ["Bell 412"]), role: "Maintainer" });
    data.seasons[0] = { ...data.seasons[0], maintainersNeeded: 1, maintainerNeed: { mode: "ends", days: 2 } };
    const added = fillSeason(data, data.seasons[0], "Maintainer", { on: 14, off: 0 }, { maxDaysOn: 21, minDaysOff: 0 });
    expect(added.map((s) => [new Date(s.start).getDate(), new Date(s.end).getDate()])).toEqual([[1, 3], [27, 29]]);
  });
});

describe("training extensions", () => {
  it("counts training as current until its extension, with the reason kept", () => {
    const p = pilot("p", "P", ["Bell 412"]);
    p.training = [{ trainingId: "nvg", completed: "2030-01-01", expires: "2030-11-05" }];
    const a = new Date(d(1)).getTime(), b = new Date(d(20)).getTime();
    expect(trainingStatus(p, "nvg", a, b).state).toBe("runs-out");
    p.training[0] = { ...p.training[0], extendedTo: "2030-12-31", extensionNote: "On the North Slope job" };
    expect(trainingStatus(p, "nvg", a, b)).toEqual({ state: "ok", expires: "2030-12-31" });
  });
});

describe("ignoring problems", () => {
  it("leaves an ignored problem out, and lists it while it's still there", async () => {
    const { ignoredIssues } = await import("./coverage");
    const data = base();
    const [gap] = findIssues(data);
    data.ignored = [{ id: gap.id, title: gap.title, note: "Customer agreed", on: "2030-11-01" }];
    expect(findIssues(data).some((i) => i.id === gap.id)).toBe(false);
    expect(ignoredIssues(data).map((x) => x.note)).toEqual(["Customer agreed"]);
    // Once it's fixed, it drops off the ignored list too.
    data.seasons[0].pilotsNeeded = 0;
    expect(ignoredIssues(data)).toEqual([]);
  });
});

describe("days someone would rather not work", () => {
  it("are never a problem, and Fill books someone else when it can", async () => {
    const { fillSeason } = await import("./fill");
    const data = base();
    data.timeOff = [{ id: "t", personId: "p1", start: d(1), end: d(29), reason: "Moving house", soft: true }];
    data.shifts = [{ id: "x", seasonId: "m1", personId: "p1", start: d(1), end: d(15) }];
    expect(findIssues(data).some((i) => i.id.startsWith("off-"))).toBe(false);
    data.shifts = [];
    const added = fillSeason(data, data.seasons[0], "Pilot", { on: 28, off: 0 }, { maxDaysOn: 30, minDaysOff: 0 });
    expect(added.map((s) => s.personId)).toEqual(["p2"]);
  });

  it("flags a pilot over the flight-hour limit, from the flying planned on their shifts", () => {
    const data = base();
    data.aircraft[0].hoursPerDay = 6;
    data.shifts = [{ id: "s1", seasonId: "m1", personId: "p1", start: d(1), end: d(21) }];
    // 20 days at 6 hours is 120 hours: fine with no limit, too many with 100 in 30.
    expect(findIssues(data).some((i) => i.id.startsWith("fly-"))).toBe(false);
    data.settings.flightLimits = [{ hours: 100, days: 30 }];
    const issue = findIssues(data).find((i) => i.id.startsWith("fly-"));
    expect(issue?.title).toBe("Alex flies about 120 hours in 30 days");
    expect(issue?.shiftId).toBe("s1");
    // Two pilots on at once share the flying.
    // (A new plan object: bookings are worked out once per plan.)
    const shared = { ...data, seasons: [{ ...data.seasons[0], pilotsNeeded: 2 }] };
    expect(findIssues(shared).some((i) => i.id.startsWith("fly-"))).toBe(false);
  });
});
