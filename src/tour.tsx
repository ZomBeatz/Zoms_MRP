import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { create } from "zustand";
import { X } from "lucide-react";
import { useStore } from "./store";
import { missionCoverage } from "./coverage";
import { ms } from "./time";
import type { Page } from "./types";

/**
 * Walkthroughs over the demo data. Each step can go to a page, open a form or click a tab, then
 * points at one thing on screen with a short card. The steps only look and click; nothing is saved
 * unless the person saves it themselves.
 */

type Target = string | { sel: string; text: string };

export interface Step {
  title: string;
  body: string;
  /** What to point at: a CSS selector, or a selector plus text the element must contain. Empty: a card in the middle. */
  target?: Target;
  /** Go to this page first (closing any open form). */
  page?: Page;
  /** Set things up before pointing, after `page`. Runs again on Back. */
  before?: () => void | Promise<void>;
}

export interface Tour { id: string; title: string; summary: string; minutes: number; steps: Step[] }

// ---------------------------------------------------------------- helpers the steps use

const sleep = (t: number) => new Promise((r) => setTimeout(r, t));
const visible = (el: Element) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };

/** The first visible element matching the target. */
export function findTarget(t: Target | undefined): HTMLElement | null {
  if (!t) return null;
  const sel = typeof t === "string" ? t : t.sel;
  const all = [...document.querySelectorAll<HTMLElement>(sel)].filter(visible);
  return (typeof t === "string" ? all : all.filter((el) => el.innerText.includes(t.text)))[0] ?? null;
}

/** Wait for something to show up (a page or form that just opened). */
async function waitFor(t: Target, ms_ = 2000) {
  for (let i = 0; i < ms_ / 50; i++) {
    const el = findTarget(t);
    if (el) return el;
    await sleep(50);
  }
  return null;
}

async function click(t: Target) {
  (await waitFor(t))?.click();
  await sleep(80);
}

/** Pick an option in a select the way a person would, so the page reacts. */
async function choose(sel: string, value: string) {
  const el = (await waitFor(sel)) as HTMLSelectElement | null;
  if (!el) return;
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(el, value);
  el.dispatchEvent(new Event("change", { bubbles: true }));
  await sleep(80);
}

const tab = (name: string) => click({ sel: ".dialog-tabs button", text: name });
const store = () => useStore.getState();
const mission = (name: string) => store().data.missions.find((m) => m.name === name) ?? store().data.missions[0];

/** The coming season of a mission that still has open seats (the fire season in the demo). */
function seasonToCrew() {
  const { data } = store();
  const now = Date.now();
  const live = data.seasons.filter((s) => ms(s.end) > now && s.status !== "Cancelled" && s.status !== "Done");
  const fire = mission("Interior Fire Service");
  return live.find((s) => s.missionId === fire?.id && missionCoverage(data, s).covered < 1)
    ?? live.find((s) => missionCoverage(data, s).covered < 1) ?? live[0] ?? data.seasons[0];
}

async function openSeason(tabName?: string) {
  const s = seasonToCrew();
  if (!s) return;
  if (store().editing?.id !== s.id) store().open("season", s.id);
  if (tabName) await tab(tabName);
}

// ---------------------------------------------------------------- the walkthroughs

