import { describe, expect, it } from "vitest";
import { balanceStats, rebalance, seasonsIn } from "./balance";
import { sampleData } from "./sample";
import { dayAt, ms, overlaps, today } from "./time";

const from = dayAt(today(), 0);
const to = dayAt(today(), 90);

describe("balance", () => {
  it("rebalancing leaves fewer open seats, and books nobody on leave", () => {
    const data = sampleData();
    const before = balanceStats(data, from, to);
    const after = rebalance(data, from, to, { seasons: new Set(), people: new Set() }, new Set());
    const stats = balanceStats(after, from, to);
    expect(stats.serious).toBeLessThanOrEqual(before.serious);
    expect(stats.problems).toBeLessThanOrEqual(before.problems);
    expect(stats.openDays).toBeLessThanOrEqual(before.openDays);
    for (const s of after.shifts)
      for (const t of after.timeOff.filter((x) => x.personId === s.personId))
        if (!data.shifts.some((x) => x.id === s.id)) expect(overlaps(ms(s.start), ms(s.end), ms(t.start), ms(t.end)), `${s.id} during time off`).toBe(false);
  });

  it("starting over for every job adds no conflicts and fills more seats", () => {
    const data = sampleData();
    const before = balanceStats(data, from, to);
    const after = balanceStats(rebalance(data, from, to, { seasons: new Set(), people: new Set() }, "all"), from, to);
    expect(after.problems).toBeLessThanOrEqual(before.problems);
    expect(after.openDays).toBeLessThan(before.openDays);
  });

  it("keeps locked jobs and people exactly as they were, and anything outside the period", () => {
    const data = sampleData();
    const [locked] = seasonsIn(data, from, to);
    const person = data.shifts.find((s) => s.seasonId !== locked.id && ms(s.start) >= from && ms(s.end) <= to)!.personId;
    const after = rebalance(data, from, to, { seasons: new Set([locked.id]), people: new Set([person]) });
    const ids = (d: typeof data, f: (s: (typeof data.shifts)[number]) => boolean) => d.shifts.filter(f).map((s) => s.id).sort();
    expect(ids(after, (s) => s.seasonId === locked.id)).toEqual(ids(data, (s) => s.seasonId === locked.id));
    expect(ids(after, (s) => s.personId === person)).toEqual(ids(data, (s) => s.personId === person));
    expect(ids(after, (s) => ms(s.end) <= from || ms(s.start) >= to)).toEqual(ids(data, (s) => ms(s.end) <= from || ms(s.start) >= to));
  });

  it("frees people up when a job needs fewer pilots", () => {
    const data = sampleData();
    const busy = seasonsIn(data, from, to).find((b) => b.pilotsNeeded >= 2)!;
    const lean = { ...data, seasons: data.seasons.map((s) => (s.id === busy.id ? { ...s, pilotsNeeded: 1 } : s)) };
    const before = balanceStats(rebalance(data, from, to, { seasons: new Set(), people: new Set() }), from, to);
    const after = balanceStats(rebalance(lean, from, to, { seasons: new Set(), people: new Set() }), from, to);
    const total = (s: typeof before) => s.people.reduce((t, p) => t + p.on, 0);
    expect(total(after)).toBeLessThan(total(before));
  });
});
