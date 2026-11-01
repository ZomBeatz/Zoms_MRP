import { create } from "zustand";
import type { AppData, Page, Settings } from "./types";
import { emptyData, sampleData } from "./sample";
import { migrate } from "./migrate";
import { isOnlineDemo } from "./platform";
import { demoBackend, ownBackend, type Backend } from "./backends";
import { browserBackend } from "./backends/browser";

/**
 * All of MRP's data is one document, kept by a backend (see src/backends): this browser, a file on
 * this computer, or the secure server. Every change goes through `change`, which keeps an undo
 * history and saves. The demo always stays in this browser, apart from the person's own data.
 */

const MODE_KEY = "zoms-mrp:mode";
const THEME_KEY = "zoms-mrp:theme"; // read by index.html before the page draws

type Collection = "aircraft" | "trainings" | "people" | "missions" | "seasons" | "shifts" | "jobs" | "timeOff";
type Item<C extends Collection> = AppData[C][number];

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
// The online demo is always the demo.
let demo = isOnlineDemo || read(MODE_KEY) === "demo";

// Where data goes right now (the demo or the person's own), set up by `boot`.
let own: Backend = browserBackend("zoms-mrp:data");
const demoStore: Backend = demoBackend();
const current = () => (demo ? demoStore : own);

// Saves go out one at a time; while one is on its way, only the newest waiting document is kept.
let waiting: AppData | null = null;
let saving = false;
function save(d: AppData) {
  try {
    localStorage.setItem(THEME_KEY, d.settings.theme);
  } catch { /* only a convenience */ }
  if (!current().canEdit) return; // someone who may only look never saves
  waiting = d;
  if (!saving) void flush();
}
async function flush() {
  saving = true;
  while (waiting) {
    const d = waiting;
    waiting = null;
    const to = current();
    try {
      await to.save(d);
      useStore.setState({ saveError: null });
    } catch (e) {
      useStore.setState({ saveError: e instanceof Error ? e.message : "Couldn't save." });
    }
  }
  saving = false;
}
/** Wait until everything sent has been saved (before switching between the demo and own data). */
const settled = async () => {
  while (saving) await new Promise((r) => setTimeout(r, 20));
};

const loadFrom = async (b: Backend) => {
  const raw = await b.load().catch(() => null);
  return raw ? migrate(raw) : null;
};

export interface Toast { id: number; text: string; action?: { label: string; run: () => void } }

interface State {
  data: AppData;
  /** False until the person picks the demo or an empty start. */
  started: boolean;
  /** Showing the demo data instead of the person's own. */
  demo: boolean;
  /** False for someone who may only look (a Viewer on the server). */
  canEdit: boolean;
  page: Page;
  /** What's open in a dialog: a kind and an id ("new" for a new one), plus defaults for new items. */
  editing: { kind: "mission" | "season" | "aircraft" | "person" | "job" | "timeOff" | "training" | "support"; id: string; defaults?: Record<string, unknown> } | null;
  past: AppData[];
  future: AppData[];
  toast: Toast | null;
  saveError: string | null;

