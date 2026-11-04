import { describe, expect, it } from "vitest";
import { buildTemplate, dateOf, parseCsv, planImport } from "./importer";
import { emptyData } from "./sample";

describe("import", () => {
  it("reads CSV with quotes and commas", () => {
    expect(parseCsv('Name,Rated on\n"Rivera, Alex","Bell 412, AS350 B3"\n\n')).toEqual([["Name", "Rated on"], ["Rivera, Alex", "Bell 412, AS350 B3"]]);
  });

  it("reads dates written different ways", () => {
    expect(dateOf("2026-03-14")).toBe("2026-03-14");
    expect(dateOf("3/14/2026")).toBe("2026-03-14");
    expect(dateOf(new Date(Date.UTC(2026, 2, 14)))).toBe("2026-03-14");
    expect(dateOf("not a date")).toBeNull();
  });

  it("adds and updates people, aircraft, courses and records, and says what it skipped", () => {
    const data = emptyData();
    data.people = [{ id: "x", name: "Alex Rivera", role: "Pilot", quals: ["AS350 B3"], training: [], missionIds: [], rotation: null, base: "", phone: "", notes: "" }];
    const plan = planImport(data, [
      { name: "People", rows: [["Name", "Role", "Rated on"], ["alex rivera", "Pilot", "Bell 412"], ["Sam Lee", "Maintainer", "Bell 412"]] },
      { name: "Aircraft", rows: [["Tail", "Type", "Flight hours", "Hours as of"], ["n412zm", "Bell 412", 4812.5, "2026-10-01"], ["N9", "", "", ""]] },
      { name: "Courses", rows: [["Course", "Renew every (months)", "For"], ["NVG", 12, "Pilots"]] },
      { name: "Training", rows: [["Person", "Course", "Completed", "Runs out"], ["Alex Rivera", "NVG", "2026-03-14", ""], ["Nobody", "NVG", "2026-03-14", ""]] },
    ]);
    expect(plan.added).toEqual({ people: 1, aircraft: 1, courses: 1, records: 1 });
    expect(plan.updated.people).toBe(1);
    const alex = plan.data.people.find((p) => p.id === "x")!;
    expect(alex.quals.sort()).toEqual(["AS350 B3", "Bell 412"]);
    expect(alex.training[0]).toEqual({ trainingId: plan.data.trainings[0].id, completed: "2026-03-14", expires: "2027-03-14" });
    expect(plan.data.aircraft[0]).toMatchObject({ tail: "N412ZM", type: "Bell 412", hours: { hours: 4812.5, on: "2026-10-01" } });
    expect(plan.skipped).toHaveLength(2);
  });

  it("makes a template that imports as nothing", async () => {
    const blob = await buildTemplate();
    expect(blob.size).toBeGreaterThan(3000);
  });
});
