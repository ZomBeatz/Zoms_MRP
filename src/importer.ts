import { addMonths, format } from "date-fns";
import type { Aircraft, AppData, Person, Training, TrainingRecord } from "./types";
import { uid } from "./time";

/**
 * Bringing existing lists in from Excel or CSV: people, aircraft, training courses and who has done which.
 * The template has a sheet for each with the headings Zom's MRP reads, plus a Read me sheet with examples.
 * Rows are matched to what's there by name (people, courses) or tail number (aircraft): those are updated,
 * the rest added. Nothing changes until the preview is accepted, and Undo works after.
 */

type Cell = string | number | Date | null | undefined;
type Rows = Record<string, Cell>[];

export const SHEETS = {
  People: ["Name", "Role", "Rated on", "Base", "Phone", "Day rate"],
  Aircraft: ["Tail", "Type", "Pilot seats", "Base", "Status", "Flight hours", "Hours as of", "Cost per flight hour"],
  Courses: ["Course", "Renew every (months)", "For"],
  Training: ["Person", "Course", "Completed", "Runs out"],
} as const;

const NOTES: Record<string, string> = {
  Name: "Full name, as people know them.", Role: "Pilot or Maintainer.", "Rated on": "Aircraft types, separated by commas: Bell 412, AS350 B3.",
  Tail: "The registration, like N412ZM.", Type: "Must match the types people are rated on.", "Pilot seats": "1 or 2.", Status: "Airworthy, In maintenance, AOG or Retired. Empty: Airworthy.",
  "Flight hours": "Total hours on the airframe (optional).", "Hours as of": "The day of that reading.", "Renew every (months)": "0 or empty if it never runs out.",
  For: "Pilots, Maintainers or Both.", Person: "A name from the People sheet (or already in Zom's MRP).", Completed: "The day they did it.", "Runs out": "Empty: worked out from the course.",
};

const EXAMPLES: Record<keyof typeof SHEETS, Cell[][]> = {
  People: [["Alex Rivera", "Pilot", "Bell 412, AS350 B3", "Fairbanks", "(907) 555-0101", 650], ["Sam Lee", "Maintainer", "Bell 412", "Fairbanks", "", ""]],
  Aircraft: [["N412ZM", "Bell 412", 2, "Fairbanks", "Airworthy", 4812.5, "2026-10-01", 1800]],
  Courses: [["Night vision goggles (NVG)", 12, "Pilots"], ["Hoist rescue", 24, "Both"]],
  Training: [["Alex Rivera", "Night vision goggles (NVG)", "2026-03-14", ""]],
};

/** The import template as an Excel workbook: a Read me sheet, then one sheet per kind with its headings. */
export async function buildTemplate(): Promise<Blob> {
  const ExcelJS = (await import("exceljs/dist/exceljs.min.js")).default as typeof import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Zom's MRP";
  const readme = wb.addWorksheet("Read me", { views: [{ showGridLines: false }] });
  readme.getColumn(1).width = 110;
  const lines = [
    "Zom's MRP import template",
    "",
    "Fill in the People, Aircraft, Courses and Training sheets (any of them; leave the rest empty), keep the headings, and import the file",
    "in Settings › Your data › Import from Excel or CSV. You'll see what will be added or updated before anything changes.",
    "",
    "People already in Zom's MRP are matched by name, aircraft by tail number and courses by name: those are updated, the rest added.",
    "Dates can be 2026-03-14, 3/14/2026 or a date cell. Hover a heading for what goes in it.",
    "",
    "Examples (don't copy these rows into the sheets unless you mean them):",
  ];
  lines.forEach((l, i) => {
    const c = readme.getCell(i + 1, 1);
    c.value = l;
    if (i === 0) c.font = { size: 16, bold: true };
  });
  let r = lines.length + 2;
  for (const [name, heads] of Object.entries(SHEETS) as [keyof typeof SHEETS, readonly string[]][]) {
    readme.getCell(r++, 1).value = `${name}: ${heads.join(" | ")}`;
    readme.getCell(r - 1, 1).font = { bold: true };
    for (const ex of EXAMPLES[name]) readme.getCell(r++, 1).value = `   ${ex.map((x) => (x === "" ? "—" : String(x))).join(" | ")}`;
    r++;
  }
  for (const [name, heads] of Object.entries(SHEETS)) {
    const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
    heads.forEach((h, i) => {
      const c = ws.getCell(1, i + 1);
      c.value = h;
      c.font = { bold: true, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2580C3" } };
      if (NOTES[h]) c.note = NOTES[h];
      ws.getColumn(i + 1).width = Math.max(14, h.length + 4);
    });
  }
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

/** A minimal CSV reader: commas, quotes with "" inside, and new lines. */
export function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') (cell += '"'), i++;
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") (row.push(cell), (cell = ""));
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((x) => x.trim())) out.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) out.push(row);
  return out;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