export const TOURS: Tour[] = [
  {
    id: "basics", title: "The big picture", minutes: 3,
    summary: "Where everything is: the overview, the fleet board, the schedule, missions, crew and reports.",
    steps: [
      { title: "Welcome to the Mission Ready Planner", body: "This is a made-up operator in Alaska: 12 helicopters, about 45 crew and 19 missions over two years. Try anything; the demo is kept apart from your own data, and Reset demo puts it back." },
      { page: "overview", target: ".page .tiles", title: "The overview", body: "Start each day here. The tiles show what's flying now, what's coming up and how many problems need a look. Tap a tile to go to that page." },
      { page: "overview", target: ".page .issues", title: "Needs attention", body: "Every open seat, double booking, missing rating, lapsed course and too-long hitch, worst first. Tap one and Zom's MRP opens the thing to fix." },
      { page: "aircraft", target: ".gantt", title: "The fleet board", body: "Every tail over time, grouped by type. Colored bars are missions; the green dashed blocks are free windows, counted from today. Ctrl + scroll (or pinch) zooms, and dragging moves through time." },
      { page: "aircraft", target: ".g-lane.sub", title: "How many are free each day", body: "The short bars count the aircraft that are free each day. A red mark means nothing is free that day." },
      { page: "aircraft", target: ".maint-lane", title: "Maintenance under each tail", body: "Inspections and repairs sit in a thin row under their aircraft. A job that grounds it is outlined red if a mission is booked on top." },
      { page: "schedule", target: ".page-head .seg", title: "The schedule", body: "The same plan as a Gantt chart, with rows by aircraft, by mission (with its crew under it) or by person. Pick one mission from the list to see only its work." },
      { page: "missions", target: ".page .table-wrap, .page .cards-list", title: "Missions are customers", body: "Each mission is one customer's kind of work, with its color, the training it needs and its regular crew. Its seasons are the stretches of dates it flies." },
      { page: "people", target: ".page .table-wrap, .page .cards-list", title: "Crew", body: "Pilots and maintainers, what they're rated on, the missions they work, their own rotation if they have one, their training and time off." },
      { page: "reports", target: ".page .tiles", title: "Reports", body: "Fleet use, days per mission, how busy each person is and how much of the flying was fully crewed. Export to Excel makes one workbook to post in Teams." },
      { title: "That's the tour", body: "Next, try “Crew a job on a rotation” or “Can we take a new job?”. They're in the Guide, with how every part works." },
    ],
  },
  {
    id: "new-job", title: "Can we take a new job?", minutes: 2,
    summary: "A customer calls with dates. Check which tails and crew could fly it, then book it.",
    steps: [
      { page: "aircraft", target: { sel: ".page-head .btn", text: "Can we take a job" }, title: "A customer calls", body: "Say a survey company wants a helicopter for a month. Start from the Fleet page with Can we take a job?" },
      { before: async () => { if (store().editing?.kind !== "support") store().open("support", "new"); await waitFor(".dialog .form-grid"); }, target: ".dialog .form-grid", title: "What the job needs", body: "Pick the dates, the aircraft type if it matters, how many pilots fly on board, and any training the customer asks for (like mountain flying)." },
      { before: () => { if (store().editing?.kind !== "support") store().open("support", "new"); }, target: ".dialog .issues", title: "The answer, tail by tail", body: "Each tail says Can do, Short crew or Can't, and why: booked, in maintenance, grounded, or not enough rated and current pilots free every day. A busy tail shows the first day it's free for the whole job." },
      { before: () => { if (store().editing?.kind !== "support") store().open("support", "new"); }, target: { sel: ".dialog .btn", text: "Book on" }, title: "Book it", body: "Book on N… starts a new mission with those dates, that tail and crew size filled in. Name the customer, save, and it's on the board." },
      { title: "Done", body: "The new mission's season then needs crew. That's the next walkthrough: “Crew a job on a rotation”." },
    ],
  },
  {
    id: "crew", title: "Crew a job on a rotation", minutes: 3,
    summary: "Set aircraft, crew numbers and a 14 on / 7 off rotation, then fill the schedule and close the gaps.",
    steps: [
      { before: () => openSeason("Details"), target: ".dialog-meta", title: "A season to crew", body: "This is next summer's fire season. The line under the title shows it at a glance: status, dates, tails and how much is crewed." },
      { before: () => openSeason("Details"), target: ".dialog .tags", title: "Several aircraft on one job", body: "Add the tails when they're known; a planned job can wait for them. People rated on any of these types can crew it." },
      { before: () => openSeason("Details"), target: ".dialog .stepper", title: "Crew needed at any time", body: "How many pilots and maintainers the whole job needs on any day, across all its aircraft." },
      { before: () => openSeason("Details"), target: ".dialog .rotation", title: "The job's rotation", body: "Like 14 days on, 7 off, or 21 on, 14 off. Pilots and maintainers can have different rotations." },
      { before: () => openSeason("Pilots"), target: ".dialog .cov-bar", title: "Where it's short", body: "Green is covered; red stripes are days with an open seat. The Pilots tab has a red dot while any are open." },
      { before: () => openSeason("Pilots"), target: { sel: ".dialog .btn", text: "Fill the schedule" }, title: "Fill the schedule", body: "Rotates people through the open days on the job's pattern. It only picks people who are rated, current on the mission's training, free, rested and on their own rotation, and the mission's regular crew go first." },
      { before: async () => { await openSeason("Pilots"); await click({ sel: ".dialog .btn", text: "Fill the schedule" }); }, target: ".dialog .lines", title: "One line per shift", body: "Each shift is who and when. Any days nobody could cover stay as red Open seat lines, in date order. Tap an open seat to put someone on just those days." },
      { before: () => openSeason("Pilots"), target: { sel: ".dialog .line", text: "" }, title: "Change a shift", body: "Tap a line to swap the person or change the dates. The list of people only shows who can take that shift." },
      { before: () => openSeason("Pilots"), target: ".dialog .toolbar .check", title: "Show everyone", body: "Turn this on to see everyone, with the reason each one can't take it: not rated, training lapsed, off rotation, time off or booked elsewhere." },
      { before: () => openSeason("Pilots"), target: ".dialog-foot", title: "Save, or leave it", body: "Nothing changes until you Save. Cancel puts it back the way it was. This walkthrough closes the form without saving." },
    ],
  },
  {
    id: "gaps", title: "Find and close coverage gaps", minutes: 2,
    summary: "See every open seat across all jobs, and who's free and qualified to fill it.",
    steps: [
      { page: "schedule", before: () => click({ sel: ".page-head .seg button", text: "Crew" }), target: ".gantt", title: "The crew view", body: "Rows by person. Open seats are at the top, as red dashed slots for each job that's short. Grey hatching is someone's time off or off-rotation days." },
      { page: "schedule", before: async () => { await click({ sel: ".page-head .seg button", text: "Crew" }); await choose('select[aria-label="Show one mission"]', mission("Interior Fire Service")?.id ?? ""); }, target: 'select[aria-label="Show one mission"]', title: "One job at a time", body: "Pick a mission. The crew view then shows its open seats, the people on it, and the people who are rated and current but not on it yet: the ones to call." },
      { page: "overview", target: ".page .issues", title: "Or work from the list", body: "The overview lists the same gaps with every other problem. Tap one to open the season with the gap, and use Fill the schedule or tap the open seat." },
      { page: "schedule", before: () => choose('select[aria-label="Show one mission"]', ""), title: "Done", body: "Tip: with every seat filled, the season's pill turns green: Crewed." },
    ],
  },
  {
    id: "training", title: "Keep training current", minutes: 2,
    summary: "Missions set the training they need; see who's current and what runs out soon.",
    steps: [
      { page: "missions", before: async () => { const m = mission("Mat-Su Medevac"); if (m) store().open("mission", m.id); await tab("Training"); }, target: ".dialog .picker-row", title: "Missions set the training", body: "Each mission ticks the courses its crew need. People only need the training of the missions they work, so a fire pilot doesn't need NVG unless they also fly medevac." },
      { page: "training", target: ".page .seg", title: "Who's current", body: "A grid of people and courses: current, runs out soon, or lapsed. Courses nobody needs for their missions are left blank." },
      { page: "training", before: () => choose('select[aria-label="Show crew for"]', mission("Mat-Su Medevac")?.id ?? ""), target: 'select[aria-label="Show crew for"]', title: "Crew for one mission", body: "Narrow it to one mission's crew to check they can all fly it." },
      { page: "people", before: async () => { const p = store().data.people.find((x) => x.role === "Pilot"); if (p) store().open("person", p.id); await tab("Training"); }, target: ".dialog .lines", title: "A person's records", body: "One line per course with when it runs out. Tap one to update it after a renewal; older records are kept and greyed out as Renewed." },
      { title: "Warnings ahead of time", body: "Zom's MRP warns when a course runs out within the warning window in Settings, and flags any shift where training would lapse mid-hitch." },
    ],
  },
  {
    id: "maintenance", title: "Plan maintenance", minutes: 1,
    summary: "Book inspections and repairs, with maintainers, and keep grounded aircraft off missions.",
    steps: [
      { page: "maintenance", target: ".page .table-wrap, .page .cards-list", title: "Maintenance jobs", body: "Inspections and repairs on each tail, with the maintainers working on them." },
      { page: "maintenance", before: async () => { const j = store().data.jobs.find((x) => x.grounds) ?? store().data.jobs[0]; if (j) store().open("job", j.id); await waitFor(".dialog"); }, target: { sel: ".dialog .check", text: "can't fly" }, title: "Grounding jobs", body: "Tick this when the aircraft can't fly during the job. Zom's MRP then flags any mission booked on it, and it doesn't count as free on the Fleet page." },
      { page: "aircraft", target: ".maint-lane", title: "On the fleet board", body: "Jobs show in the thin row under each tail, so a gap in the missions is easy to plan into." },
    ],
  },
];

