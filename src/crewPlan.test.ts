import { describe, expect, it } from "vitest";
import { planCrew, seatsFor, whatIfs, type PlanInput } from "./crewPlan";

const ac = (staffedHours: number, flightHours = 0) => ({ label: "", staffedHours, flightHours });

/** Every day has at least the seats on, nobody's hitch is too long, and rest between is long enough. */
function valid(input: PlanInput, hitches: [number, number][][], seats: number) {
  for (let d = 0; d < input.days; d++) expect(hitches.filter((h) => h.some(([a, b]) => a <= d && d < b)).length).toBeGreaterThanOrEqual(seats);
  for (const h of hitches)
    h.forEach(([a, b], i) => {
      expect(b - a).toBeLessThanOrEqual(input.maxDaysOn);
      if (i) expect(a - h[i - 1][1]).toBeGreaterThanOrEqual(input.minDaysOff);
    });
}

describe("the crew planner", () => {
  it("staffs two aircraft Jun 1 to Sep 15 with three pilots on 21-day hitches", () => {
    const input: PlanInput = { aircraft: [ac(12), ac(12)], days: 107, maxDaysOn: 21, minDaysOff: 10, maxDutyHours: 14, flightLimits: [] };
    const r = planCrew(input);
    expect(r.ok && r.plan.pilots).toBe(3);
    if (r.ok) valid(input, r.plan.groups[0].hitches, 2);
    // A day more off than half a hitch takes a fourth.
    const r2 = planCrew({ ...input, minDaysOff: 11 });
    expect(r2.ok && r2.plan.pilots).toBe(4);
  });

  it("needs nine pilots for two 12-hour and two 24-hour aircraft on 28 on, 14 off", () => {
    const input: PlanInput = { aircraft: [ac(12), ac(12), ac(24), ac(24)], days: 120, maxDaysOn: 28, minDaysOff: 14, maxDutyHours: 14, flightLimits: [] };
    const r = planCrew(input);
    expect(r.ok && r.plan.seats).toBe(6);
    expect(r.ok && r.plan.pilots).toBe(9);
    if (r.ok) {
      valid(input, r.plan.groups[0].hitches, 6);
      expect(r.plan.groups[0].restFloor).toBe(9);
      expect(r.plan.groups[0].limitedBy).toBe("rest");
      // Fewer pilots means changing a rule; the suggestions really need one fewer.
      for (const w of whatIfs(input, r.plan).filter((x) => x.pilots === 8)) expect(w.text).toMatch(/instead of/);
    }
  });

  it("keeps each pilot under 100 flight hours in 30 days with four pilots for two aircraft flying 6 hours", () => {
    const input: PlanInput = { aircraft: [ac(12, 6), ac(12, 6)], days: 180, maxDaysOn: 60, minDaysOff: 0, maxDutyHours: 14, flightLimits: [{ hours: 100, days: 30 }] };
    const r = planCrew(input);
    expect(r.ok && r.plan.pilots).toBe(4);
    if (r.ok) {
      expect(r.plan.groups[0].limitedBy).toBe("flight");
      expect(r.plan.groups[0].mostFlight[0].hours).toBeLessThanOrEqual(100);
      valid(input, r.plan.groups[0].hitches, 2);
    }
    // Eight hours a day each takes five.
    const r8 = planCrew({ ...input, aircraft: [ac(12, 8), ac(12, 8)] });
    expect(r8.ok && r8.plan.pilots).toBe(5);
  });

  it("needs no rotation for a job shorter than a hitch", () => {
    const r = planCrew({ aircraft: [ac(12), ac(12)], days: 20, maxDaysOn: 21, minDaysOff: 10, maxDutyHours: 14, flightLimits: [] });
    expect(r.ok && r.plan.pilots).toBe(2);
  });

  it("brings a pilot back for the end of a short job", () => {
    const input: PlanInput = { aircraft: [ac(12), ac(12)], days: 25, maxDaysOn: 21, minDaysOff: 14, maxDutyHours: 14, flightLimits: [] };
    const r = planCrew(input);
    expect(r.ok && r.plan.pilots).toBe(3);
    if (r.ok) valid(input, r.plan.groups[0].hitches, 2);
  });

  it("splits a staffed day into duty days no longer than allowed", () => {
    expect(seatsFor(ac(24), 14)).toBe(2);
    expect(seatsFor(ac(24), 12)).toBe(2);
    expect(seatsFor(ac(24), 8)).toBe(3);
    expect(seatsFor(ac(12), 14)).toBe(1);
    expect(seatsFor(ac(0), 14)).toBe(0);
  });

  it("says why when it can't be done", () => {
    expect(planCrew({ aircraft: [], days: 30, maxDaysOn: 14, minDaysOff: 7, maxDutyHours: 14, flightLimits: [] }).ok).toBe(false);
    expect(planCrew({ aircraft: [ac(12, 8)], days: 30, maxDaysOn: 14, minDaysOff: 7, maxDutyHours: 14, flightLimits: [{ hours: 5, days: 30 }] }).ok).toBe(false);
  });

  it("plans each aircraft type's pilots apart, since only rated pilots can fly it", () => {
    const input: PlanInput = { aircraft: [{ ...ac(12), type: "Bell 412" }, { ...ac(12), type: "AS350" }], days: 107, maxDaysOn: 21, minDaysOff: 10, maxDutyHours: 14, flightLimits: [] };
    const r = planCrew(input);
    // Together 3 would do; one seat per type needs 2 each.
    expect(r.ok && r.plan.groups.map((g) => [g.key, g.pilots])).toEqual([["AS350", 2], ["Bell 412", 2]]);
    expect(r.ok && r.plan.pilots).toBe(4);
  });

  it("puts a 24-hour aircraft's night pilot in a group of their own", () => {
    const r = planCrew({ aircraft: [{ ...ac(24), type: "Bell 412", night: true }], days: 120, maxDaysOn: 28, minDaysOff: 14, maxDutyHours: 14, flightLimits: [] });
    expect(r.ok && r.plan.groups.map((g) => [g.key, g.seats])).toEqual([["Bell 412", 1], ["Bell 412 · night", 1]]);
  });

  it("counts travel days as days on, not days off", () => {
    const input: PlanInput = { aircraft: [ac(12), ac(12)], days: 107, maxDaysOn: 21, minDaysOff: 10, maxDutyHours: 14, flightLimits: [] };
    const r = planCrew({ ...input, travelDays: 1 });
    expect(r.ok && [r.plan.pilots, r.plan.groups[0].on]).toEqual([4, 19]);
    if (r.ok) {
      // Each pilot's seats are 19 days at most, with 12 days between (travel home, 10 off, travel back).
      for (const h of r.plan.groups[0].hitches) h.forEach(([a, b], i) => {
        expect(b - a).toBeLessThanOrEqual(19);
        if (i) expect(a - h[i - 1][1]).toBeGreaterThanOrEqual(12);
      });
    }
  });

  it("takes more pilots when the rest between duty days shortens the duty day", () => {
    // 14-hour duty days but 12 hours' rest makes 12-hour duty days: 16 or 24 hours takes two; 14 hours' rest, three.
    expect(seatsFor(ac(16), 14, 12)).toBe(2);
    expect(seatsFor(ac(24), 14, 12)).toBe(2);
    expect(seatsFor(ac(24), 14, 14)).toBe(3);
  });

  it("keeps under every flight limit at once", () => {
    const input: PlanInput = { aircraft: [ac(12, 4)], days: 365, maxDaysOn: 60, minDaysOff: 0, maxDutyHours: 14, flightLimits: [{ hours: 100, days: 30 }, { hours: 1000, days: 365 }] };
    const r = planCrew(input);
    // 4 hours a day all year is 1,460 hours: the yearly limit needs 2 pilots, the monthly one alone 2 as well.
    expect(r.ok && r.plan.pilots).toBe(2);
    if (r.ok) for (const m of r.plan.groups[0].mostFlight) expect(m.hours).toBeLessThanOrEqual(m.limit.hours);
    const strict = planCrew({ ...input, flightLimits: [{ hours: 100, days: 30 }, { hours: 600, days: 365 }] });
    expect(strict.ok && strict.plan.pilots).toBe(3);
  });
});
