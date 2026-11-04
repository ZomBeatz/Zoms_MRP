import { describe, expect, it } from "vitest";
import { findIssues, missionCoverage } from "./coverage";
import { fixesFor } from "./fixes";
import { bookings } from "./bookings";
import { sampleData } from "./sample";
import type { AppData } from "./types";

const TABS: Record<string, (string | undefined)[]> = {
  season: ["details", "pilots", "maintainers"],
  person: ["details", "work", "training"],
  job: [undefined], aircraft: [undefined], timeOff: [undefined],
};

/** The fix points at something that exists, on a tab its form has. */
function checkFix(data: AppData, f: ReturnType<typeof fixesFor>[number]) {
  const list = { season: data.seasons, person: data.people, job: data.jobs, aircraft: data.aircraft, timeOff: data.timeOff }[f.kind];
  expect(list.some((x) => x.id === f.id), `${f.kind} ${f.id} exists`).toBe(true);
  expect(TABS[f.kind]).toContain(f.tab);
  const spot = f.spot ?? "";
  if (spot.startsWith("shift:")) {
    const shift = data.shifts.find((s) => s.id === spot.slice(6));
    expect(shift?.seasonId, "the shift is on that season").toBe(f.id);
    const role = data.people.find((p) => p.id === shift!.personId)!.role;
    expect(f.tab).toBe(role === "Pilot" ? "pilots" : "maintainers");
  }
  if (spot.startsWith("gap:")) {
    const b = bookings(data).find((x) => x.id === f.id)!;
    const cov = missionCoverage(data, b);
    const gaps = f.tab === "pilots" ? cov.pilotGaps : cov.maintainerGaps;
    expect(gaps.map((g) => String(g.a)), "the open seat is in that tab's list").toContain(spot.slice(4));
  }
  if (spot.startsWith("training:")) {
    expect(f.kind).toBe("person");
    expect(data.trainings.some((t) => t.id === spot.slice(9))).toBe(true);
  }
}

describe("fixes", () => {
  it("gives every problem in the demo a fix that points at something real", () => {
    const data = sampleData();
    const issues = findIssues(data);
    expect(issues.length).toBeGreaterThan(5);
    for (const i of issues) {
      const fixes = fixesFor(data, i);
      expect(fixes.length, i.id).toBeGreaterThan(0);
      for (const f of fixes) checkFix(data, f);
    }
  });

  it("sends training problems to the person's training, at that course", () => {
    const data = sampleData();
    const train = findIssues(data).filter((i) => /^(train|lapsed|renew)-/.test(i.id));
    expect(train.length).toBeGreaterThan(0);
    for (const i of train) {
      const [first] = fixesFor(data, i);
      expect(first).toMatchObject({ kind: "person", id: i.personId, tab: "training", spot: `training:${i.trainingId}` });
    }
  });

  it("sends an open seat to that seat, and a bad aircraft to the aircraft", () => {
    const data = sampleData();
    const issues = findIssues(data);
    const gap = issues.find((i) => i.id.startsWith("pgap-"))!;
    expect(fixesFor(data, gap)[0]).toMatchObject({ kind: "season", id: gap.seasonId, tab: "pilots", spot: `gap:${gap.at}` });
    // Book a grounding job over a season's aircraft.
    const s = data.seasons.find((x) => x.aircraftIds.length && (x.status === "Confirmed" || x.status === "Flying"))!;
    data.jobs.push({ id: "jx", aircraftId: s.aircraftIds[0], title: "Engine change", kind: "Repair", start: s.start, end: s.end, maintainerIds: [], grounds: true, done: false, notes: "" });
    const clash = findIssues(data).find((i) => i.id.startsWith(`acjob-${s.id}-jx`))!;
    expect(fixesFor(data, clash).map((f) => [f.kind, f.spot])).toEqual([["season", "aircraft"], ["job", "dates"]]);
  });

  it("covers every kind of problem", () => {
    const data = sampleData();
    const live = data.seasons.filter((x) => x.aircraftIds.length && (x.status === "Confirmed" || x.status === "Flying"));
    const [s1, s2] = live;
    const ac = (id: string) => data.aircraft.find((a) => a.id === id)!;
    const pilotOn = (sid: string) => data.shifts.find((x) => x.seasonId === sid && data.people.find((p) => p.id === x.personId)?.role === "Pilot")!;
    const person = (id: string) => data.people.find((p) => p.id === id)!;
    // An aircraft that's grounded, in maintenance, and on two jobs at once.
    ac(s1.aircraftIds[0]).status = "Grounded";
    data.jobs.push({ id: "jx", aircraftId: s2.aircraftIds[0], title: "Engine change", kind: "Repair", start: s2.start, end: s2.end, maintainerIds: [], grounds: true, done: false, notes: "" });
    data.seasons.push({ ...s2, id: "twin", aircraftIds: [s2.aircraftIds[0]] });
    // A confirmed job with no aircraft, and one that ends before it starts.
    data.seasons.push({ ...s1, id: "noac", aircraftIds: [] }, { ...s1, id: "backwards", start: s1.end, end: s1.start });
    // A pilot on a type they aren't rated on, on their days off, outside the season, during time off, and backwards.
    const sh = pilotOn(s1.id);
    const p = person(sh.personId);
    p.quals = [];
    p.rotation = { on: 1, off: 30, start: "2000-01-01" };
    data.shifts.push({ ...sh, id: "early", start: "2000-01-01T00:00", end: sh.end }, { ...sh, id: "bwd", start: sh.end, end: sh.start });
    data.timeOff.push({ id: "tx", personId: p.id, start: sh.start, end: sh.end, reason: "Sick" });
    // Too many pilots for the seats.
    for (const q of data.people.filter((x) => x.role === "Pilot").slice(0, 4)) data.shifts.push({ ...sh, id: `crowd-${q.id}`, personId: q.id });
    // A maintainer on a job for a type they aren't rated on.
    const m = data.people.find((x) => x.role === "Maintainer")!;
    data.jobs.push({ id: "jq", aircraftId: data.aircraft.find((a) => !m.quals.includes(a.type))!.id, title: "Check", kind: "Inspection", start: s1.start, end: s1.end, maintainerIds: [m.id], grounds: false, done: false, notes: "" });
    data.settings.rules = { maxDaysOn: 3, minDaysOff: 40 };

    const issues = findIssues(data);
    const kinds = new Set(issues.map((i) => i.id.slice(0, i.id.indexOf("-"))));
    for (const k of ["time", "noac", "acstat", "acjob", "acdbl", "pgap", "seats", "qual", "offrot", "outside", "stime", "jqual", "dbl", "off", "duty", "rest", "train", "lapsed", "renew"])
      expect(kinds, k).toContain(k);
    for (const i of issues) {
      const fixes = fixesFor(data, i);
      expect(fixes.length, i.id).toBeGreaterThan(0);
      for (const f of fixes) checkFix(data, f);
    }
  });
});