/** Rows as objects keyed by the template's headings (matching headings loosely: case and spaces don't matter). */
function keyed(table: Cell[][], heads: readonly string[]): Rows {
  if (!table.length) return [];
  const header = table[0].map((h) => norm(String(h ?? "")));
  const col = new Map(heads.map((h) => [h, header.findIndex((x) => x === norm(h) || (norm(h).startsWith(x) && x.length > 3))]));
  return table.slice(1).map((r) => Object.fromEntries(heads.map((h) => [h, (col.get(h) ?? -1) >= 0 ? r[col.get(h)!] : undefined])));
}

/** Which kind of sheet a CSV is, from its headings. */
function kindOf(head: Cell[]): keyof typeof SHEETS | null {
  const h = new Set(head.map((x) => norm(String(x ?? ""))));
  if (h.has("tail")) return "Aircraft";
  if (h.has("person") && h.has("course")) return "Training";
  if (h.has("course")) return "Courses";
  if (h.has("name")) return "People";
  return null;
}

const text = (v: Cell) => (v === null || v === undefined ? "" : v instanceof Date ? format(v, "yyyy-MM-dd") : String(v)).trim();
const num = (v: Cell) => {
  const n = typeof v === "number" ? v : Number(text(v).replace(/[$,\s]/g, ""));
  return text(v) === "" || !isFinite(n) ? null : n;
};
/** "2026-03-14", "3/14/2026", "14 Mar 2026" or a date cell (Excel dates are UTC midnights). */
export function dateOf(v: Cell): string | null {
  if (v instanceof Date) return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, "0")}-${String(v.getUTCDate()).padStart(2, "0")}`;
  const s = text(v);
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) return `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  const t = Date.parse(s);
  return isNaN(t) ? null : format(t, "yyyy-MM-dd");
}

export interface ImportPlan {
  data: AppData;
  added: { people: number; aircraft: number; courses: number; records: number };
  updated: { people: number; aircraft: number; courses: number };
  skipped: string[];
}