  go: (page: Page) => void;
  open: (kind: NonNullable<State["editing"]>["kind"], id: string, defaults?: Record<string, unknown>) => void;
  close: () => void;
  change: (fn: (d: AppData) => AppData, message?: string) => void;
  upsert: <C extends Collection>(c: C, item: Item<C>) => void;
  remove: <C extends Collection>(c: C, id: string, message?: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  undo: () => void;
  redo: () => void;
  start: (withDemo: boolean) => Promise<void>;
  setDemo: (on: boolean) => Promise<void>;
  resetDemo: () => void;
  /** Replace everything with an empty start (own data only). */
  clearAll: () => void;
  showToast: (text: string, action?: Toast["action"]) => void;
}

const LAST_PAGE = "zoms-mrp:page";
const lastPage = (() => {
  try {
    return (localStorage.getItem(LAST_PAGE) as Page) || "overview";
  } catch {
    return "overview";
  }
})();

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const useStore = create<State>((set, get) => ({
  data: emptyData(), // filled in by `boot`, before the first screen draws
  started: false,
  demo,
  canEdit: true,
  page: lastPage,
  editing: null,
  past: [],
  future: [],
  toast: null,
  saveError: null,

  go: (page) => {
    try {
      localStorage.setItem(LAST_PAGE, page);
    } catch { /* only a convenience */ }
    set({ page });
  },
  open: (kind, id, defaults) => set({ editing: { kind, id, defaults } }),
  close: () => set({ editing: null }),

  change: (fn, message) => {
    const before = get().data;
    const data = fn(before);
    save(data);
    set({ data, past: [...get().past.slice(-49), before], future: [] });
    if (message) get().showToast(message, { label: "Undo", run: () => get().undo() });
  },

  upsert: (c, item) =>
    get().change((d) => {
      const list = d[c] as Item<typeof c>[];
      const has = list.some((x) => x.id === item.id);
      return { ...d, [c]: has ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item] };
    }),

  remove: (c, id, message) =>
    get().change((d) => {
      const next = { ...d, [c]: (d[c] as { id: string }[]).filter((x) => x.id !== id) } as AppData;
      // Take the things that hung off it with it.
      if (c === "missions") {
        const gone = new Set(next.seasons.filter((x) => x.missionId === id).map((x) => x.id));
        next.seasons = next.seasons.filter((x) => x.missionId !== id);
        next.shifts = next.shifts.filter((s) => !gone.has(s.seasonId));
        next.people = next.people.map((p) => ({ ...p, missionIds: p.missionIds.filter((m) => m !== id) }));
      }
      if (c === "seasons") next.shifts = next.shifts.filter((s) => s.seasonId !== id);
      if (c === "people") {
        next.shifts = next.shifts.filter((s) => s.personId !== id);
        next.timeOff = next.timeOff.filter((t) => t.personId !== id);
        next.jobs = next.jobs.map((j) => ({ ...j, maintainerIds: j.maintainerIds.filter((p) => p !== id) }));
      }
      if (c === "aircraft") {
        next.jobs = next.jobs.filter((j) => j.aircraftId !== id);
        next.seasons = next.seasons.map((m) => (m.aircraftId === id ? { ...m, aircraftId: null } : m));
      }
      if (c === "trainings") {
        next.missions = next.missions.map((m) => ({ ...m, requiredTrainingIds: m.requiredTrainingIds.filter((t) => t !== id) }));
        next.people = next.people.map((p) => ({ ...p, training: p.training.filter((r) => r.trainingId !== id) }));
      }
      return next;
    }, message),

  updateSettings: (patch) => {
    const data = { ...get().data, settings: { ...get().data.settings, ...patch } };
    save(data);
    set({ data });
  },

  undo: () => {
    const { past, data, future } = get();
    if (!past.length) return;
    const prev = past[past.length - 1];
    save(prev);
    set({ data: prev, past: past.slice(0, -1), future: [data, ...future], toast: { id: Date.now(), text: "Undone" } });
  },
  redo: () => {
    const { past, data, future } = get();
    if (!future.length) return;
    save(future[0]);
    set({ data: future[0], past: [...past, data], future: future.slice(1) });
  },

  start: async (withDemo) => {
    if (withDemo) {
      // Keep an empty document for the person's own data, so turning the demo off lands somewhere.
      if (own.canEdit && !(await own.load().catch(() => null))) await own.save(emptyData()).catch(() => {});
      await get().setDemo(true);
    } else {
      demo = false;
      const data = { ...emptyData(), settings: get().data.settings };
      save(data);
      set({ data, started: true, demo: false, past: [], future: [] });
    }
  },

  setDemo: async (on) => {
    const settings = get().data.settings;
    save(get().data);
    await settled();
    demo = on;
    try {
      localStorage.setItem(MODE_KEY, on ? "demo" : "real");
    } catch { /* only a convenience */ }
    const loaded = await loadFrom(current());
    const data = { ...(loaded ?? (on ? sampleData(settings) : emptyData())), settings };
    if (!loaded) save(data);
    set({ data, demo: on, canEdit: current().canEdit, started: true, past: [], future: [], page: "overview" });
    get().showToast(on ? "Showing demo data. Your own data is kept apart." : "Back to your own data.");
  },

  resetDemo: () => {
    if (!demo) return;
    const data = sampleData(get().data.settings);
    save(data);
    set({ data, past: [], future: [] });
    get().showToast("Demo reset");
  },

  clearAll: () => get().change((d) => ({ ...emptyData(), settings: d.settings }), "Cleared all data"),

  showToast: (text, action) => {
    clearTimeout(toastTimer);
    set({ toast: { id: Date.now(), text, action } });
    toastTimer = setTimeout(() => set({ toast: null }), 5000);
  },
}));

/** Look things up by id without scanning arrays in every row. */
export const byId = <T extends { id: string }>(list: T[]) => new Map(list.map((x) => [x.id, x]));

/**
 * Pick the backend for this build and load the document, before the first screen draws.
 * The online demo opens straight into fresh demo data the first time.
 */
export async function boot() {
  own = await ownBackend();
  const loaded = await loadFrom(current());
  const data = loaded ?? (demo ? sampleData() : null);
  const started = !!loaded || isOnlineDemo || (demo && !!(await own.load().catch(() => null)));
  useStore.setState({ data: data ?? emptyData(), started, demo, canEdit: current().canEdit });
}
