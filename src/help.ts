import type { Page } from "./types";

/**
 * Where help lives, shared by Find, the Guide and the notes on new pages: each page's guide section in
 * the app and its page in the online guide (docs.zombeatzmedia.com/mrp). Keep the docs names in step
 * with the guide's pages in the zombeatz-docs repository.
 */

export const DOCS_URL = "https://docs.zombeatzmedia.com/mrp/";
export const docsUrl = (page = "") => DOCS_URL + page;

export interface PageHelp {
  page: Page;
  label: string;
  /** What it's for, in a line (Find shows it, and searches it). */
  about: string;
  /** Other words people may type for it. */
  words?: string;
  /** The Guide section about it. */
  guide?: string;
  /** Its page in the online guide. */
  docs: string;
}

export const PAGE_HELP: PageHelp[] = [
  { page: "overview", label: "Overview", about: "What's flying, and every problem with its fix", words: "problems needs attention gaps conflicts home dashboard", guide: "overview", docs: "overview" },
  { page: "aircraft", label: "Fleet", about: "Every tail over time, free windows, and Can we take a job?", words: "aircraft tails helicopters free windows take a job", guide: "fleet", docs: "fleet" },
  { page: "types", label: "Types & equipment", about: "Kinds of aircraft, and the equipment they carry for different work", words: "aircraft types models makes equipment hoist bucket floats medical interior kit", guide: "types", docs: "fleet#types-and-equipment" },
  { page: "schedule", label: "Schedule", about: "The plan as a Gantt chart, by aircraft, mission or person", words: "gantt chart calendar timeline open seats", guide: "schedule", docs: "schedule" },
  { page: "missions", label: "Missions", about: "Each customer's work and its seasons", words: "customers seasons contracts jobs contact phone email documents files pdf attachments ground duty hangar on call standby", guide: "missions", docs: "missions-and-seasons" },
  { page: "people", label: "Crew", about: "Pilots and maintainers, ratings and time off", words: "people pilots maintainers ratings time off leave sick", guide: "crew", docs: "crew" },
  { page: "maintenance", label: "Maintenance", about: "Jobs on a tail, with the maintainers on them", words: "repairs grounded jobs", guide: "maintenance", docs: "maintenance" },
  { page: "training", label: "Training", about: "Courses, who's current, and what runs out next", words: "courses current renewals qualifications nvg", guide: "training", docs: "training" },
  { page: "inspections", label: "Inspections", about: "Maintenance programs, flight hours and what's due", words: "programs due 100 hour annual phase flight hours", guide: "inspections", docs: "maintenance#inspections" },
  { page: "balance", label: "Balance", about: "How busy everyone is, and rebalancing the work", words: "workload busy fair rebalance", guide: "balance", docs: "balance" },
  { page: "planner", label: "Crew planner", about: "How few pilots a job takes, and the rotation that does it", words: "how many pilots crew math rotation hitch flight hour limit night", guide: "planner", docs: "crew-planner" },
  { page: "reports", label: "Reports", about: "Fleet use and workload, as PDF and Excel", words: "pdf excel week sheet print teams share", guide: "reports", docs: "reports" },
  { page: "settings", label: "Settings", about: "Work limits, kinds of contract, your data and more", words: "limits hitches days off flight hours rest backup import export", docs: "settings" },
  { page: "guide", label: "Guide", about: "How everything works, and how to do the everyday jobs", words: "help how do i", docs: "" },
];

/** The online guide's page for each Guide section, for its "More online" link. */
export const SECTION_DOCS: Record<string, string> = {
  flow: "quick-start", setup: "quick-start", colors: "overview", words: "glossary", mistakes: "data-and-backups#undo",
  overview: "overview", fleet: "fleet", types: "fleet#types-and-equipment", missions: "missions-and-seasons", rotations: "filling-the-schedule", schedule: "schedule",
  crew: "crew", training: "training", maintenance: "maintenance", checks: "overview#what-zom-s-mrp-checks", inspections: "maintenance#inspections",
  currency: "crew#currency", cost: "costs", limits: "work-limits", balance: "balance", planner: "crew-planner", reports: "reports", data: "data-and-backups",
};

/**
 * A short note at the top of a page that's new, so someone opening it for the first time knows where to
 * start. It shows on the first few visits, or until it's closed, then stays out of the way.
 */
export interface NewPageNote { page: Page; text: string }

export const NEW_PAGE_NOTES: NewPageNote[] = [
  { page: "types", text: "Your aircraft types are here already, from your tails and crew ratings. Add the equipment you fly with (a hoist, a bucket), tick what each type can carry, then tick what each tail has and what each mission needs." },
  { page: "planner", text: "Put in the job's dates and aircraft, or start from a season, and the answer updates as you type: how few pilots it takes, why, and the rotation. Several jobs adds up the coming jobs against the pilots you have." },
  { page: "balance", text: "Pick a period to see how busy everyone is. Try other crew sizes for a job, lock what should stay, and press Rebalance. Nothing changes until Apply." },
  { page: "inspections", text: "Add each aircraft type's inspections under Programs, type each tail's hours under Flight hours, then Due shows what's coming and Plan it books it." },
];

/** How many times a new page's note shows before it stops by itself. */
export const NOTE_VISITS = 5;

const noteKey = (page: Page) => `zoms-mrp:note:${page}`;

/** Times the note has been shown, or "closed". Browser storage is a convenience: without it the note just shows. */
function readNote(page: Page): number | "closed" {
  try {
    const v = localStorage.getItem(noteKey(page));
    return v === "closed" ? "closed" : Number(v) || 0;
  } catch {
    return 0;
  }
}

/** The note for this page if it should still show, counting this visit. */
export function noteFor(page: Page): NewPageNote | null {
  const note = NEW_PAGE_NOTES.find((n) => n.page === page);
  if (!note) return null;
  const seen = readNote(page);
  if (seen === "closed" || seen >= NOTE_VISITS) return null;
  try {
    localStorage.setItem(noteKey(page), String(seen + 1));
  } catch { /* only a convenience */ }
  return note;
}

export function closeNote(page: Page) {
  try {
    localStorage.setItem(noteKey(page), "closed");
  } catch { /* only a convenience */ }
}

/** Open the Guide at a section (or a How do I… answer), from Find or a note. The Guide scrolls there when it draws. */
let wanted: string | null = null;
export const askGuideFor = (id: string) => { wanted = id; };
export const takeGuideTarget = () => { const w = wanted; wanted = null; return w; };