/** Read the tables (sheet name → rows of cells) into a plan: the new data and what changed. */
export function planImport(data: AppData, tables: { name: string; rows: Cell[][] }[]): ImportPlan {
  const d: AppData = { ...data, people: [...data.people], aircraft: [...data.aircraft], trainings: [...data.trainings] };
  const added = { people: 0, aircraft: 0, courses: 0, records: 0 }, updated = { people: 0, aircraft: 0, courses: 0 };
  const skipped: string[] = [];
  const sheet = (kind: keyof typeof SHEETS) => tables.filter((t) => t.name === kind || (!(t.name in SHEETS) && kindOf(t.rows[0] ?? []) === kind));
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

  for (const t of sheet("Courses"))
    keyed(t.rows, SHEETS.Courses).forEach((r, i) => {
      const name = text(r.Course);
      if (!name) return;
      const forWho = norm(text(r.For));
      const appliesTo: Training["appliesTo"] = forWho.startsWith("main") ? "Maintainer" : forWho.startsWith("both") ? "Both" : "Pilot";
      const validMonths = Math.max(0, Math.round(num(r["Renew every (months)"]) ?? 0));
      const k = d.trainings.findIndex((x) => same(x.name, name));
      if (k >= 0) (d.trainings[k] = { ...d.trainings[k], validMonths, appliesTo }), updated.courses++;
      else d.trainings.push({ id: uid(), name, validMonths, appliesTo, notes: "" }), added.courses++;
      void i;
    });

  for (const t of sheet("People"))
    keyed(t.rows, SHEETS.People).forEach((r, i) => {
      const name = text(r.Name);
      if (!name) return;
      const role: Person["role"] = norm(text(r.Role)).startsWith("main") ? "Maintainer" : "Pilot";
      if (text(r.Role) && !/^(pilot|maintainer)/i.test(text(r.Role))) skipped.push(`${t.name} row ${i + 2}: role “${text(r.Role)}” isn't Pilot or Maintainer; added as a pilot.`);
      const quals = text(r["Rated on"]).split(/[,;]/).map((x) => x.trim()).filter(Boolean);
      const dayRate = num(r["Day rate"]);
      const k = d.people.findIndex((x) => same(x.name, name));
      if (k >= 0) {
        const p = d.people[k];
        d.people[k] = { ...p, role, quals: [...new Set([...p.quals, ...quals])], base: text(r.Base) || p.base, phone: text(r.Phone) || p.phone, dayRate: dayRate ?? p.dayRate };
        updated.people++;
      } else {
        d.people.push({ id: uid(), name, role, quals, training: [], missionIds: [], rotation: null, base: text(r.Base), phone: text(r.Phone), notes: "", dayRate });
        added.people++;
      }
    });

  for (const t of sheet("Aircraft"))
    keyed(t.rows, SHEETS.Aircraft).forEach((r, i) => {
      const tail = text(r.Tail).toUpperCase();
      if (!tail) return;
      const type = text(r.Type);
      if (!type) return skipped.push(`${t.name} row ${i + 2}: ${tail} has no type, so it was skipped.`);
      const statusText = norm(text(r.Status));
      const status: Aircraft["status"] = statusText.startsWith("inmaint") ? "In maintenance" : statusText.startsWith("ground") || statusText.startsWith("aog") ? "AOG" : statusText.startsWith("retir") ? "Retired" : "Airworthy";
      const hours = num(r["Flight hours"]);
      const on = dateOf(r["Hours as of"]) ?? format(new Date(), "yyyy-MM-dd");
      const k = d.aircraft.findIndex((x) => x.tail.toUpperCase() === tail);
      const patch: Partial<Aircraft> = {
        type, status, base: text(r.Base), seats: Math.min(2, Math.max(1, Math.round(num(r["Pilot seats"]) ?? 2))),
        ...(hours !== null ? { hours: { hours, on } } : {}), ...(num(r["Cost per flight hour"]) !== null ? { hourCost: num(r["Cost per flight hour"]) } : {}),
      };
      if (k >= 0) (d.aircraft[k] = { ...d.aircraft[k], ...patch, base: patch.base || d.aircraft[k].base }), updated.aircraft++;
      else d.aircraft.push({ id: uid(), tail, notes: "", ...(patch as Omit<Aircraft, "id" | "tail" | "notes">) }), added.aircraft++;
    });

  for (const t of sheet("Training"))
    keyed(t.rows, SHEETS.Training).forEach((r, i) => {
      const who = text(r.Person), what = text(r.Course);
      if (!who && !what) return;
      const k = d.people.findIndex((x) => same(x.name, who));
      const course = d.trainings.find((x) => same(x.name, what));
      const completed = dateOf(r.Completed);
      if (k < 0) return skipped.push(`${t.name} row ${i + 2}: nobody called “${who}”.`);
      if (!course) return skipped.push(`${t.name} row ${i + 2}: no course called “${what}” (add it on the Courses sheet).`);
      if (!completed) return skipped.push(`${t.name} row ${i + 2}: “${text(r.Completed)}” isn't a date.`);
      const given = dateOf(r["Runs out"]);
      const expires = given ?? (course.validMonths ? format(addMonths(new Date(`${completed}T00:00`), course.validMonths), "yyyy-MM-dd") : null);
      const p = d.people[k];
      if (p.training.some((x) => x.trainingId === course.id && x.completed === completed)) return;
      const rec: TrainingRecord = { trainingId: course.id, completed, expires };
      d.people[k] = { ...p, training: [...p.training, rec] };
      added.records++;
    });

  return { data: d, added, updated, skipped };
}

/** Read an .xlsx or .csv file into tables. */
export async function readFile(file: File): Promise<{ name: string; rows: Cell[][] }[]> {
  if (/\.csv$/i.test(file.name) || file.type === "text/csv") return [{ name: file.name, rows: parseCsv(await file.text()) }];
  const ExcelJS = (await import("exceljs/dist/exceljs.min.js")).default as typeof import("exceljs");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  return wb.worksheets.map((ws) => {
    const rows: Cell[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const vals = (row.values as Cell[]).slice(1).map((v) => (v && typeof v === "object" && !(v instanceof Date) ? ((v as { text?: string; result?: Cell }).text ?? (v as { result?: Cell }).result ?? "") : v));
      rows.push(vals as Cell[]);
    });
    return { name: ws.name, rows };
  });
}
