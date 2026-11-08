import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { buildWorkbook } from "./excel";
import { sampleData } from "./sample";

describe("Export to Excel", () => {
  it("writes every sheet from the demo, with real dates", async () => {
    const data = sampleData();
    const blob = await buildWorkbook(data);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await blob.arrayBuffer());
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Fleet board", "Fleet use", "Seasons", "Crew roster", "Qualifications", "Maintenance", "Problems"]);
    // One row per active tail on the board (plus the header and the note underneath).
    expect(wb.getWorksheet("Fleet board")!.getColumn(1).values.filter(Boolean).length).toBeGreaterThanOrEqual(13);
    const seasons = wb.getWorksheet("Seasons")!;
    expect(seasons.rowCount - 1).toBe(data.seasons.filter((s) => s.status !== "Cancelled").length);
    expect(seasons.getRow(2).getCell(3).value).toBeInstanceOf(Date);
    expect(wb.getWorksheet("Crew roster")!.rowCount - 1).toBe(data.shifts.length);
  });
});
