import { describe, expect, it } from "vitest";
import { expiryFor, qualificationsDue as dueList, withRenewals } from "./certificates";
import { findIssues, neededTraining } from "./coverage";
import { emptyData } from "./sample";
import type { AppData, Person } from "./types";

const d = (n: number) => `2030-11-${String(n).padStart(2, "0")}T00:00`;
const pilot = (id: string, name: string): Person => ({ id, name, role: "Pilot", quals: ["Bell 412"], training: [], missionIds: [], rotation: null, base: "", phone: "", notes: "" });

function base(): AppData {
  const data = emptyData();
  data.aircraft = [{ id: "a1", tail: "N1", type: "Bell 412", base: "", status: "Airworthy", seats: 2, notes: "" }];
  data.people = [pilot("p1", "Alex")];
  data.missions = [{ id: "fire", name: "Fire season", contact: "", requiredTrainingIds: [], location: "", color: "#c2410c", pattern: "solid", notes: "" }];
  data.seasons = [{ id: "m1", missionId: "fire", start: d(1), end: d(15), aircraftIds: ["a1"], pilotRotation: null, maintainerRotation: null, pilotsNeeded: 1, maintainersNeeded: 0, status: "Confirmed", notes: "" }];
  data.shifts = [{ id: "s1", seasonId: "m1", personId: "p1", start: d(1), end: d(15) }];
  data.trainings = [{ id: "med", name: "Second class medical", validMonths: 12, appliesTo: "Pilot", notes: "", kind: "medical", everyone: true, endOfMonth: true }];
  return data;
}

describe("certificates", () => {
  it("runs out at the end of the month it falls due in, or never", () => {
    expect(expiryFor({ validMonths: 12, endOfMonth: true }, "2026-03-14")).toBe("2027-04-01");
    expect(expiryFor({ validMonths: 12 }, "2026-03-14")).toBe("2027-03-14");
    expect(expiryFor({ validMonths: 0, endOfMonth: true }, "2026-03-14")).toBeNull();
  });

  it("is needed by everyone in the role and checked on every booking, whatever the job", () => {
    const data = base();
    expect(neededTraining(data, data.people[0]).get("med")).toEqual([]);
    const train = () => findIssues({ ...data }).filter((i) => i.id.startsWith("train-"));
    expect(train()).toHaveLength(1);
    expect(train()[0].title).toBe("Alex has no Second class medical on record");
    expect(train()[0].detail).toContain("Every pilot needs it");
    data.people[0].training = [{ trainingId: "med", completed: "2030-06-02", expires: expiryFor(data.trainings[0], "2030-06-02") }];
    expect(train()).toHaveLength(0);
    // Not for maintainers.
    expect(neededTraining(data, { ...data.people[0], role: "Maintainer" }).has("med")).toBe(false);
  });

  it("records the certificates a course renews, on the same day", () => {
    const data = base();
    data.trainings.push({ id: "ground", name: "Recurrent ground school", validMonths: 12, appliesTo: "Pilot", notes: "" });
    data.trainings[0].renewedBy = ["ground"];
    const recs = withRenewals(data, { trainingId: "ground", completed: "2030-05-10", expires: "2031-05-10" });
    expect(recs.map((r) => r.trainingId)).toEqual(["ground", "med"]);
    expect(recs[1]).toMatchObject({ completed: "2030-05-10", expires: "2031-06-01", renewedFrom: "ground" });
  });

  it("lists what's missing, expired and running out, worst first, counting a renewal booked ahead", () => {
    const data = base();
    const now = new Date("2030-11-01T00:00").getTime();
    data.trainings.push({ id: "chk", name: "Competency check", validMonths: 12, appliesTo: "Pilot", notes: "", kind: "check", everyone: true });
    data.people[0].training = [{ trainingId: "chk", completed: "2029-11-20", expires: "2030-11-20" }];
    let rows = dueList(data, 30, now);
    expect(rows.map((r) => [r.training.id, r.state])).toEqual([["med", "missing"], ["chk", "soon"]]);
    data.people[0].training.push({ trainingId: "chk", completed: "2030-11-10", expires: "2031-11-10" });
    rows = dueList(data, 30, now);
    expect(rows.find((r) => r.training.id === "chk")?.state).toBe("ok");
  });
});

describe("medicals", () => {
  it("lasts by class, privileges and age at the exam, to the end of the month", async () => {
    const { medicalExpiry, medicalStages, ageOn } = await import("./certificates");
    const exam = { completed: "2026-03-14" };
    expect(ageOn("1990-03-15", "2026-03-14")).toBe(35);
    expect(ageOn("1986-03-14", "2026-03-14")).toBe(40);
    // Commercial: first or second class, 12 months, any age.
    expect(medicalExpiry({ ...exam, medicalClass: 2 }, "1990-01-01", "commercial")).toBe("2027-04-01");
    expect(medicalExpiry({ ...exam, medicalClass: 1 }, "1960-01-01", "commercial")).toBe("2027-04-01");
    // A third class doesn't cover commercial at all.
    expect(medicalExpiry({ ...exam, medicalClass: 3 }, "1990-01-01", "commercial")).toBe("2026-03-14");
    // Private: 60 months under 40, 24 at 40 or over (and 24 without a date of birth).
    expect(medicalExpiry({ ...exam, medicalClass: 3 }, "1990-01-01", "private")).toBe("2031-04-01");
    expect(medicalExpiry({ ...exam, medicalClass: 3 }, "1980-01-01", "private")).toBe("2028-04-01");
    expect(medicalExpiry({ ...exam, medicalClass: 3 }, null, "private")).toBe("2028-04-01");
    // Airline transport: first class only, 12 months under 40, 6 at 40 or over.
    expect(medicalExpiry({ ...exam, medicalClass: 1 }, "1990-01-01", "atp")).toBe("2027-04-01");
    expect(medicalExpiry({ ...exam, medicalClass: 1 }, "1980-01-01", "atp")).toBe("2026-10-01");
    expect(medicalExpiry({ ...exam, medicalClass: 2 }, "1990-01-01", "atp")).toBe("2026-03-14");
    // A special issuance ending sooner ends it then.
    expect(medicalExpiry({ ...exam, medicalClass: 2, specialIssuanceUntil: "2026-12-01" }, "1990-01-01")).toBe("2026-12-01");
    // What it covers, step by step.
    expect(medicalStages({ ...exam, medicalClass: 2 }, "1980-01-01")).toEqual([{ privileges: "commercial", until: "2027-04-01" }, { privileges: "private", until: "2028-04-01" }]);
  });
});

describe("backups", () => {
  it("leaves a backup's attached files out of the plan itself", async () => {
    const { migrate } = await import("./migrate");
    const d = migrate({ ...emptyData(), files: { f1: { type: "application/pdf", data: "JVBERg==" } } });
    expect("files" in d).toBe(false);
  });
});
