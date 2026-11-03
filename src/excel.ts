import { addMonths, format } from "date-fns";
import type { AppData } from "./types";
import { bookings } from "./bookings";
import { findIssues, missionCoverage, neededTraining, trainingStatus } from "./coverage";
import { dayUse, fleetUse } from "./fleet";
import { DAY, dayAt, ms, today } from "./time";
import { textOn } from "./look";
import { saveFile } from "./files";
import { seasonTails } from "./rotation";

/**
 * The whole plan as an Excel workbook, to post in a Teams channel or open anywhere:
 * a fleet board by week (colored like the app), fleet use, seasons, the crew roster,
 * training and maintenance, plus the problems Zom's MRP found. Dates are real Excel dates.
 */
export async function buildWorkbook(data: AppData): Promise<Blob> {
  // exceljs is big, so it only loads when someone exports.
  const ExcelJS = (await import("exceljs/dist/exceljs.min.js")).default as typeof import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Zom's MRP";
  wb.created = new Date();

  const t0 = today().getTime();
  const all = bookings(data).filter((b) => b.status !== "Cancelled");
  const aircraft = new Map(data.aircraft.map((a) => [a.id, a]));
  const people = new Map(data.people.map((p) => [p.id, p]));
  const day = (w: string) => new Date(ms(w));
  const lastDay = (w: string) => new Date(ms(w) - DAY / 2); // the end is the midnight after the last day
  const argb = (hex: string) => "FF" + hex.replace("#", "").toUpperCase().padEnd(6, "0").slice(0, 6);
  const fill = (hex: string) => ({ type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: argb(hex) } });

  /** A sheet with a bold, frozen, filtered header row. */
  const sheet = (name: string, columns: { header: string; key: string; width: number; date?: boolean; pct?: boolean }[]) => {
    const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width, style: c.date ? { numFmt: "mmm d, yyyy" } : c.pct ? { numFmt: "0%" } : {} }));
    const head = ws.getRow(1);
    head.font = { bold: true, color: { argb: "FFFFFFFF" } };
    head.fill = fill("#2580c3");
    head.alignment = { vertical: "middle" };
    head.height = 20;
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
    return ws;
  };

  // ---- Fleet board: one row per tail, one column per week for the next 26 weeks.
  {
    const weeks = Array.from({ length: 26 }, (_, i) => dayAt(t0, i * 7 - new Date(t0).getDay() + 1)); // Mondays
    const ws = wb.addWorksheet("Fleet board", { views: [{ state: "frozen", xSplit: 2, ySplit: 1 }] });
    ws.columns = [{ header: "Tail", key: "tail", width: 11 }, { header: "Type", key: "type", width: 11 },
      ...weeks.map((w, i) => ({ header: format(w, "MMM d"), key: `w${i}`, width: 14 }))];
    const head = ws.getRow(1);
    head.font = { bold: true, color: { argb: "FFFFFFFF" } };
    head.fill = fill("#2580c3");
    for (const a of [...data.aircraft].filter((x) => x.status !== "Retired").sort((x, y) => x.type.localeCompare(y.type) || x.tail.localeCompare(y.tail))) {
      const row = ws.addRow({ tail: a.tail, type: a.type });
      row.getCell(1).font = { bold: true, name: "Consolas" };
      weeks.forEach((w, i) => {
        // What the tail does most that week.
        const uses = Array.from({ length: 7 }, (_, k) => dayUse(data, a, dayAt(w, k)));
        const tally = new Map<string, { n: number; label: string; color: string }>();
        for (const u of uses) {
          const key = u.kind === "mission" ? u.mission.missionId : u.kind;
          const label = u.kind === "mission" ? u.mission.name : u.kind === "maintenance" ? "Maintenance" : u.kind === "down" ? "Grounded" : "Free";
          const color = u.kind === "mission" ? u.mission.color : u.kind === "maintenance" ? "#7a5a33" : u.kind === "down" ? "#5b6375" : "#dcfce7";
          tally.set(key, { n: (tally.get(key)?.n ?? 0) + 1, label, color });
        }
        const top = [...tally.values()].sort((x, y) => y.n - x.n)[0];
        const cell = row.getCell(i + 3);
        cell.value = top.n < 7 && tally.size > 1 ? `${top.label} (${top.n} d)` : top.label;
        cell.fill = fill(top.color);
        cell.font = { color: { argb: argb(top.label === "Free" ? "#166534" : textOn(top.color)) }, size: 9 };
      });
    }
    ws.addRow([]);
    ws.addRow([`Each cell is what the tail does most that week. Made by Zom's MRP on ${format(new Date(), "MMM d, yyyy")}.`]).font = { italic: true, color: { argb: "FF7A8196" } };
  }

  // ---- Fleet use over the next 90 days.
  {
    const ws = sheet("Fleet use", [
      { header: "Tail", key: "tail", width: 11 }, { header: "Type", key: "type", width: 11 }, { header: "Base", key: "base", width: 14 },
      { header: "Status", key: "status", width: 14 }, { header: "Mission days", key: "mission", width: 13 }, { header: "Maintenance days", key: "maint", width: 17 },
      { header: "Free days", key: "free", width: 11 }, { header: "Booked", key: "use", width: 9, pct: true }, { header: "Next free from", key: "nextFree", width: 15, date: true },
    ]);
    for (const t of fleetUse(data, t0, dayAt(t0, 90))) {
      const run = t.freeRuns[0];
      ws.addRow({ tail: t.aircraft.tail, type: t.aircraft.type, base: t.aircraft.base, status: t.aircraft.status, mission: t.mission, maint: t.maintenance, free: t.free, use: t.use, nextFree: run ? new Date(run[0]) : null });
    }
    ws.addRow([]);
    ws.addRow(["Next 90 days from " + format(t0, "MMM d, yyyy") + "."]).font = { italic: true, color: { argb: "FF7A8196" } };
  }

  // ---- Seasons: every mission's dates, aircraft and how well each is crewed.
  {
    const ws = sheet("Seasons", [
      { header: "Mission", key: "name", width: 30 }, { header: "Contact", key: "contact", width: 30 }, { header: "First day", key: "start", width: 13, date: true },
      { header: "Last day", key: "end", width: 13, date: true }, { header: "Days", key: "days", width: 7 }, { header: "Aircraft", key: "tail", width: 11 },
      { header: "Status", key: "status", width: 11 }, { header: "Pilots on board", key: "pilots", width: 15 }, { header: "Fully crewed", key: "crewed", width: 13, pct: true },
    ]);
    for (const b of [...all].sort((x, y) => x.start.localeCompare(y.start))) {
      const row = ws.addRow({
        name: b.name, contact: b.contact, start: day(b.start), end: lastDay(b.end), days: Math.round((ms(b.end) - ms(b.start)) / DAY),
        tail: seasonTails(data, b, ""), status: b.status, pilots: b.pilotsNeeded, crewed: missionCoverage(data, b).covered,
      });
      row.getCell(1).fill = fill(b.color);
      row.getCell(1).font = { bold: true, color: { argb: argb(textOn(b.color)) } };
    }
  }

  // ---- Crew roster: every shift, earliest first.
  {
    const ws = sheet("Crew roster", [
      { header: "Person", key: "person", width: 20 }, { header: "Role", key: "role", width: 11 }, { header: "Mission", key: "mission", width: 30 },
      { header: "Aircraft", key: "tail", width: 11 }, { header: "First day", key: "start", width: 13, date: true }, { header: "Last day", key: "end", width: 13, date: true },
      { header: "Days", key: "days", width: 7 },
    ]);
    const seasons = new Map(all.map((b) => [b.id, b]));
    for (const s of [...data.shifts].sort((x, y) => x.start.localeCompare(y.start))) {
      const b = seasons.get(s.seasonId);
      const p = people.get(s.personId);
      if (!b || !p) continue;
      ws.addRow({ person: p.name, role: p.role, mission: b.name, tail: seasonTails(data, b, ""), start: day(s.start), end: lastDay(s.end), days: Math.round((ms(s.end) - ms(s.start)) / DAY) });
    }
  }

  // ---- Training: what each person needs for the missions they work, and where they stand.
  {
    const ws = sheet("Training", [
      { header: "Person", key: "person", width: 20 }, { header: "Role", key: "role", width: 11 }, { header: "Training", key: "training", width: 28 },
      { header: "Needed for", key: "for", width: 40 }, { header: "Runs out", key: "expires", width: 13, date: true }, { header: "Standing", key: "standing", width: 14 },
    ]);
    const soon = addMonths(t0, 1).getTime();
    for (const p of [...data.people].sort((a, b) => a.name.localeCompare(b.name)))
      for (const [tid, missions] of neededTraining(data, p)) {
        const t = data.trainings.find((x) => x.id === tid);
        if (!t) continue;
        const st = trainingStatus(p, tid, t0, t0 + 1);
        const standing = st.state === "ok" ? (st.expires && ms(`${st.expires}T00:00`) < soon ? "Runs out soon" : "Current") : st.state === "missing" ? "Not done" : "Ran out";
        const row = ws.addRow({ person: p.name, role: p.role, training: t.name, for: missions.map((m) => m.name).join(", "), expires: st.expires ? new Date(`${st.expires}T00:00`) : null, standing });
        const tone = standing === "Current" ? "#dcfce7" : standing === "Runs out soon" ? "#fef3c7" : "#fee2e2";
        row.getCell(6).fill = fill(tone);
      }
  }

  // ---- Maintenance: every job, earliest first.
  {
    const ws = sheet("Maintenance", [
      { header: "Tail", key: "tail", width: 11 }, { header: "Job", key: "title", width: 30 }, { header: "Kind", key: "kind", width: 12 },
      { header: "First day", key: "start", width: 13, date: true }, { header: "Last day", key: "end", width: 13, date: true },
      { header: "Grounds it", key: "grounds", width: 11 }, { header: "Maintainers", key: "who", width: 30 }, { header: "Done", key: "done", width: 8 },
    ]);
    for (const j of [...data.jobs].sort((x, y) => x.start.localeCompare(y.start)))
      ws.addRow({
        tail: aircraft.get(j.aircraftId)?.tail ?? "", title: j.title, kind: j.kind, start: day(j.start), end: lastDay(j.end),
        grounds: j.grounds ? "Yes" : "No", who: j.maintainerIds.map((id) => people.get(id)?.name).filter(Boolean).join(", "), done: j.done ? "Yes" : "No",
      });
  }

  // ---- Problems Zom's MRP found.
  {
    const ws = sheet("Problems", [{ header: "Severity", key: "severity", width: 11 }, { header: "Problem", key: "title", width: 60 }, { header: "Details", key: "detail", width: 80 }]);
    for (const i of findIssues(data)) {
      const row = ws.addRow({ severity: i.severity === "danger" ? "Problem" : "Check", title: i.title, detail: i.detail });
      row.getCell(1).fill = fill(i.severity === "danger" ? "#fee2e2" : "#fef3c7");
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

/** The file name for an export made today. */
export const workbookName = () => `zoms-mrp-${format(new Date(), "yyyy-MM-dd")}.xlsx`;

/** Build the workbook and hand it over (a download, or the Downloads folder in the desktop app). */
export async function downloadWorkbook(data: AppData) {
  return saveFile(workbookName(), await buildWorkbook(data));
}
