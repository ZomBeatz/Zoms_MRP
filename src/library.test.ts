import { describe, expect, it } from "vitest";
import { addLines, addQualifications, qualLabel } from "./library";
import { emptyData } from "./sample";

describe("the library", () => {
  it("adds a line of business with the qualifications, equipment and schedule limitations it needs, once", () => {
    let d = addLines(emptyData(), ["fire"]);
    const fire = d.workTypes[0];
    expect(fire.name).toBe("Wildland fire");
    expect(d.trainings.map((t) => t.nickname).sort()).toEqual(["Bucket", "Long line", "Mountain"]);
    expect(fire.defaults?.requiredTrainingIds).toHaveLength(3);
    expect(d.equipment.map((e) => e.name).sort()).toEqual(["Cargo hook", "Fire bucket"]);
    expect(d.settings.ruleSets.find((r) => r.id === fire.defaults?.ruleSetId)?.maxFlightHoursPerDay).toBe(8);
    // A second line reuses what's there; adding the same line again changes nothing.
    d = addLines(d, ["utility", "fire"]);
    expect(d.workTypes).toHaveLength(2);
    expect(d.trainings.filter((t) => t.nickname === "Long line")).toHaveLength(1);
  });

  it("keeps qualifications already set up under the same name", () => {
    const d = emptyData();
    d.trainings = [{ id: "mine", name: "Night vision goggles (NVG)", validMonths: 24, appliesTo: "Pilot", notes: "" }];
    const r = addQualifications(d, ["nvg", "hoist"]);
    expect(r.ids.nvg).toBe("mine");
    expect(r.data.trainings).toHaveLength(2);
    expect(r.data.trainings[0].validMonths).toBe(24);
  });

  it("labels a qualification with its nickname", () => {
    expect(qualLabel({ name: "Competency check (135.293)", nickname: "293" })).toBe("Competency check (135.293)");
    expect(qualLabel({ name: "Hoist rescue", nickname: "Hoist" })).toBe("Hoist rescue");
    expect(qualLabel({ name: "Instrument rating", nickname: "IR" })).toBe("Instrument rating (IR)");
    expect(qualLabel({ name: "Instrument rating", nickname: "IR" }, true)).toBe("IR");
  });
});
