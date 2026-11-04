import { describe, expect, it } from "vitest";
import { fullReport, reportName } from "./report";
import { buildPdf } from "./reportPdf";
import { buildReportWorkbook } from "./reportExcel";
import { emptyData, sampleData } from "./sample";
import { dayAt, today } from "./time";

const DAY = 86_400_000;
const from = dayAt(today(), -30);
const to = dayAt(today(), 90);
// REPORT_OUT=folder writes the files there to look at.
const out = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.REPORT_OUT;
const save = async (name: string, bytes: Uint8Array) => {
  if (!out) return;
  const fs = "node:fs";
  ((await import(/* @vite-ignore */ fs)) as { writeFileSync: (p: string, b: Uint8Array) => void }).writeFileSync(`${out}/${name}`, bytes);
};

describe("reports", () => {
  const data = sampleData();

  it("covers every day of the period, on the boards and in the totals", () => {
    const r = fullReport(data, from, to);
    expect(r.dayList.length).toBe(120);
    expect(r.tails.every((t) => t.days.length === 120)).toBe(true);
    expect(r.days).toBeCloseTo(120, 0);
    expect(r.people.length).toBe(data.people.length);
    // Every span on a person's row touches the period.
    expect(r.people.every(({ spans }) => spans.every((s) => s.b > from && s.a < to))).toBe(true);
    expect(r.issues.every((i) => i.at >= from && i.at < to)).toBe(true);
  });

  it("names the file after the first and last day", () => {
    expect(reportName(new Date(2026, 10, 1).getTime(), new Date(2027, 1, 1).getTime(), "pdf")).toBe("zoms-mrp-report-2026-11-01-to-2027-01-31.pdf");
  });

  it("makes a PDF", async () => {
    const blob = await buildPdf(data, from, to);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    await save("report.pdf", bytes);
  });

  it("makes a PDF for an empty plan and a one-day period", async () => {
    const blob = await buildPdf(emptyData(), from, from + DAY);
    expect(blob.size).toBeGreaterThan(1000);
  });

  it("makes an Excel report", async () => {
    const blob = await buildReportWorkbook(data, from, to);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe("PK");
    await save("report.xlsx", bytes);
  });
});
