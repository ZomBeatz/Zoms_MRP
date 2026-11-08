import { describe, expect, it } from "vitest";
import { dueList, flightHours, planFor } from "./program";
import { emptyData } from "./sample";
import type { AppData } from "./types";

const d = (m: number, n: number) => `2030-${String(m).padStart(2, "0")}-${String(n).padStart(2, "0")}T00:00`;
const t = (m: number, n: number) => new Date(d(m, n)).getTime();

/** One Bell 412 flying a mission Nov 1–28, 2030, at 5 hours a flying day, with 1,000 hours on Nov 1. */
function plan(): AppData {
  const data = emptyData();
  data.aircraft = [{ id: "a", tail: "N1", type: "Bell 412", base: "", status: "Airworthy", seats: 2, notes: "", hours: { hours: 1000, on: "2030-11-01" }, hoursPerDay: 5 }];
  data.missions = [{ id: "m", name: "Fire", contact: "", location: "", requiredTrainingIds: [], color: "#c2410c", pattern: "solid", notes: "" }];
  data.seasons = [{ id: "s", missionId: "m", start: d(11, 1), end: d(11, 29), aircraftIds: ["a"], pilotsNeeded: 0, maintainersNeeded: 0, pilotRotation: null, maintainerRotation: null, status: "Confirmed", notes: "" }];
  data.programs = [
    { id: "p100", type: "Bell 412", title: "100 hour inspection", everyHours: 100, everyMonths: null, days: 2, grounds: true },
    { id: "pann", type: "Bell 412", title: "Annual inspection", everyHours: null, everyMonths: 12, days: 5, grounds: true },
  ];
  data.jobs = [
    { id: "j1", aircraftId: "a", title: "100 Hour Inspection", kind: "Inspection", start: d(10, 30), end: d(11, 1), maintainerIds: [], grounds: true, done: true, notes: "" },
    { id: "j2", aircraftId: "a", title: "Annual inspection", kind: "Inspection", start: d(1, 1), end: d(1, 6), maintainerIds: [], grounds: true, done: true, notes: "" },
  ];
  return data;
}

describe("maintenance programs", () => {
  it("carries flight hours forward by mission days", () => {
    const data = plan();
    expect(flightHours(data, data.aircraft[0], t(11, 11))).toBe(1050);
    expect(flightHours(data, data.aircraft[0], t(12, 15))).toBe(1140);
  });

  it("is due by hours or months, whichever comes first", () => {
    const data = plan();
    const [hundred, annual] = ["100 hour inspection", "Annual inspection"].map((n) => dueList(data).find((x) => x.item.title === n)!);
    // 100 hours at 5 a day from Nov 1: after 20 flying days.
    expect(hundred).toMatchObject({ by: "hours", hoursDue: 1100, at: t(11, 21) });
    expect(annual).toMatchObject({ by: "months", at: new Date(2031, 0, 6).getTime() });
  });

  it("plans it in the latest free days that still finish before it's due (around other jobs)", () => {
    const data = plan();
    const due = dueList(data).find((x) => x.item.title === "100 hour inspection")!;
    const job = planFor(data, due);
    expect(job).toMatchObject({ aircraftId: "a", title: "100 hour inspection", grounds: true, start: d(10, 28), end: d(10, 30) });
  });

  it("counts a planned job, and knows when there's no record yet", () => {
    const data = plan();
    data.jobs.push({ id: "j3", aircraftId: "a", title: "100 hour inspection", kind: "Inspection", start: d(11, 19), end: d(11, 21), maintainerIds: [], grounds: true, done: false, notes: "" });
    expect(dueList(data).find((x) => x.item.title === "100 hour inspection")!.state).toBe("planned");
    data.jobs = [];
    expect(dueList({ ...data }).every((x) => x.state === "unknown")).toBe(true);
  });
});
