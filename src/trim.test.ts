import { describe, expect, it } from "vitest";
import { trim } from "./trim";
import { emptyData } from "./sample";
import type { AppData, Person } from "./types";

const d = (n: number) => `2030-11-${String(n).padStart(2, "0")}T00:00`;
const person = (id: string, role: Person["role"] = "Pilot"): Person => ({ id, name: id, role, quals: [], training: [], missionIds: [], rotation: null, base: "", phone: "", notes: "" });

/** A season Nov 1–28 with a handover from Ann to Bo on Nov 15, and Cy (a maintainer) on Nov 10–20. */
function plan(): AppData {
  const data = emptyData();
  data.people = [person("ann"), person("bo"), person("cy", "Maintainer")];
  data.seasons = [{ id: "s", missionId: "m", start: d(1), end: d(29), aircraftIds: [], pilotsNeeded: 1, maintainersNeeded: 1, pilotRotation: null, maintainerRotation: null, status: "Confirmed", notes: "" }];
  data.shifts = [
    { id: "a", seasonId: "s", personId: "ann", start: d(1), end: d(15) },
    { id: "b", seasonId: "s", personId: "bo", start: d(15), end: d(29) },
    { id: "c", seasonId: "s", personId: "cy", start: d(10), end: d(21) },
  ];
  return data;
}
const shift = (data: AppData, id: string) => data.shifts.find((s) => s.id === id)!;

describe("trimming shifts", () => {
  it("moves a handover together, so the seat stays covered", () => {
    const { data, moved } = trim(plan(), "a", "end", 3);
    expect(moved).toBe(3);
    expect(shift(data, "a").end).toBe(d(18));
    expect(shift(data, "b").start).toBe(d(18));
  });

  it("moves just the one with solo (Alt)", () => {
    const { data } = trim(plan(), "a", "end", -2, true);
    expect(shift(data, "a").end).toBe(d(13));
    expect(shift(data, "b").start).toBe(d(15));
  });

  it("keeps both shifts at least a day, and pilots inside the season", () => {
    expect(shift(trim(plan(), "a", "end", 99).data, "b").start).toBe(d(28)); // Bo keeps his last day
    expect(shift(trim(plan(), "a", "start", -5).data, "a").start).toBe(d(1)); // not before the season
    expect(shift(trim(plan(), "b", "end", 5).data, "b").end).toBe(d(29)); // not after it
    expect(shift(trim(plan(), "a", "end", -99, true).data, "a").end).toBe(d(2)); // a day is the least
  });

  it("lets a maintainer come early or stay late", () => {
    const { data } = trim(plan(), "c", "start", -12);
    expect(shift(data, "c").start).toBe("2030-10-29T00:00");
  });

  it("with two pilots swapping the same day, moves the linked replacement, never a guess", () => {
    const data = plan();
    data.people.push(person("cal"), person("dee"));
    data.seasons[0].pilotsNeeded = 2;
    data.shifts.push({ id: "c1", seasonId: "s", personId: "cal", start: d(1), end: d(15) }, { id: "d1", seasonId: "s", personId: "dee", start: d(15), end: d(29) });
    // No links: two meet Ann's end, so only Ann moves.
    const loose = trim(data, "a", "end", 2);
    expect(loose.partner).toBeUndefined();
    expect(shift(loose.data, "b").start).toBe(d(15));
    expect(shift(loose.data, "d1").start).toBe(d(15));
    // Linked: Bo took over from Ann, Dee from Cal.
    shift(data, "b").after = "a";
    shift(data, "d1").after = "c1";
    const r = trim(data, "a", "end", 2);
    expect(r.partner?.id).toBe("b");
    expect(shift(r.data, "b").start).toBe(d(17));
    expect(shift(r.data, "d1").start).toBe(d(15));
    expect(trim(data, "c1", "end", -3).partner?.id).toBe("d1");
  });
});
