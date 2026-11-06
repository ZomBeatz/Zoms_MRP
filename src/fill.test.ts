import { describe, expect, it } from "vitest";
import { fillSeason } from "./fill";
import { findIssues, missionCoverage, whoCanCover } from "./coverage";
import { onRotation } from "./rotation";
import { emptyData } from "./sample";
import type { AppData, Person } from "./types";

const DAY = 86_400_000;
/** Midnight `n` days after Jan 1, 2031 (well clear of today). */
const t = (n: number) => new Date(2031, 0, 1 + n).getTime();
const d = (n: number) => { const x = new Date(t(n)); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}T00:00`; };
const pilot = (id: string, quals = ["Bell 412"]): Person => ({ id, name: id, role: "Pilot", quals, training: [], missionIds: [], rotation: null, base: "", phone: "", notes: "" });
const rules = { maxDaysOn: 21, minDaysOff: 7 };

function base(pilots: Person[], days = 70): AppData {
  const data = emptyData();
  data.aircraft = [
    { id: "a1", tail: "N1", type: "Bell 412", base: "", status: "Ready", seats: 2, notes: "" },
    { id: "a2", tail: "N2", type: "AS350", base: "", status: "Ready", seats: 1, notes: "" },
  ];
  data.people = pilots;
  data.missions = [{ id: "fire", name: "Fire", contact: "", location: "", requiredTrainingIds: [], color: "#c2410c", pattern: "solid", notes: "" }];
  data.seasons = [{ id: "s1", missionId: "fire", start: d(0), end: d(days), aircraftIds: ["a1"], pilotsNeeded: 1, maintainersNeeded: 0, pilotRotation: { on: 21, off: 14 }, maintainerRotation: null, status: "Planned", notes: "" }];
  return data;
}

describe("filling a job on its rotation", () => {
  it("rotates crew 3 weeks on, 2 weeks off, and covers the whole job", () => {
    const data = base([pilot("a"), pilot("b"), pilot("c")]);
    const shifts = fillSeason(data, data.seasons[0], "Pilot", { on: 21, off: 14 }, rules);
    const filled = { ...data, shifts };
    expect(missionCoverage(filled, data.seasons[0]).covered).toBe(1);
    for (const s of shifts) expect((new Date(s.end).getTime() - new Date(s.start).getTime()) / DAY).toBeLessThanOrEqual(21);
    // Everyone gets at least 14 days off between their stretches.
    for (const p of ["a", "b", "c"]) {
      const mine = shifts.filter((s) => s.personId === p).sort((x, y) => x.start.localeCompare(y.start));
      for (let i = 1; i < mine.length; i++) expect(Math.round((new Date(mine[i].start).getTime() - new Date(mine[i - 1].end).getTime()) / DAY)).toBeGreaterThanOrEqual(14);
    }
  });

  it("covers two seats at once, and leaves days open when nobody can take them", () => {
    const data = base([pilot("a"), pilot("b")], 42);
    data.seasons[0].pilotsNeeded = 2;
    const shifts = fillSeason(data, data.seasons[0], "Pilot", { on: 21, off: 14 }, rules);
    const cov = missionCoverage({ ...data, shifts }, data.seasons[0]);
    // Two pilots, both on for days 0-21, then both resting: days 21-35 are open, then they're back.
    expect(cov.pilotGaps.length).toBeGreaterThan(0);
    expect(Math.round((cov.pilotGaps[0].a - t(0)) / DAY)).toBe(21);
  });

  it("only uses someone on their own on days", () => {
    const p = pilot("rot");
    p.rotation = { on: 7, off: 7, start: d(0).slice(0, 10) };
    expect(onRotation(p.rotation, t(3))).toBe(true);
    expect(onRotation(p.rotation, t(10))).toBe(false);
    const data = base([p], 28);
    const shifts = fillSeason(data, data.seasons[0], "Pilot", null, rules);
    for (const s of shifts) {
      const start = Math.round((new Date(s.start).getTime() - t(0)) / DAY);
      expect(start % 14).toBeLessThan(7);
    }
    // They're not offered for a stretch that runs into their off week, and booking it is flagged.
    expect(whoCanCover(data, "Pilot", t(5), t(9), ["Bell 412"])[0].ok).toBe(false);
    const booked = { ...data, shifts: [{ id: "x", seasonId: "s1", personId: "rot", start: d(5), end: d(9) }] };
    expect(findIssues(booked).some((i) => i.id.startsWith("offrot-"))).toBe(true);
  });

  it("a job with several aircraft takes anyone rated on one of them", () => {
    const data = base([pilot("big"), pilot("small", ["AS350"]), pilot("neither", ["AW139"])]);
    data.seasons[0].aircraftIds = ["a1", "a2"];
    const ok = whoCanCover(data, "Pilot", t(0), t(5), ["Bell 412", "AS350"]).filter((c) => c.qualified).map((c) => c.person.id).sort();
    expect(ok).toEqual(["big", "small"]);
    const booked = { ...data, shifts: [{ id: "x", seasonId: "s1", personId: "neither", start: d(0), end: d(5) }] };
    expect(findIssues(booked).some((i) => i.id.startsWith("qual-"))).toBe(true);
  });

  it("keeps each pilot under the flight-hour limit", () => {
    const data = base([pilot("a"), pilot("b"), pilot("c"), pilot("d")], 90);
    data.aircraft[0].hoursPerDay = 6;
    data.settings.flightLimits = [{ hours: 100, days: 30 }];
    const shifts = fillSeason(data, data.seasons[0], "Pilot", { on: 21, off: 7 }, rules);
    const after = { ...data, shifts };
    expect(missionCoverage(after, data.seasons[0]).pilotGaps).toHaveLength(0);
    expect(findIssues(after).filter((i) => i.id.startsWith("fly-"))).toEqual([]);
    // 16 days at 6 hours is 96: nobody does a full 21-day hitch.
    expect(Math.max(...shifts.map((s) => Math.round((new Date(s.end).getTime() - new Date(s.start).getTime()) / DAY)))).toBeLessThanOrEqual(16);
  });
});
