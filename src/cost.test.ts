import { describe, expect, it } from "vitest";
import { seasonCost } from "./cost";
import { findIssues } from "./coverage";
import { bookings } from "./bookings";
import { emptyData } from "./sample";

const d = (n: number) => `2030-11-${String(n).padStart(2, "0")}T00:00`;

function plan() {
  const data = emptyData();
  data.aircraft = [{ id: "a", tail: "N1", type: "Bell 412", base: "", status: "Airworthy", seats: 2, notes: "", hourCost: 1000, hoursPerDay: 2 }];
  data.missions = [{ id: "m", name: "Fire", contact: "", location: "", requiredTrainingIds: [], color: "#c2410c", pattern: "solid", notes: "", dayCharge: 9000 }];
  data.seasons = [{ id: "s", missionId: "m", start: d(1), end: d(11), aircraftIds: ["a"], pilotsNeeded: 1, maintainersNeeded: 0, pilotRotation: null, maintainerRotation: null, status: "Confirmed", notes: "" }];
  data.people = [{ id: "p", name: "Ann", role: "Pilot", quals: ["Bell 412"], training: [], missionIds: [], rotation: null, base: "", phone: "", notes: "", dayRate: 800 }];
  data.shifts = [{ id: "x", seasonId: "s", personId: "p", start: d(1), end: d(11) }];
  return data;
}

describe("cost per mission", () => {
  it("adds crew days × day rates and flying days × hours × cost per hour, against the charge", () => {
    const data = plan();
    const b = bookings(data)[0];
    // 10 days: crew 10 × 800, flying 10 × 2 h × 1,000, charged 10 × 9,000.
    expect(seasonCost(data, b, new Date(d(1)).getTime(), new Date(d(29)).getTime())).toEqual({ crew: 8000, flying: 20000, total: 28000, charged: 90000, margin: 62000 });
  });

  it("flags duty days longer than allowed", () => {
    const data = plan();
    data.settings.maxDutyHours = 14;
    data.seasons[0].dutyHours = 16;
    expect(findIssues(data).some((i) => i.id === "dutyh-s")).toBe(true);
    // The app never changes a plan in place, so neither does this (bookings are cached per plan).
    const shorter = { ...data, seasons: [{ ...data.seasons[0], dutyHours: 12 }] };
    expect(findIssues(shorter).some((i) => i.id.startsWith("dutyh-"))).toBe(false);
  });
});