// ---------------------------------------------------------------- state and the overlay

interface TourState { tour: Tour | null; step: number; start: (id: string) => void; stop: () => void; go: (n: number) => void }

export const useTour = create<TourState>((set, get) => ({
  tour: null,
  step: 0,
  start: (id) => {
    const tour = TOURS.find((t) => t.id === id);
    if (!tour) return;
    // The walkthroughs need the demo's data.
    if (!store().demo) void store().setDemo(true);
    set({ tour, step: 0 });
  },
  stop: () => {
    if (get().tour) store().close();
    set({ tour: null, step: 0 });
  },
  go: (n) => {
    const { tour } = get();
    if (!tour) return;
    if (n >= tour.steps.length) get().stop();
    else set({ step: Math.max(0, n) });
  },
}));

/** The highlight and the card. Mounted once in the app. */
export function TourOverlay() {
  const { tour, step, go, stop } = useTour();
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [ready, setReady] = useState(false);
  const s = tour?.steps[step];

  // Set up the step: page, form, clicks, then find what to point at.
  useEffect(() => {
    if (!s) return;
    let cancelled = false;
    setReady(false);
    (async () => {
      const st = store();
      if (s.page) {
        if (st.editing) st.close();
        if (st.page !== s.page) st.go(s.page);
        await sleep(60);
      } else if (!s.before && st.editing) st.close();
      await s.before?.();
      const el = s.target ? await waitFor(s.target, 1500) : null;
      if (cancelled) return;
      el?.scrollIntoView({ block: "center", inline: "nearest" });
      await sleep(120);
      if (cancelled) return;
      setRect(el?.getBoundingClientRect() ?? null);
      setReady(true);
    })();
    return () => { cancelled = true; };
  }, [s]);

  // Follow the target as the page scrolls or resizes.
  const measure = useCallback(() => {
    if (!s?.target) return setRect(null);
    setRect(findTarget(s.target)?.getBoundingClientRect() ?? null);
  }, [s]);
  useLayoutEffect(() => {
    if (!tour) return;
    window.addEventListener("resize", measure);
    document.addEventListener("scroll", measure, true);
    return () => { window.removeEventListener("resize", measure); document.removeEventListener("scroll", measure, true); };
  }, [tour, measure]);

  useEffect(() => {
    if (!tour) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); stop(); }
      else if (e.key === "ArrowRight") go(step + 1);
      else if (e.key === "ArrowLeft") go(step - 1);
    };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [tour, step, go, stop]);

  if (!tour || !s) return null;
  const pad = 6;
  const phone = window.innerWidth < 700;
  // Below the target if it fits, else above, else (or on a phone) along the bottom.
  const cardW = Math.min(360, window.innerWidth - 32);
  let style: React.CSSProperties = {};
  if (rect && !phone) {
    const below = rect.bottom + pad + 12;
    const left = Math.min(Math.max(16, rect.left), window.innerWidth - cardW - 16);
    if (below + 220 < window.innerHeight) style = { top: below, left };
    else if (rect.top - pad - 12 - 220 > 0) style = { bottom: window.innerHeight - rect.top + pad + 12, left };
    else style = { bottom: 16, right: 16 };
  }
  const last = step === tour.steps.length - 1;

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-label={`Walkthrough: ${tour.title}`}>
      {/* Catches clicks, so the walkthrough leads; the highlight is drawn on top. */}
      <div className={`tour-block ${rect && ready ? "" : "dim"}`} />
      {rect && ready && (
        <div className="tour-spot" style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} />
      )}
      <div className={`tour-card ${rect && !phone ? "" : "docked"}`} style={{ ...style, width: cardW, opacity: ready ? 1 : 0.6 }}>
        <div className="row gap-sm">
          <span className="small muted grow">{tour.title} · {step + 1} of {tour.steps.length}</span>
          <button className="icon-btn" aria-label="End the walkthrough" onClick={stop}><X size={16} /></button>
        </div>
        <h3 style={{ margin: "6px 0 6px" }}>{s.title}</h3>
        <p>{s.body}</p>
        <div className="tour-dots" aria-hidden="true">{tour.steps.map((_, i) => <span key={i} className={i === step ? "on" : ""} />)}</div>
        <div className="row gap-sm">
          {step > 0 && <button className="btn sm" onClick={() => go(step - 1)}>Back</button>}
          <span className="grow" />
          <button className="btn sm ghost" onClick={stop}>{last ? "Close" : "Skip"}</button>
          <button className="btn sm primary" autoFocus onClick={() => go(step + 1)}>{last ? "Finish" : "Next"}</button>
        </div>
      </div>
    </div>
  );
}
