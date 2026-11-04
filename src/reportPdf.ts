import { format } from "date-fns";
import type { jsPDF as JsPDF } from "jspdf";
import type { AppData } from "./types";
import { fullReport, REPORT_COLORS, TRAINING_WORDS, type FullReport, type Span } from "./report";
import { missionCoverage } from "./coverage";
import { seasonTails } from "./rotation";
import { textOn } from "./look";
import { DAY, ms, today } from "./time";

/**
 * The report as a PDF, drawn shape by shape so it looks the same from every build (a Mac's window can't
 * print to PDF). Letter, landscape: a summary page with the numbers and charts, then the fleet and crew
 * boards over the period, the missions, crew workload, training, maintenance and problems.
 */

const W = 792, H = 612, M = 32;
const TOP = 66, BOTTOM = H - 34;
const C = {
  ink: "#14171f", muted: "#5b6375", faint: "#8a92a3", line: "#e3e6ec", panel: "#f5f7fa", zebra: "#fafbfc",
  blue: "#2580c3", orange: "#ec6a3f", ok: "#16a34a", warn: "#d97706", danger: "#dc2626", pilot: "#2f5d7c", maint: "#3d6b4f",
};

/** The app icon as a PNG for the page header, or null if it can't be drawn here. */
async function iconPng(): Promise<string | null> {
  try {
    const img = new Image();
    img.src = `${import.meta.env.BASE_URL}app-icon.svg`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    c.getContext("2d")!.drawImage(img, 0, 0, 128, 128);
    return c.toDataURL("image/png");
  } catch {
    return null;
  }
}

export async function buildPdf(data: AppData, from: number, to: number): Promise<Blob> {
  // jsPDF is big, so it only loads when someone makes a report.
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter", compress: true });
  const r = fullReport(data, from, to);
  const icon = await iconPng();
  new Pdf(doc, r, data, icon).draw();
  return doc.output("blob");
}

class Pdf {
  constructor(private doc: JsPDF, private r: FullReport, private data: AppData, private icon: string | null) {}

  draw() {
    this.summary();
    this.board("Fleet board", this.fleetRows(), true);
    this.missions();
    this.board("Crew board", this.crewRows(), false);
    this.workload();
    this.training();
    this.maintenance();
    this.problems();
    this.footers();
  }

  // ---------- drawing helpers

  private font(size: number, weight: "normal" | "bold" = "normal", color = C.ink) {
    this.doc.setFont("helvetica", weight);
    this.doc.setFontSize(size);
    this.doc.setTextColor(color);
  }

  private text(s: string, x: number, y: number, opts: { align?: "left" | "right" | "center"; maxWidth?: number } = {}) {
    const t = opts.maxWidth ? this.fit(s, opts.maxWidth) : s;
    this.doc.text(t, x, y, { align: opts.align ?? "left", baseline: "middle" });
  }

  /** Shorten to fit a width, ending in "…". */
  private fit(s: string, w: number) {
    if (this.doc.getTextWidth(s) <= w) return s;
    let t = s;
    while (t.length > 1 && this.doc.getTextWidth(t + "…") > w) t = t.slice(0, -1);
    return t.length > 1 ? t.trimEnd() + "…" : "";
  }

  private box(x: number, y: number, w: number, h: number, color: string, radius = 0) {
    if (w <= 0 || h <= 0) return;
    this.doc.setFillColor(color);
    if (radius) this.doc.roundedRect(x, y, w, h, Math.min(radius, w / 2), Math.min(radius, h / 2), "F");
    else this.doc.rect(x, y, w, h, "F");
  }

  private hline(x1: number, x2: number, y: number, color = C.line, width = 0.6) {
    this.doc.setDrawColor(color);
    this.doc.setLineWidth(width);
    this.doc.line(x1, y, x2, y);
  }

  /** A new page with the header: icon, name, what the page is and the period. */
  private page(title: string, first = false) {
    if (!first) this.doc.addPage();
    if (this.icon) this.doc.addImage(this.icon, "PNG", M, 18, 22, 22);
    const x = this.icon ? M + 30 : M;
    this.font(11, "bold");
    this.text("Zom's", x, 29);
    const w1 = this.doc.getTextWidth("Zom's ");
    this.font(11, "bold", C.blue);
    this.text("MRP", x + w1, 29);
    const w2 = this.doc.getTextWidth("MRP");
    this.font(11, "normal", C.muted);
    this.text(`  ·  ${title}`, x + w1 + w2, 29);
    this.font(9, "normal", C.muted);
    this.text(this.r.periodText, W - M, 29, { align: "right" });
    this.hline(M, W - M, 48);
    return TOP;
  }

