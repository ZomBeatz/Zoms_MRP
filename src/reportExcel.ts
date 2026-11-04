import { format } from "date-fns";
import type { Worksheet } from "exceljs";
import type { AppData } from "./types";
import { fullReport, REPORT_COLORS, TRAINING_WORDS, type Span } from "./report";
import { missionCoverage } from "./coverage";
import { seasonTails } from "./rotation";
import { textOn } from "./look";
import { hasRates, seasonCost } from "./cost";
import { DAY, ms, today } from "./time";

/**
 * The report as an Excel workbook for one period: a summary with the numbers and in-cell bars, the fleet
 * and crew boards colored day by day like the app, and tables for missions, crew, training, maintenance
 * and problems. Every sheet prints landscape, one page wide.
 */

const BLUE = "#2580c3", INK = "#14171f", MUTED = "#5b6375", PANEL = "#f5f7fa", GROUP = "#eef1f5";
const argb = (hex: string) => "FF" + hex.replace("#", "").toUpperCase().padEnd(6, "0").slice(0, 6);
const fill = (hex: string) => ({ type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: argb(hex) } });
const STANDING = { ok: "#dcfce7", "runs-out": "#fef3c7", expired: "#fee2e2", missing: "#fee2e2" } as const;

export async function buildReportWorkbook(data: AppData, from: number, to: number): Promise<Blob> {
  // exceljs is big, so it only loads when someone makes a report.
  const ExcelJS = (await import("exceljs/dist/exceljs.min.js")).default as typeof import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Zom's MRP";
  wb.created = new Date();
  const r = fullReport(data, from, to);
  const day = (t: number) => new Date(t);
  const lastDay = (t: number) => new Date(t - DAY / 2);

  const printable = (ws: Worksheet) => {
    ws.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };
    ws.headerFooter = { oddFooter: `&L&8Zom's MRP report, ${r.periodText}&R&8Page &P of &N` };
  };

  /** A table sheet: a title, the period, then a blue, frozen, filtered header row. */
  const table = (name: string, title: string, columns: { header: string; key: string; width: number; date?: boolean; pct?: boolean }[]) => {
    const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 4, showGridLines: false }] });
    ws.properties.tabColor = { argb: argb(BLUE) };
    columns.forEach((c, i) => {
      const col = ws.getColumn(i + 1);
      col.key = c.key;
      col.width = c.width;
      if (c.date) col.numFmt = "mmm d, yyyy";
      if (c.pct) col.numFmt = "0%";
    });
    ws.getCell("A1").value = title;
    ws.getCell("A1").font = { size: 16, bold: true, color: { argb: argb(INK) } };
    ws.getCell("A2").value = r.periodText;
    ws.getCell("A2").font = { color: { argb: argb(MUTED) } };
    const head = ws.getRow(4);
    head.values = columns.map((c) => c.header);
    head.font = { bold: true, color: { argb: "FFFFFFFF" } };
    head.height = 22;
    head.alignment = { vertical: "middle" };
    columns.forEach((_, i) => (head.getCell(i + 1).fill = fill(BLUE)));
    ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: columns.length } };
    printable(ws);
    return ws;
  };

  /** Bars inside the cells of a column, from 0 to `max`. */
  const dataBar = (ws: Worksheet, ref: string, color: string, max = 1) =>
    ws.addConditionalFormatting({
      ref,
      rules: [{ type: "dataBar", priority: 1, gradient: false, minLength: 0, maxLength: 100, cfvo: [{ type: "num", value: 0 }, { type: "num", value: max }], color: { argb: argb(color) } } as never],
    });

  const line = (ws: Worksheet, text: string) => {
    const row = ws.addRow([text]);
    row.font = { italic: true, color: { argb: argb(MUTED) } };
  };

  // ---- Summary: the numbers as tiles, days by mission and aircraft use with bars in the cells.
  {
    const ws = wb.addWorksheet("Summary", { views: [{ showGridLines: false }] });
    ws.properties.tabColor = { argb: argb("#ec6a3f") };
    ws.getColumn(1).width = 2;
    for (let c = 2; c <= 14; c++) ws.getColumn(c).width = 13;
    ws.getColumn(2).width = 30;
    ws.getColumn(9).width = 12;
    ws.getCell("B2").value = "Zom's MRP plan report";
    ws.getCell("B2").font = { size: 22, bold: true, color: { argb: argb(INK) } };
    ws.getCell("B3").value = `${r.periodText}  ·  ${Math.round(r.days)} days`;
    ws.getCell("B3").font = { size: 12, color: { argb: argb(MUTED) } };
    ws.getCell("B4").value = `Made on ${format(new Date(), "MMM d, yyyy")}`;
    ws.getCell("B4").font = { italic: true, color: { argb: argb(MUTED) } };

    const fleetUse = r.fleet.length ? r.fleet.reduce((t, f) => t + f.flying, 0) / (r.fleet.length * r.days) : 0;
    const crewShare = r.crew.length ? r.crew.reduce((t, c) => t + c.on, 0) / (r.crew.length * r.days) : 0;
    const problems = r.issues.filter((i) => i.severity === "danger").length;
    const tiles: [string, number, string, string][] = [
      ["Missions", r.byMission.length, "0", INK],
      ["Mission days", Math.round(r.total), "0", INK],
      ["Fully crewed", r.crewedShare, "0%", r.crewedShare < 1 ? "#d97706" : "#16a34a"],
      ["Fleet on missions", fleetUse, "0%", INK],
      ["Crew busy", crewShare, "0%", INK],
      ["Problems", problems, "0", problems ? "#dc2626" : "#16a34a"],
    ];
    // Tiles: the first is column B, then two columns each.
    const spans = [[2, 2], [3, 4], [5, 6], [7, 8], [10, 11], [12, 13]];
    tiles.forEach(([label, value, fmt, color], i) => {
      const [c1, c2] = spans[i];
      ws.mergeCells(6, c1, 6, c2);
      ws.mergeCells(7, c1, 8, c2);
      const l = ws.getCell(6, c1), v = ws.getCell(7, c1);
      l.value = label;
      l.font = { size: 9, color: { argb: argb(MUTED) } };
      v.value = value;
      v.numFmt = fmt;
      v.font = { size: 22, bold: true, color: { argb: argb(color) } };
      v.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
      l.alignment = { indent: 1, vertical: "bottom" };
      for (let rr = 6; rr <= 8; rr++) for (let c = c1; c <= c2; c++) ws.getCell(rr, c).fill = fill(PANEL);
    });
    ws.getRow(7).height = 22;
    ws.getRow(8).height = 14;

    const head = (row: number, col: number, labels: string[]) => {
      labels.forEach((t, i) => {
        const c = ws.getCell(row, col + i);
        c.value = t;
        c.font = { bold: true, color: { argb: "FFFFFFFF" } };
        c.fill = fill(BLUE);
      });
    };
    ws.getCell("B11").value = "Days by mission";
    ws.getCell("B11").font = { size: 13, bold: true };
    head(12, 2, ["Mission", "Days", "Share"]);
    const most = r.byMission[0]?.days ?? 1;
    r.byMission.forEach(({ m, days }, i) => {
      const row = 13 + i;
      const name = ws.getCell(row, 2);
      name.value = m.name;
      name.fill = fill(m.color);
      name.font = { bold: true, color: { argb: argb(textOn(m.color)) } };
      ws.getCell(row, 3).value = Math.round(days);
      ws.getCell(row, 4).value = r.total ? days / r.total : 0;
      ws.getCell(row, 4).numFmt = "0%";
    });
    if (r.byMission.length) dataBar(ws, `C13:C${12 + r.byMission.length}`, BLUE, Math.round(most));
    else ws.getCell("B13").value = "No missions in this period.";

    ws.getCell("F11").value = "Aircraft use";
    ws.getCell("F11").font = { size: 13, bold: true };
    head(12, 6, ["Tail", "Type", "On missions", "Maintenance", "Available", "Booked"]);
    // Keep the type column readable even though the tiles share it.
    r.fleet.forEach(({ a, flying, maint, idle }, i) => {
      const row = 13 + i;
      ws.getCell(row, 6).value = a.tail;
      ws.getCell(row, 6).font = { bold: true, name: "Consolas" };
      ws.getCell(row, 7).value = a.type;
      ws.getCell(row, 8).value = Math.round(flying);
      ws.getCell(row, 9).value = Math.round(maint);
      ws.getCell(row, 10).value = Math.round(idle);
      ws.getCell(row, 11).value = r.days ? flying / r.days : 0;
      ws.getCell(row, 11).numFmt = "0%";
    });
    if (r.fleet.length) dataBar(ws, `K13:K${12 + r.fleet.length}`, "#2f5d7c");
    printable(ws);
  }

  // ---- Boards: one column per day (per week for long periods), colored like the app.
  const board = (name: string, label: string, rows: { group?: string; label?: string; sub?: string; spans?: { a: number; b: number; label: string; color: string; kind: string }[] }[], legend: [string, string][]) => {
    const ws = wb.addWorksheet(name, { views: [{ state: "frozen", xSplit: 2, ySplit: 3, showGridLines: false }] });
    ws.properties.tabColor = { argb: argb("#2f5d7c") };
    const weekly = r.dayList.length > 190;
    const cols = weekly ? r.dayList.filter((_, i) => i % 7 === 0) : r.dayList;
    const step = weekly ? 7 * DAY : DAY;
    ws.getColumn(1).width = 22;
    ws.getColumn(2).width = 16;
    cols.forEach((_, i) => (ws.getColumn(3 + i).width = weekly ? 6 : 3.2));
    ws.getCell("A1").value = `${name}, ${r.periodText}`;
    ws.getCell("A1").font = { size: 14, bold: true };
    // Months across row 2, days (or week starts) in row 3.
    let start = 0;
    cols.forEach((d, i) => {
      const next = cols[i + 1];
      if (next === undefined || new Date(next).getMonth() !== new Date(d).getMonth()) {
        if (i > start) ws.mergeCells(2, 3 + start, 2, 3 + i);
        const c = ws.getCell(2, 3 + start);
        c.value = format(cols[start], i - start >= 3 ? "MMMM yyyy" : "MMM");
        start = i + 1;
      }
    });
    const months = ws.getRow(2);
    for (let i = 0; i < cols.length + 2; i++) {
      months.getCell(i + 1).fill = fill(BLUE);
      ws.getRow(3).getCell(i + 1).fill = fill(GROUP);
    }
    months.font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.getCell(3, 1).value = label;
    ws.getCell(3, 1).font = { bold: true, color: { argb: argb(MUTED) } };
    cols.forEach((d, i) => {
      const c = ws.getCell(3, 3 + i);
      c.value = new Date(d).getDate();
      c.font = { size: 8, color: { argb: argb(MUTED) } };
      c.alignment = { horizontal: "center" };
    });

    const t0 = today().getTime();
    const todayCol = cols.findIndex((d) => t0 >= d && t0 < d + step);
    for (const row of rows) {
      const x = ws.addRow([]);
      if (row.group) {
        x.getCell(1).value = row.group;
        x.font = { bold: true, color: { argb: argb(MUTED) } };
        for (let i = 0; i < cols.length + 2; i++) x.getCell(i + 1).fill = fill(GROUP);
        continue;
      }
      x.height = 18;
      x.getCell(1).value = row.label;
      x.getCell(1).font = { bold: true };
      x.getCell(2).value = row.sub;
      x.getCell(2).font = { size: 8, color: { argb: argb(MUTED) } };
      // Each column takes what covers most of it; a run's first column gets its name.
      let prev = "";
      cols.forEach((d, i) => {
        const end = d + step;
        let best: { a: number; b: number; label: string; color: string; kind: string } | undefined, most = 0;
        for (const s of row.spans ?? []) {
          const o = Math.min(s.b, end) - Math.max(s.a, d);
          if (o > most) (best = s), (most = o);
        }
        const c = x.getCell(3 + i);
        if (i === todayCol) c.border = { left: { style: "medium", color: { argb: argb("#ec6a3f") } } };
        if (!best) {
          prev = "";
          return;
        }
        c.fill = fill(best.color);
        const key = `${best.label}|${best.a}`;
        if (key !== prev) {
          c.value = best.label;
          c.font = { size: 8, bold: true, color: { argb: argb(best.kind === "free" ? "#166534" : textOn(best.color)) } };
        }
        prev = key;
      });
    }
    ws.addRow([]);
    const leg = ws.addRow(["Key"]);
    leg.font = { bold: true };
    legend.forEach(([text, color]) => {
      const row = ws.addRow(["", text]);
      row.getCell(1).fill = fill(color);
    });
    line(ws, weekly ? "Each column is a week, colored by what covers most of it." : "Each column is a day. The orange line is today.");
    printable(ws);
  };

  {
    const rows: Parameters<typeof board>[2] = [];
    let type = "";
    for (const t of r.tails) {
      if (t.aircraft.type !== type) rows.push({ group: (type = t.aircraft.type) });
      const spans: { a: number; b: number; label: string; color: string; kind: string; key?: string }[] = [];
      t.days.forEach((u, i) => {
        const d = r.dayList[i];
        const key = u.kind === "mission" ? `m${u.mission.id}` : u.kind === "maintenance" ? `j${u.job.id}` : u.kind;
        const last = spans.at(-1);
        if (last?.key === key) return void (last.b = d + DAY);
        spans.push({
          a: d, b: d + DAY, key,
          ...(u.kind === "mission" ? { label: u.mission.name, color: u.mission.color, kind: "mission" }
            : u.kind === "maintenance" ? { label: u.job.title, color: REPORT_COLORS.maintenance, kind: "maintenance" }
            : u.kind === "down" ? { label: "Grounded", color: REPORT_COLORS.down, kind: "down" }
            : { label: "Free", color: REPORT_COLORS.free, kind: "free" }),
        });
      });
      rows.push({ label: t.aircraft.tail, sub: `${Math.round(t.use * 100)}% booked`, spans });
    }
    const missions = [...new Map(r.missions.map((m) => [m.missionId, m])).values()];
    board("Fleet board", "Aircraft", rows, [...missions.map((m) => [m.name, m.color] as [string, string]), ["Maintenance", REPORT_COLORS.maintenance], ["Grounded", REPORT_COLORS.down], ["Free", REPORT_COLORS.free]]);

    const crew: Parameters<typeof board>[2] = [];
    let role = "";
    for (const { p, spans } of r.people) {
      if (p.role !== role) crew.push({ group: (role = p.role) === "Pilot" ? "Pilots" : "Maintainers" });
      crew.push({ label: p.name, sub: p.quals.join(", "), spans: spans as Span[] });
    }
    board("Crew board", "Crew", crew, [...missions.map((m) => [m.name, m.color] as [string, string]), ["Maintenance", REPORT_COLORS.maintenance], ["Time off", REPORT_COLORS.off]]);
  }

  // ---- Missions in the period.
  {
    const ws = table("Missions", "Missions", [
      { header: "Mission", key: "name", width: 32 }, { header: "Aircraft", key: "tail", width: 14 }, { header: "First day", key: "start", width: 13, date: true },
      { header: "Last day", key: "end", width: 13, date: true }, { header: "Status", key: "status", width: 12 }, { header: "Days in period", key: "days", width: 14 },
      { header: "Crewed", key: "crewed", width: 16, pct: true }, { header: "Contact", key: "contact", width: 30 },
      ...(hasRates(data) ? [{ header: "Crew cost", key: "crewCost", width: 12 }, { header: "Flying cost", key: "flyCost", width: 12 }, { header: "Cost", key: "cost", width: 12 }, { header: "Charged", key: "charged", width: 12 }, { header: "Margin", key: "margin", width: 12 }] : []),
    ]);
    const list = [...r.missions].sort((a, b) => ms(a.start) - ms(b.start));
    for (const b of list) {
      const row = ws.addRow({
        name: b.name, tail: seasonTails(data, b, ""), start: day(ms(b.start)), end: lastDay(ms(b.end)), status: b.status,
        days: Math.round(Math.max(0, Math.min(ms(b.end), to) - Math.max(ms(b.start), from)) / DAY), crewed: missionCoverage(data, b).covered, contact: b.contact,
        ...(hasRates(data) ? (() => { const c = seasonCost(data, b, from, to); return { crewCost: c.crew, flyCost: c.flying, cost: c.total, charged: c.charged, margin: c.margin }; })() : {}),
      });
      if (hasRates(data)) for (const k of [9, 10, 11, 12, 13]) row.getCell(k).numFmt = "$#,##0";
      row.getCell(1).fill = fill(b.color);
      row.getCell(1).font = { bold: true, color: { argb: argb(textOn(b.color)) } };
    }
    if (list.length) dataBar(ws, `G5:G${4 + list.length}`, "#16a34a");
    else line(ws, "No missions in this period.");
  }

  // ---- Crew workload.
  {
    const ws = table("Crew", "Crew workload", [
      { header: "Person", key: "name", width: 22 }, { header: "Role", key: "role", width: 12 }, { header: "Rated on", key: "quals", width: 26 },
      { header: "Days on", key: "on", width: 10 }, { header: "Days off", key: "off", width: 10 }, { header: "Busy", key: "busy", width: 18, pct: true },
    ]);
    const list = [...r.crew].sort((a, b) => (a.p.role === b.p.role ? b.on - a.on : a.p.role === "Pilot" ? -1 : 1));
    for (const { p, on, off } of list) ws.addRow({ name: p.name, role: p.role, quals: p.quals.join(", "), on: Math.round(on), off: Math.round(off), busy: r.days ? on / r.days : 0 });
    if (list.length) dataBar(ws, `F5:F${4 + list.length}`, "#2f5d7c");
  }

  // ---- Training over the period.
  {
    const ws = table("Training", "Training", [
      { header: "Person", key: "person", width: 22 }, { header: "Role", key: "role", width: 12 }, { header: "Course", key: "course", width: 28 },
      { header: "Needed for", key: "for", width: 40 }, { header: "Runs out", key: "expires", width: 13, date: true }, { header: "In this period", key: "standing", width: 15 },
    ]);
    for (const t of r.training) {
      const row = ws.addRow({ person: t.person.name, role: t.person.role, course: t.course, for: t.neededFor, expires: t.expires ? new Date(`${t.expires}T00:00`) : null, standing: TRAINING_WORDS[t.state] });
      row.getCell(6).fill = fill(STANDING[t.state]);
      row.getCell(6).font = { bold: true };
    }
    if (!r.training.length) line(ws, "No training is needed for these missions.");
  }

  // ---- Maintenance in the period.
  {
    const tails = new Map(data.aircraft.map((a) => [a.id, a.tail]));
    const people = new Map(data.people.map((p) => [p.id, p.name]));
    const ws = table("Maintenance", "Maintenance", [
      { header: "Tail", key: "tail", width: 11 }, { header: "Job", key: "title", width: 30 }, { header: "Kind", key: "kind", width: 12 },
      { header: "First day", key: "start", width: 13, date: true }, { header: "Last day", key: "end", width: 13, date: true },
      { header: "Grounds it", key: "grounds", width: 11 }, { header: "Maintainers", key: "who", width: 30 }, { header: "Done", key: "done", width: 8 },
    ]);
    for (const j of r.jobs) {
      const row = ws.addRow({
        tail: tails.get(j.aircraftId) ?? "", title: j.title, kind: j.kind, start: day(ms(j.start)), end: lastDay(ms(j.end)),
        grounds: j.grounds ? "Yes" : "No", who: j.maintainerIds.map((id) => people.get(id)).filter(Boolean).join(", "), done: j.done ? "Yes" : "No",
      });
      row.getCell(2).fill = fill("#fdf3e1");
    }
    if (!r.jobs.length) line(ws, "No maintenance in this period.");
  }

  // ---- Problems starting in the period.
  {
    const ws = table("Problems", "Problems", [{ header: "Severity", key: "severity", width: 11 }, { header: "When", key: "at", width: 13, date: true }, { header: "Problem", key: "title", width: 60 }, { header: "Details", key: "detail", width: 80 }]);
    for (const i of r.issues) {
      const row = ws.addRow({ severity: i.severity === "danger" ? "Problem" : "Check", at: new Date(i.at), title: i.title, detail: i.detail });
      row.getCell(1).fill = fill(i.severity === "danger" ? "#fee2e2" : "#fef3c7");
    }
    if (!r.issues.length) line(ws, "No problems found in this period.");
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