  /** Page numbers and when it was made, on every page. */
  private footers() {
    const n = this.doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      this.doc.setPage(i);
      this.font(8, "normal", C.faint);
      this.text(`Made by Zom's MRP on ${format(new Date(), "MMM d, yyyy")}`, M, H - 18);
      this.text(`Page ${i} of ${n}`, W - M, H - 18, { align: "right" });
    }
  }

  private heading(s: string, y: number) {
    this.font(12, "bold");
    this.text(s, M, y);
    return y + 18;
  }

  private none(s: string, y: number) {
    this.font(10, "normal", C.muted);
    this.text(s, M, y + 6);
  }

  // ---------- summary

  private summary() {
    const r = this.r;
    let y = this.page("Report", true);
    this.font(26, "bold");
    this.text("Plan report", M, y + 14);
    this.font(11, "normal", C.muted);
    this.text(`${r.periodText}  ·  ${Math.round(r.days)} days`, M, y + 38);
    y += 60;

    const fleetUse = r.fleet.length ? r.fleet.reduce((t, f) => t + f.flying, 0) / (r.fleet.length * r.days) : 0;
    const crewShare = r.crew.length ? r.crew.reduce((t, c) => t + c.on, 0) / (r.crew.length * r.days) : 0;
    const problems = r.issues.filter((i) => i.severity === "danger").length;
    const tiles: [string, string, string][] = [
      ["Missions", String(r.byMission.length), C.ink],
      ["Mission days", String(Math.round(r.total)), C.ink],
      ["Fully crewed", `${Math.round(r.crewedShare * 100)}%`, r.crewedShare < 1 ? C.warn : C.ok],
      ["Fleet on missions", `${Math.round(fleetUse * 100)}%`, C.ink],
      ["Crew busy", `${Math.round(crewShare * 100)}%`, C.ink],
      ["Problems", String(problems), problems ? C.danger : C.ok],
    ];
    const gap = 10, tw = (W - 2 * M - gap * 5) / 6;
    tiles.forEach(([label, value, color], i) => {
      const x = M + i * (tw + gap);
      this.box(x, y, tw, 62, C.panel, 8);
      this.font(8.5, "normal", C.muted);
      this.text(label, x + 12, y + 17);
      this.font(22, "bold", color);
      this.text(value, x + 12, y + 42);
    });
    y += 84;

    // Left: days by mission. Right: aircraft free each day, then each tail's use.
    const half = (W - 2 * M - 24) / 2, xr = M + half + 24;
    this.font(12, "bold");
    this.text("Days by mission", M, y);
    this.text("Aircraft free each day", xr, y);
    this.bars(M, y + 16, half, BOTTOM - y - 16, r.byMission.map(({ m, days }) => ({ label: m.name, value: days, max: r.byMission[0]?.days ?? 1, color: m.color, note: `${Math.round(days)} d` })), "No missions in this period.");
    const chartH = 92;
    this.freeChart(xr, y + 14, half, chartH);
    const fy = y + 14 + chartH + 30;
    this.font(12, "bold");
    this.text("Aircraft use", xr, fy);
    this.legend(xr + 96, fy, [["On missions", C.pilot], ["Maintenance", REPORT_COLORS.maintenance], ["Available", C.line]]);
    const tails = r.fleet;
    const rowH = Math.min(16, (BOTTOM - fy - 16) / Math.max(1, tails.length));
    tails.forEach(({ a, flying, maint }, i) => {
      if (rowH < 9) return;
      const ry = fy + 14 + i * rowH;
      this.font(Math.min(8.5, rowH - 2), "bold");
      this.text(a.tail, xr, ry + rowH / 2);
      const bx = xr + 62, bw = half - 62 - 34, bh = Math.min(9, rowH - 4);
      this.box(bx, ry + (rowH - bh) / 2, bw, bh, C.line, 2);
      const fw = (flying / r.days) * bw, mw = (maint / r.days) * bw;
      this.box(bx, ry + (rowH - bh) / 2, fw, bh, C.pilot, 2);
      this.box(bx + fw, ry + (rowH - bh) / 2, mw, bh, REPORT_COLORS.maintenance);
      this.font(8, "normal", C.muted);
      this.text(`${Math.round((flying / r.days) * 100)}%`, xr + half, ry + rowH / 2, { align: "right" });
    });
  }

  /** Horizontal bars with a label and a value, as many as fit. */
  private bars(x: number, y: number, w: number, h: number, rows: { label: string; value: number; max: number; color: string; note: string }[], empty: string) {
    if (!rows.length) return this.none(empty, y);
    const rowH = Math.max(13, Math.min(20, h / rows.length));
    const fits = Math.floor(h / rowH);
    const labelW = Math.min(150, w * 0.38);
    this.font(8.5, "bold");
    const noteW = Math.max(...rows.map((row) => this.doc.getTextWidth(row.note))) + 10;
    rows.slice(0, fits).forEach((row, i) => {
      const ry = y + i * rowH;
      this.font(9, "normal");
      this.text(row.label, x, ry + rowH / 2, { maxWidth: labelW - 8 });
      const bx = x + labelW, bw = w - labelW - noteW, bh = Math.min(11, rowH - 5);
      this.box(bx, ry + (rowH - bh) / 2, bw, bh, C.panel, 3);
      this.box(bx, ry + (rowH - bh) / 2, Math.max(2, (row.value / Math.max(row.max, 1e-9)) * bw), bh, row.color, 3);
      this.font(8.5, "bold", C.muted);
      this.text(row.note, x + w, ry + rowH / 2, { align: "right" });
    });
    if (rows.length > fits) {
      this.font(8, "normal", C.faint);
      this.text(`and ${rows.length - fits} more`, x, y + fits * rowH + 6);
    }
  }

  /** Columns: how many aircraft are free each day of the period. */
  private freeChart(x: number, y: number, w: number, h: number) {
    const pts = this.r.freeEachDay;
    const max = Math.max(1, this.r.tails.length);
    this.box(x, y, w, h, C.panel, 6);
    const ix = x + 26, iw = w - 34, iy = y + 8, ih = h - 22;
    this.font(7.5, "normal", C.faint);
    [0, max].forEach((v) => {
      const ly = iy + ih - (v / max) * ih;
      this.text(String(v), x + 18, ly, { align: "right" });
      this.hline(ix, ix + iw, ly, C.line, 0.4);
    });
    const cw = iw / Math.max(1, pts.length);
    pts.forEach((p, i) => {
      const bh = (p.free / max) * ih;
      this.box(ix + i * cw, iy + ih - bh, Math.max(0.6, cw - (cw > 3 ? 0.6 : 0)), bh, p.free === 0 ? C.danger : C.blue);
    });
    this.font(7.5, "normal", C.faint);
    this.text(format(this.r.from, "MMM d"), ix, y + h - 7);
    this.text(format(this.r.to - DAY / 2, "MMM d"), ix + iw, y + h - 7, { align: "right" });
  }

  /** Color swatches with names, wrapping onto more lines (upwards from `y`) when they don't fit. */
  private legend(x: number, y: number, items: [string, string][], right = W - M) {
    this.font(8, "normal", C.muted);
    const lines: [string, string, number][][] = [[]];
    let cx = x;
    for (const [label, color] of items) {
      const w = 11 + this.doc.getTextWidth(label) + 12;
      if (cx + w > right && cx > x) (lines.push([]), (cx = x));
      lines[lines.length - 1].push([label, color, cx]);
      cx += w;
    }
    lines.forEach((line, i) => {
      const ly = y - (lines.length - 1 - i) * 12;
      for (const [label, color, lx] of line) {
        this.box(lx, ly - 4, 8, 8, color, 2);
        this.text(label, lx + 11, ly);
      }
    });
    return lines.length;
  }

  // ---------- boards

  /** One row per tail, grouped by type: what it does each day (runs of the same thing become one bar). */
  private fleetRows(): BoardRow[] {
    const rows: BoardRow[] = [];
    let type = "";
    for (const t of this.r.tails) {
      if (t.aircraft.type !== type) {
        type = t.aircraft.type;
        rows.push({ group: `${type}` });
      }
      const spans: (Span | { a: number; b: number; label: string; color: string; kind: "free" })[] = [];
      t.days.forEach((u, i) => {
        const day = this.r.dayList[i];
        const key = u.kind === "mission" ? `m${u.mission.id}` : u.kind === "maintenance" ? `j${u.job.id}` : u.kind;
        const last = spans.at(-1) as (Span & { key?: string }) | undefined;
        if (last && (last as { key?: string }).key === key) { last.b = day + DAY; return; }
        const s = u.kind === "mission" ? { label: u.mission.name, color: u.mission.color, kind: "mission" as const }
          : u.kind === "maintenance" ? { label: u.job.title, color: REPORT_COLORS.maintenance, kind: "maintenance" as const }
          : u.kind === "down" ? { label: "Grounded", color: REPORT_COLORS.down, kind: "down" as const }
          : { label: "Free", color: REPORT_COLORS.free, kind: "free" as const };
        spans.push(Object.assign({ a: day, b: day + DAY, key }, s));
      });
      rows.push({ label: t.aircraft.tail, sub: `${Math.round(t.use * 100)}% booked`, mono: true, spans });
    }
    return rows;
  }

  private crewRows(): BoardRow[] {
    const rows: BoardRow[] = [];
    let role = "";
    for (const { p, spans } of this.r.people) {
      if (p.role !== role) {
        role = p.role;
        rows.push({ group: role === "Pilot" ? "Pilots" : "Maintainers" });
      }
      rows.push({ label: p.name, sub: p.quals.join(", "), spans });
    }
    return rows;
  }

  /** A Gantt chart over the period, carried over as many pages as the rows need. */
  private board(title: string, rows: BoardRow[], fleet: boolean) {
    const r = this.r;
    const labelW = 128, x0 = M + labelW, x1 = W - M, n = r.dayList.length;
    const dayW = (x1 - x0) / n;
    const xOf = (t: number) => x0 + Math.max(0, Math.min(n, Math.round((t - r.from) / DAY))) * dayW;
    const groupH = 15;
    const rowCount = rows.filter((x) => !x.group).length, groupCount = rows.length - rowCount;
    const room = BOTTOM - 46 - (TOP + 34);
    // Taller rows when they'd all fit on one page anyway.
    const rowH = Math.max(19, Math.min(30, (room - groupCount * groupH) / Math.max(1, rowCount)));
    const used = new Map<string, string>();

    const head = () => {
      let y = this.page(title);
      // Months, then days (short periods) or week starts.
      const months: { a: number; b: number }[] = [];
      r.dayList.forEach((d, i) => {
        if (i === 0 || new Date(d).getDate() === 1) months.push({ a: i, b: i + 1 });
        else months[months.length - 1].b = i + 1;
      });
      this.box(M, y, W - 2 * M, 30, C.panel, 4);
      for (const m of months) {
        const mx = x0 + m.a * dayW, mw = (m.b - m.a) * dayW;
        if (m.a > 0) {
          this.doc.setDrawColor(C.line);
          this.doc.setLineWidth(0.6);
          this.doc.line(mx, y, mx, y + 30);
        }
        this.font(8.5, "bold");
        if (mw > 34) this.text(format(r.dayList[m.a], mw > 74 ? "MMMM yyyy" : "MMM"), mx + 4, y + 9, { maxWidth: mw - 6 });
      }
      this.font(7, "normal", C.faint);
      r.dayList.forEach((d, i) => {
        const date = new Date(d);
        // Every day when there's room, else each Monday, else only the months.
        const show = dayW >= 11 || (dayW >= 2.2 && date.getDay() === 1);
        if (show) this.text(String(date.getDate()), x0 + i * dayW + (dayW >= 11 ? dayW / 2 : 1), y + 22, { align: dayW >= 11 ? "center" : "left" });
      });
      this.font(8.5, "bold", C.muted);
      this.text(fleet ? "Aircraft" : "Crew", M + 8, y + 15);
      return y + 34;
    };

    let y = head();
    const bottom = BOTTOM - 46;
    const t0 = today().getTime();
    const todayLine = (top: number, end: number) => {
      if (t0 < r.from || t0 >= r.to) return;
      this.doc.setDrawColor(C.orange);
      this.doc.setLineWidth(1);
      this.doc.line(xOf(t0), top, xOf(t0), end);
    };
    let top = y;
    const finish = () => {
      todayLine(top, y);
      const items: [string, string][] = [...used.entries()];
      items.push(["Maintenance", REPORT_COLORS.maintenance]);
      items.push(fleet ? ["Free", "#bfe8cc"] : ["Time off", REPORT_COLORS.off]);
      this.legend(M, BOTTOM - 6, items);
    };

    if (!rows.some((x) => !x.group)) return this.none("Nothing to show yet.", y);
    for (const row of rows) {
      const h = row.group ? groupH : rowH;
      if (y + h > bottom) {
        finish();
        y = head();
        top = y;
      }
      if (row.group) {
        this.box(M, y + 1, W - 2 * M, groupH - 2, "#eef1f5", 3);
        this.font(8.5, "bold", C.muted);
        this.text(row.group, M + 8, y + groupH / 2);
        y += groupH;
        continue;
      }
      // Weekends, lightly.
      if (dayW >= 3)
        r.dayList.forEach((d, i) => {
          const wd = new Date(d).getDay();
          if (wd === 0 || wd === 6) this.box(x0 + i * dayW, y, dayW, rowH, "#f6f7f9");
        });
      this.font(9, "bold");
      if (row.mono) this.doc.setFont("courier", "bold");
      this.text(row.label ?? "", M + 8, y + rowH / 2 - 4, { maxWidth: labelW - 14 });
      this.font(7, "normal", C.faint);
      this.text(row.sub ?? "", M + 8, y + rowH / 2 + 4.5, { maxWidth: labelW - 14 });
      for (const s of row.spans ?? []) {
        const xa = xOf(s.a), xb = xOf(s.b);
        if (xb - xa <= 0) continue;
        const bh = Math.min(rowH - 5, 18);
        this.box(xa + 0.4, y + (rowH - bh) / 2, xb - xa - 0.8, bh, s.color, 2.5);
        if (s.kind === "mission") used.set(s.label, s.color);
        const ink = s.kind === "free" ? "#166534" : textOn(s.color);
        if (xb - xa > 26) {
          this.font(rowH > 24 ? 8.5 : 7.5, "bold", ink);
          this.text(s.label, xa + 4, y + rowH / 2, { maxWidth: xb - xa - 7 });
        }
      }
      this.hline(M, W - M, y + rowH, C.line, 0.3);
      y += rowH;
    }
    finish();
  }

  // ---------- tables

  private table<T>(title: string, cols: Col<T>[], rows: T[], empty: string) {
    let y = this.page(title);
    y = this.heading(title, y + 4);
    if (!rows.length) return this.none(empty, y);
    const total = cols.reduce((t, c) => t + c.w, 0);
    const scale = (W - 2 * M) / total;
    const xs: number[] = [];
    cols.reduce((x, c) => (xs.push(x), x + c.w * scale), M);
    const rowH = 20;
    const header = () => {
      this.box(M, y, W - 2 * M, 20, C.panel, 4);
      this.font(8, "bold", C.muted);
      cols.forEach((c, i) => this.text(c.title, c.right ? xs[i] + c.w * scale - 8 : xs[i] + 8, y + 10, { align: c.right ? "right" : "left" }));
      y += 22;
    };
    header();
    rows.forEach((row, ri) => {
      if (y + rowH > BOTTOM - 8) {
        y = this.page(title) + 4;
        header();
      }
      if (ri % 2) this.box(M, y, W - 2 * M, rowH, C.zebra);
      cols.forEach((c, i) => {
        const cw = c.w * scale;
        const cell = c.get(row);
        const cx = xs[i] + 8, cy = y + rowH / 2, mw = cw - 14;
        if (typeof cell === "string") {
          this.font(8.5, c.bold ? "bold" : "normal", c.muted ? C.muted : C.ink);
          this.text(cell, c.right ? xs[i] + cw - 8 : cx, cy, { align: c.right ? "right" : "left", maxWidth: mw });
        } else if (cell.swatch) {
          this.box(cx, cy - 4.5, 9, 9, cell.swatch, 2);
          this.font(8.5, "bold");
          this.text(cell.text, cx + 14, cy, { maxWidth: mw - 14 });
        } else if (cell.pill) {
          this.font(7.5, "bold", "#ffffff");
          const pw = this.doc.getTextWidth(cell.text) + 12;
          this.box(cx, cy - 6.5, pw, 13, cell.pill, 6.5);
          this.text(cell.text, cx + 6, cy);
        } else if (cell.bar !== undefined) {
          const bw = mw - 34;
          this.box(cx, cy - 4, bw, 8, C.line, 3);
          this.box(cx, cy - 4, Math.max(2, Math.min(1, cell.bar) * bw), 8, cell.color ?? C.blue, 3);
          this.font(8, "bold", C.muted);
          this.text(cell.text, xs[i] + cw - 8, cy, { align: "right" });
        }
      });
      y += rowH;
    });
  }

  private missions() {
    const { r, data } = this;
    const clipDays = (a: number, b: number) => Math.max(0, Math.min(b, r.to) - Math.max(a, r.from)) / DAY;
    this.table("Missions", [
      { title: "Mission", w: 200, get: (m) => ({ swatch: m.color, text: m.name }) },
      { title: "Aircraft", w: 90, get: (m) => seasonTails(data, m, "None") },
      { title: "Dates", w: 160, get: (m) => `${format(ms(m.start), "MMM d, yyyy")} to ${format(ms(m.end) - DAY / 2, "MMM d, yyyy")}`, muted: true },
      { title: "Status", w: 70, get: (m) => m.status },
      { title: "Days here", w: 60, right: true, get: (m) => String(Math.round(clipDays(ms(m.start), ms(m.end)))) },
      { title: "Crewed", w: 130, get: (m) => {
        const c = missionCoverage(data, m).covered;
        return { bar: c, text: `${Math.round(c * 100)}%`, color: c >= 1 ? C.ok : c >= 0.8 ? C.warn : C.danger };
      } },
    ], [...r.missions].sort((a, b) => ms(a.start) - ms(b.start)), "No missions in this period.");
  }

  private workload() {
    const r = this.r;
    let y = this.page("Crew workload");
    y = this.heading("Crew workload", y + 4);
    this.font(9, "normal", C.muted);
    this.text("Share of the period each person is booked, with their days on and time off.", M, y);
    y += 18;
    const half = (W - 2 * M - 24) / 2;
    (["Pilot", "Maintainer"] as const).forEach((role, k) => {
      const x = M + k * (half + 24);
      this.font(11, "bold", role === "Pilot" ? C.pilot : C.maint);
      this.text(role === "Pilot" ? "Pilots" : "Maintainers", x, y);
      const rows = r.crew.filter((c) => c.p.role === role);
      this.bars(x, y + 12, half, BOTTOM - y - 20, rows.map(({ p, on, off }) => ({
        label: p.name, value: on, max: r.days, color: role === "Pilot" ? C.pilot : C.maint,
        note: `${Math.round((on / r.days) * 100)}% · ${Math.round(on)} d${off ? ` · ${Math.round(off)} off` : ""}`,
      })), role === "Pilot" ? "No pilots yet." : "No maintainers yet.");
    });
  }

  /** People down the side, courses across: each cell says where that person stands over the period. */
  private training() {
    const rows = this.r.training;
    const title = "Training";
    let y = this.page(title);
    y = this.heading(title, y + 4);
    if (!rows.length) return this.none("No training is needed for these missions.", y);
    const courses = [...new Set(rows.map((t) => t.course))].sort();
    const people = [...new Map(rows.map((t) => [t.person.id, t.person])).values()]
      .sort((x, y) => (x.role === y.role ? x.name.localeCompare(y.name) : x.role === "Pilot" ? -1 : 1));
    const cell = new Map(rows.map((t) => [`${t.person.id}|${t.course}`, t]));
    const look = this.r.training.filter((t) => t.state !== "ok").length;
    this.font(9, "normal", C.muted);
    this.text(look ? `${look} need a look: training that's missing, has run out, or runs out during the period.` : "Everyone is current on what their missions need for the whole period.", M, y);
    y += 14;

    const nameW = 140, cw = Math.min(96, (W - 2 * M - nameW) / courses.length), rowH = 17;
    const tones = { ok: ["#dcfce7", "#166534"], "runs-out": ["#fef3c7", "#92400e"], expired: ["#fee2e2", "#991b1b"], missing: ["#fee2e2", "#991b1b"] } as const;
    const header = () => {
      this.box(M, y, nameW + cw * courses.length, 30, C.panel, 4);
      this.font(7.5, "bold", C.muted);
      courses.forEach((c, i) => {
        const lines = (this.doc.splitTextToSize(c, cw - 8) as string[]).slice(0, 2);
        lines.forEach((l, k) => this.text(this.fit(l, cw - 8), M + nameW + i * cw + 4, y + (lines.length === 1 ? 15 : 10 + k * 9)));
      });
      this.text("Person", M + 8, y + 15);
      y += 32;
    };
    header();
    for (const p of people) {
      if (y + rowH > BOTTOM - 22) {
        y = this.page(title) + 4;
        header();
      }
      this.font(8.5, "bold");
      this.text(p.name, M + 8, y + rowH / 2, { maxWidth: nameW - 60 });
      this.font(7.5, "normal", C.faint);
      this.text(p.role, M + nameW - 8, y + rowH / 2, { align: "right" });
      courses.forEach((c, i) => {
        const t = cell.get(`${p.id}|${c}`);
        if (!t) return;
        const [bg, ink] = tones[t.state];
        const x = M + nameW + i * cw + 2;
        this.box(x, y + 2, cw - 4, rowH - 4, bg, 3);
        const when = t.expires ? format(ms(`${t.expires}T00:00`), "MMM d, yyyy") : "";
        const words = t.state === "ok" ? when || "No end" : t.state === "runs-out" ? `Runs out ${when}` : TRAINING_WORDS[t.state];
        this.font(7, t.state === "ok" ? "normal" : "bold", ink);
        this.text(words, x + 4, y + rowH / 2, { maxWidth: cw - 10 });
      });
      this.hline(M, M + nameW + cw * courses.length, y + rowH, C.line, 0.3);
      y += rowH;
    }
    this.legend(M, BOTTOM - 6, [["Current (with the date it runs out)", tones.ok[0]], ["Runs out during the period", tones["runs-out"][0]], ["Ran out or not done", tones.expired[0]]]);
  }

  private maintenance() {
    const tails = new Map(this.data.aircraft.map((a) => [a.id, a.tail]));
    const people = new Map(this.data.people.map((p) => [p.id, p.name]));
    this.table("Maintenance", [
      { title: "Aircraft", w: 80, bold: true, get: (j) => tails.get(j.aircraftId) ?? "" },
      { title: "Job", w: 200, get: (j) => ({ swatch: REPORT_COLORS.maintenance, text: j.title }) },
      { title: "Kind", w: 80, muted: true, get: (j) => j.kind },
      { title: "Dates", w: 160, muted: true, get: (j) => `${format(ms(j.start), "MMM d")} to ${format(ms(j.end) - DAY / 2, "MMM d, yyyy")}` },
      { title: "Grounds it", w: 70, get: (j) => (j.grounds ? "Yes" : "No") },
      { title: "Maintainers", w: 170, muted: true, get: (j) => j.maintainerIds.map((id) => people.get(id)).filter(Boolean).join(", ") },
      { title: "Done", w: 50, get: (j) => (j.done ? { pill: C.ok, text: "Done" } : "") },
    ], this.r.jobs, "No maintenance in this period.");
  }

  private problems() {
    this.table("Problems", [
      { title: "", w: 70, get: (i) => ({ pill: i.severity === "danger" ? C.danger : C.warn, text: i.severity === "danger" ? "Problem" : "Check" }) },
      { title: "When", w: 80, muted: true, get: (i) => format(i.at, "MMM d, yyyy") },
      { title: "What", w: 260, bold: true, get: (i) => i.title },
      { title: "Details", w: 380, muted: true, get: (i) => i.detail },
    ], this.r.issues, "No problems found in this period.");
  }
}

interface BoardRow { group?: string; label?: string; sub?: string; mono?: boolean; spans?: { a: number; b: number; label: string; color: string; kind: string }[] }

type Cell = string | { swatch: string; text: string; pill?: never; bar?: never; color?: never } | { pill: string; text: string; swatch?: never; bar?: never; color?: never } | { bar: number; text: string; color?: string; swatch?: never; pill?: never };
interface Col<T> { title: string; w: number; right?: boolean; bold?: boolean; muted?: boolean; get: (row: T) => Cell }
