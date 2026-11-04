import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { create } from "zustand";
import { CheckCircle2, Hand, Minus, X } from "lucide-react";
import { useStore } from "./store";
import { missionCoverage, neededTraining, trainingStatus } from "./coverage";
import { canSupport } from "./fleet";
import { dayAt, ms } from "./time";
import type { AppData, Page } from "./types";

/**
 * Walkthroughs over the demo data. Each step can go to a page, open a form or click a tab, then
 * points at one thing on screen with a short card. The steps only look and click; nothing is saved
 * unless the person saves it themselves.
 */

type Target = string | { sel: string; text: string };
type Text = string | (() => string);

export interface Step {
  title: Text;
  body: Text;
  /** What to point at: a CSS selector, or a selector plus text the element must contain. Empty: a card in the middle. */
  target?: Target | (() => Target);
  /** Go to this page first (closing any open form). */
  page?: Page;
  /** Set things up before pointing, after `page`. Runs again on Back. */
  before?: () => void | Promise<void>;
  /**
   * Something for the person to do themselves. The step moves on once `done` is true. "Do it for me"
   * runs `doIt` instead.
   */
  task?: { say: Text; done: () => boolean; doIt: () => void | Promise<void> };
}

export interface Tour {
  id: string; title: string; summary: string; minutes: number; steps: Step[];
  /** Scenarios are stories to work through hands-on; the rest are tours to look around. */
  scenario?: boolean;
  /** Clear away what an earlier try left behind, so the lesson starts fresh. Demo only. */
  reset?: () => void;
}

const say = (t: Text) => (typeof t === "function" ? t() : t);

// ---------------------------------------------------------------- helpers the steps use

const sleep = (t: number) => new Promise((r) => setTimeout(r, t));
const visible = (el: Element) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };

/** The first visible element matching the target. */
export function findTarget(target: Target | (() => Target) | undefined): HTMLElement | null {
  const t = typeof target === "function" ? target() : target;
  if (!t) return null;
  const sel = typeof t === "string" ? t : t.sel;
  const all = [...document.querySelectorAll<HTMLElement>(sel)].filter(visible);
  return (typeof t === "string" ? all : all.filter((el) => el.innerText.includes(t.text)))[0] ?? null;
}

/** Wait for something to show up (a page or form that just opened). */
async function waitFor(t: Target | (() => Target), ms_ = 2000) {
  // A target that says "nothing to point at right now" isn't worth waiting for.
  if (typeof t === "function" && !t()) return null;
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

/** Type into a field the way a person would, so the page reacts. */
async function type(el: HTMLInputElement | null, value: string) {
  if (!el) return;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  await sleep(80);
}
const dateInputs = () => [...document.querySelectorAll<HTMLInputElement>('.dialog input[type="date"]')].filter(visible);
const ymd = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const fmt = (t: number) => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const activeTab = () => document.querySelector(".dialog-tabs button.on")?.textContent ?? "";
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
      { title: "Welcome to the Mission Ready Planner", body: "This is a made-up operator in Alaska: 12 helicopters, about 45 crew and 19 missions over two years. Tap around as you go: the demo is kept apart from your own data, and it's put back the way it was when the tour ends." },
      { page: "overview", target: ".page .tiles", title: "The overview", body: "Start each day here. The tiles show what's flying now, what's coming up and how many problems need a look. Tap a tile to go to that page." },
      { page: "overview", target: ".page .issue", title: "Needs attention", body: "Every open seat, double booking, missing rating, lapsed course and too-long hitch, worst first. Tap one and Zom's MRP opens the thing to fix." },
      { page: "aircraft", target: ".gantt", title: "The fleet board", body: "Every tail over time, grouped by type. Colored bars are missions; the green dashed blocks are free windows, counted from today. Ctrl + scroll (or pinch) zooms, and dragging moves through time." },
      { page: "aircraft", target: ".g-lane.sub", title: "How many are free each day", body: "The short bars count the aircraft that are free each day. A red mark means nothing is free that day." },
      { page: "aircraft", target: ".maint-lane", title: "Maintenance under each tail", body: "Inspections and repairs sit in a thin row under their aircraft. A job that grounds it is outlined red if a mission is booked on top." },
      { page: "schedule", target: ".page-head .seg", title: "The schedule", body: "The same plan as a Gantt chart, with rows by aircraft, by mission (with its crew under it) or by person. Pick one mission from the list to see only its work." },
      { page: "missions", target: ".page tbody tr, .page .list-card", title: "Missions are customers", body: "Each mission is one customer's kind of work, with its color, the training it needs and its regular crew. Its seasons are the stretches of dates it flies." },
      { page: "people", target: ".page tbody tr, .page .list-card", title: "Crew", body: "Pilots and maintainers, what they're rated on, the missions they work, their own rotation if they have one, their training and time off." },
      { page: "reports", target: ".page .tiles", title: "Reports", body: "Fleet use, days per mission, how busy each person is and how much of the flying was fully crewed, for any dates. PDF report and Excel report turn it into pages with charts and boards to share." },
      { title: "That's the tour", body: "Next, try the lessons in the Guide. They start with adding a training course and build up to a customer calling and a pilot calling in sick, with you doing each step. The Guide's How do I… section answers everyday questions." },
    ],
  },
  {
    id: "add-mission", title: "Add a mission", minutes: 2,
    summary: "The form for a new customer: its name and look, first season, training and crew. Nothing is saved.",
    steps: [
      { before: async () => { if (store().editing?.id !== "new" || store().editing?.kind !== "mission") store().open("mission", "new"); await tab("Details"); }, target: ".dialog .form-grid", title: "Name and look", body: "Type the customer's name, who to call there, and pick a color and pattern so its bars are easy to spot on the schedule." },
      { before: async () => { if (store().editing?.kind !== "mission") store().open("mission", "new"); await tab("First season"); }, target: ".dialog .form-grid", title: "Its first season", body: "The first stretch of dates it flies. Add the aircraft if you know them, how many pilots and maintainers it needs at a time, and its rotation. You can leave the aircraft for later." },
      { before: async () => { if (store().editing?.kind !== "mission") store().open("mission", "new"); await tab("Training"); }, target: ".dialog .picker-row", title: "Training it needs", body: "Tap the courses this customer's crew must have. Only people on this mission need them." },
      { before: async () => { if (store().editing?.kind !== "mission") store().open("mission", "new"); await tab("Crew"); }, target: ".dialog-body", title: "Its regular crew", body: "Tap the people who usually work it. People rated on its aircraft are listed first; the rest are folded away." },
      { before: () => { if (store().editing?.kind !== "mission") store().open("mission", "new"); }, target: ".dialog-foot", title: "Add it", body: "Add mission saves it. If something's missing, like the name, the button says what. This walkthrough closes without saving." },
    ],
  },
  {
    id: "new-job", title: "Can we take a new job?", minutes: 2,
    summary: "A customer calls with dates. Check which tails and crew could fly it, then book it.",
    steps: [
      { page: "aircraft", target: { sel: ".page-head .btn", text: "Can we take a job" }, title: "A customer calls", body: "Say a survey company wants a helicopter for a month. Start from the Fleet page with Can we take a job?" },
      { before: async () => { if (store().editing?.kind !== "support") store().open("support", "new"); await waitFor(".dialog .form-grid"); }, target: ".dialog .form-grid", title: "What the job needs", body: "Pick the dates, the aircraft type if it matters, how many pilots fly on board, and any training the customer asks for (like mountain flying)." },
      { before: () => { if (store().editing?.kind !== "support") store().open("support", "new"); }, target: ".dialog .issue", title: "The answer, tail by tail", body: "Each tail says Can do, Short crew or Can't, and why: booked, in maintenance, grounded, or not enough rated and current pilots free every day. A busy tail shows the first day it's free for the whole job." },
      { before: () => { if (store().editing?.kind !== "support") store().open("support", "new"); }, target: { sel: ".dialog .btn", text: "Book on" }, title: "Book it", body: "Book on N… starts a new mission with those dates, that tail and crew size filled in. Name the customer, save, and it's on the board." },
      { title: "Done", body: "The new mission's season then needs crew. That's the next walkthrough: “Crew a job on a rotation”." },
    ],
  },
  {
    id: "crew", title: "Crew a job on a rotation", minutes: 3,
    summary: "Set aircraft, crew numbers and a 14 on / 7 off rotation, then fill the schedule and close the gaps.",
    steps: [
      { before: () => openSeason("Details"), target: ".dialog-meta", title: "A season to crew", body: "This is next summer's fire season. The line under the title shows it at a glance: status, dates, tails and how much is crewed." },
      { before: () => openSeason("Details"), target: '.dialog [data-spot="aircraft"]', title: "Several aircraft on one job", body: "Add the tails when they're known; a planned job can wait for them. Each tail says if it's free for these dates. People rated on any of these types can crew it." },
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
      { page: "overview", target: ".page .issue", title: "Or work from the list", body: "The overview lists the same gaps with every other problem. Tap one to open the season with the gap, and use Fill the schedule or tap the open seat." },
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
      { page: "maintenance", target: ".page tbody tr, .page .list-card", title: "Maintenance jobs", body: "Inspections and repairs on each tail, with the maintainers working on them." },
      { page: "maintenance", before: async () => { const j = store().data.jobs.find((x) => x.grounds) ?? store().data.jobs[0]; if (j) store().open("job", j.id); await waitFor(".dialog"); }, target: { sel: ".dialog .check", text: "can't fly" }, title: "Grounding jobs", body: "Tick this when the aircraft can't fly during the job. Zom's MRP then flags any mission booked on it, and it doesn't count as free on the Fleet page." },
      { page: "aircraft", target: ".maint-lane", title: "On the fleet board", body: "Jobs show in the thin row under each tail, so a gap in the missions is easy to plan into." },
    ],
  },
];


// ---------------------------------------------------------------- scenarios: stories to do hands-on

const today0 = () => dayAt(Date.now());
const data = () => store().data;
const editing = () => store().editing;
const toastId = () => store().toast?.id ?? 0;
let mark = { auto: false, missions: new Set<string>(), trainings: new Set<string>(), aircraft: new Set<string>(), people: new Set<string>(), toast: 0, tags: 0, pilots: 0 };

// A customer calling: the first month, from three weeks out, that some tail can really take with one
// mountain-rated pilot on board. Worked out when the scenario starts, so it works on any day.
let call = { a: 0, b: 0 };
const mountain = () => data().trainings.find((t) => t.name === "Mountain flying")?.id;
function pickCall() {
  for (let off = 21; off < 300; off += 7) {
    const a = dayAt(today0(), off), b = dayAt(a, 30);
    if (canSupport(data(), { start: a, end: b, type: null, pilotsNeeded: 1, training: mountain() ? [mountain()!] : [] }).some((x) => x.verdict === "yes")) {
      call = { a, b };
      return;
    }
  }
  call = { a: dayAt(today0(), 45), b: dayAt(today0(), 75) };
}
const callA = () => call.a;
const callB = () => call.b; // the day after the last day
const newMission = () => data().missions.find((m) => !mark.missions.has(m.id));
const newSeason = () => data().seasons.find((x) => x.missionId === newMission()?.id);

// Someone booked from tomorrow, who calls in sick for a week.
let sick = { id: "", name: "", mission: "", a: 0, b: 0 };
function pickSick() {
  const d = data(), a = dayAt(today0(), 1);
  const sh = d.shifts.find((x) => ms(x.start) <= a && ms(x.end) > dayAt(a, 3) && d.people.find((p) => p.id === x.personId)?.role === "Pilot");
  const p = d.people.find((x) => x.id === sh?.personId) ?? d.people[0];
  const season = d.seasons.find((x) => x.id === sh?.seasonId);
  sick = { id: p.id, name: p.name, mission: d.missions.find((m) => m.id === season?.missionId)?.name ?? "a mission", a, b: dayAt(a, 7) };
}

const pilotsOnBoard = () => Number((document.querySelector('.dialog input[aria-label="pilots"]') as HTMLInputElement | null)?.value ?? 0);
const tagCount = () => document.querySelectorAll(".dialog .tag").length;
const pilotsAtATime = () => Number((document.querySelector('.dialog input[aria-label="pilots"]') as HTMLInputElement | null)?.value ?? 0);
const filled = () => toastId() !== mark.toast && /shift|Nobody/.test(store().toast?.text ?? "");

export const SCENARIOS: Tour[] = [
  {
    id: "call", scenario: true, title: "A customer calls with dates", minutes: 4,
    reset: () => {
      store().change((d) => {
        const old = new Set(d.missions.filter((m) => m.name.trim().toLowerCase().startsWith("denali heli")).map((m) => m.id));
        const seasons = new Set(d.seasons.filter((x) => old.has(x.missionId)).map((x) => x.id));
        return { ...d, missions: d.missions.filter((m) => !old.has(m.id)), seasons: d.seasons.filter((x) => !seasons.has(x.id)), shifts: d.shifts.filter((x) => !seasons.has(x.seasonId)), people: d.people.map((p) => ({ ...p, missionIds: p.missionIds.filter((id) => !old.has(id)) })) };
      });
      mark.missions = new Set(data().missions.map((m) => m.id));
    },
    summary: "Denali Heli-Ski Tours wants a helicopter for a month. Check the fleet, book it, and crew it.",
    steps: [
      {
        page: "aircraft", before: pickCall,
        target: { sel: ".page-head .btn", text: "Can we take a job" },
        title: "Denali Heli-Ski Tours calls",
        body: () => `They want a helicopter with mountain-rated pilots from ${fmt(callA())} to ${fmt(dayAt(callB(), -1))}. Before saying yes, check what the fleet can support.`,
        task: { say: "Tap Can we take a job?", done: () => editing()?.kind === "support", doIt: () => store().open("support", "new") },
      },
      {
        before: () => { if (editing()?.kind !== "support") store().open("support", "new"); },
        target: ".dialog .form-grid", title: "What they need",
        body: "Put in their dates, how many pilots fly on board, and the training their pilots must have. The answer below updates as you go.",
        task: {
          say: () => `Set the first day to ${fmt(callA())}, the last day to ${fmt(dayAt(callB(), -1))}, Pilots on board to 1, and tap Mountain flying.`,
          done: () => dateInputs()[0]?.value === ymd(callA()) && dateInputs()[1]?.value === ymd(dayAt(callB(), -1)) && pilotsOnBoard() === 1 && !!findTarget({ sel: ".dialog .chip.pick.on", text: "Mountain flying" }),
          doIt: async () => {
            while (pilotsOnBoard() > 1) await click('.dialog button[aria-label="Fewer pilots"]');
            await type(dateInputs()[1] ?? null, ymd(dayAt(callB(), -1)));
            await type(dateInputs()[0] ?? null, ymd(callA()));
            await type(dateInputs()[1] ?? null, ymd(dayAt(callB(), -1)));
            if (!findTarget({ sel: ".dialog .chip.pick.on", text: "Mountain flying" })) await click({ sel: ".dialog .chip.pick", text: "Mountain flying" });
          },
        },
      },
      {
        target: ".dialog .issue", title: "The answer, tail by tail",
        body: "Can do means the tail is free and enough rated, current pilots are free every day. Short crew means the aircraft is free but pilots aren't. Can't says why, and when it's free next. Scroll to see them all.",
      },
      {
        target: { sel: ".dialog .btn", text: "Book on" }, title: "Book it",
        body: "Booking starts a new mission with the dates, the tail and the pilots already filled in.",
        task: { say: "Tap Book on… next to a tail that says Can do.", done: () => editing()?.kind === "mission" && editing()?.id === "new", doIt: () => click({ sel: ".dialog .btn", text: "Book on" }) },
      },
      {
        target: '.dialog input[placeholder="Interior Fire Service"]', title: "Name the customer",
        body: "A mission is the customer. Its color and pattern are picked for you; change them if you like.",
        task: {
          say: "Type Denali Heli-Ski Tours as the name.",
          done: () => !!(findTarget('.dialog input[placeholder="Interior Fire Service"]') as HTMLInputElement | null)?.value.trim(),
          doIt: () => type(findTarget('.dialog input[placeholder="Interior Fire Service"]') as HTMLInputElement | null, "Denali Heli-Ski Tours"),
        },
      },
      {
        target: { sel: ".dialog-tabs button", text: "First season" }, title: "Check its first season",
        body: "The dates, the tail and the pilots on board came from the check. One thing is left: how the pilots rotate.",
        task: { say: "Tap the First season tab.", done: () => activeTab().startsWith("First season"), doIt: () => tab("First season") },
      },
      {
        target: ".dialog .rotation", title: "Set the rotation",
        body: "Pilots on this job work 14 days, then have 7 off. Fill the schedule will rotate them on that pattern.",
        task: {
          say: "Set the pilot rotation to 14 on, 7 off.",
          done: () => { const [on, off] = document.querySelectorAll<HTMLInputElement>(".dialog .rotation input"); return on?.value === "14" && off?.value === "7"; },
          doIt: async () => { if (!activeTab().startsWith("First season")) await tab("First season"); const [on, off] = document.querySelectorAll<HTMLInputElement>(".dialog .rotation input"); await type(on, "14"); await type(off, "7"); },
        },
      },
      {
        target: ".dialog-foot .btn.primary", title: "Add it",
        body: "That's enough to put it on the board. Training and regular crew can be set any time on its other tabs.",
        task: { say: "Tap Add mission.", done: () => !!newMission() && editing()?.kind !== "mission", doIt: () => click(".dialog-foot .btn.primary") },
      },
      {
        before: () => { if (editing()?.kind === "support") store().close(); },
        title: "Now crew it",
        body: () => `“${newMission()?.name ?? "The new mission"}” is booked but has nobody on it yet. Its season is where the crew goes.`,
        task: {
          say: () => `Open its season: Missions › ${newMission()?.name ?? "the new mission"} › Seasons › tap the dates.`,
          done: () => editing()?.kind === "season" && editing()?.id === newSeason()?.id,
          doIt: () => { const x = newSeason(); if (x) store().open("season", x.id); },
        },
      },
      {
        before: async () => { if (editing()?.kind === "season") await tab("Pilots"); mark.toast = toastId(); },
        target: { sel: ".dialog .btn", text: "Fill the schedule" }, title: "Fill the schedule",
        body: "The red stripes are days with nobody on. Fill the schedule rotates free, rated and current pilots through them on the 14 on, 7 off pattern.",
        task: { say: "Tap Fill the schedule.", done: filled, doIt: () => click({ sel: ".dialog .btn", text: "Fill the schedule" }) },
      },
      {
        target: ".dialog-foot .btn.primary", title: "Save",
        body: "Each line is one pilot's stretch. Tap any line to swap the person or change the dates. Anything still red is a day nobody was free.",
        task: { say: "Tap Save.", done: () => !!newSeason() && data().shifts.some((x) => x.seasonId === newSeason()!.id), doIt: () => click(".dialog-foot .btn.primary") },
      },
      {
        page: "aircraft", title: "Booked and crewed",
        body: "It's on the Fleet board now, on the tail you picked, and its pilots show on the schedule. That's the whole loop: check, book, crew.",
      },
    ],
  },
  {
    id: "sick", scenario: true, title: "A pilot calls in sick", minutes: 3,
    summary: "Record their time off, see the problem it makes, and get someone else on.",
    steps: [
      {
        page: "people", before: pickSick, target: { sel: ".page-head .btn", text: "Add time off" },
        title: () => `${sick.name} calls in sick`,
        body: () => `They're on ${sick.mission} and will be out ${fmt(sick.a)} to ${fmt(dayAt(sick.b, -1))}. First, write it down.`,
        task: { say: "Tap Add time off.", done: () => editing()?.kind === "timeOff", doIt: () => store().open("timeOff", "new") },
      },
      {
        target: ".dialog .form-grid", title: "Who and when",
        body: "Time off keeps them from being offered for shifts on those days.",
        task: {
          say: () => `Pick ${sick.name}, set ${fmt(sick.a)} to ${fmt(dayAt(sick.b, -1))}, and type Sick as the reason.`,
          done: () => (document.querySelector(".dialog select") as HTMLSelectElement | null)?.value === sick.id && dateInputs()[0]?.value === ymd(sick.a) && dateInputs()[1]?.value === ymd(dayAt(sick.b, -1)),
          doIt: async () => {
            await choose(".dialog select", sick.id);
            await type(dateInputs()[1] ?? null, ymd(dayAt(sick.b, -1)));
            await type(dateInputs()[0] ?? null, ymd(sick.a));
            await type(document.querySelector<HTMLInputElement>('.dialog input[placeholder^="Vacation"]'), "Sick");
          },
        },
      },
      {
        target: ".dialog-foot .btn.primary", title: "Add it",
        body: "Nothing changes until you add it.",
        task: { say: "Tap Add time off.", done: () => data().timeOff.some((t) => t.personId === sick.id && ms(t.start) === sick.a), doIt: () => click(".dialog-foot .btn.primary") },
      },
      {
        page: "overview", target: () => ({ sel: ".page .issue", text: sick.name }), title: "A new problem",
        body: () => `The overview now says ${sick.name} is off but still booked on ${sick.mission}. Problems always open the place to fix them.`,
        task: { say: () => `Tap the problem about ${sick.name}.`, done: () => editing()?.kind === "season", doIt: () => click({ sel: ".page .issue", text: sick.name }) },
      },
      {
        before: async () => { if (editing()?.kind === "season" && !activeTab().startsWith("Pilots")) await tab("Pilots"); },
        target: () => ({ sel: ".dialog .line.flag", text: sick.name }), title: "Their shift is marked",
        body: "Lines with a red edge have a problem. Take them off this stretch.",
        task: {
          say: () => `Tap ${sick.name}'s red-edged line, then tap Remove.`,
          done: () => !findTarget({ sel: ".dialog .line.flag", text: sick.name }) && !document.querySelector(".dialog .line-edit"),
          doIt: async () => { await click({ sel: ".dialog .line.flag", text: sick.name }); await click({ sel: ".dialog .line-edit .btn", text: "Remove" }); },
        },
      },
      {
        before: () => { mark.toast = toastId(); },
        target: { sel: ".dialog .btn", text: "Fill the schedule" }, title: "Fill the hole",
        body: "Removing them left an open seat, the red line. Fill the schedule finds someone free, rated and current for just those days. You could also tap the open seat to pick someone yourself.",
        task: { say: "Tap Fill the schedule.", done: filled, doIt: () => click({ sel: ".dialog .btn", text: "Fill the schedule" }) },
      },
      {
        target: ".dialog-foot .btn.primary", title: "Save",
        body: "Check who it picked, then save.",
        task: { say: "Tap Save.", done: () => editing()?.kind !== "season", doIt: () => click(".dialog-foot .btn.primary") },
      },
      {
        page: "schedule", before: () => click({ sel: ".page-head .seg button", text: "Crew" }), target: ".gantt", title: "Covered",
        body: () => `${sick.name}'s days off are shaded on the crew schedule, and someone else has their stretch. Back on the overview, the problem is gone.`,
      },
    ],
  },
  {
    id: "grow", scenario: true, title: "A job needs another aircraft", minutes: 2,
    summary: "The fire service wants one more tail and one more pilot on. Add them and crew the extra seat.",
    steps: [
      {
        before: async () => { await openSeason("Details"); mark.tags = tagCount(); mark.pilots = pilotsAtATime(); },
        target: '.dialog [data-spot="aircraft"]', title: "One more aircraft",
        body: "Interior Fire Service wants a third helicopter for next summer's season, with one more pilot on at a time. Each tail says whether it's free for these dates.",
        task: {
          say: "Under Add another, tap a tail that says Free.",
          done: () => tagCount() > mark.tags,
          doIt: () => click(document.querySelector<HTMLElement>(".dialog .ac-pick.free") ? ".dialog .ac-pick.free" : ".dialog .ac-pick"),
        },
      },
      {
        target: '.dialog button[aria-label="More pilots"]', title: "One more pilot",
        body: "Pilots at a time counts across all the job's aircraft.",
        task: { say: "Tap + next to Pilots at a time.", done: () => pilotsAtATime() > mark.pilots, doIt: () => click('.dialog button[aria-label="More pilots"]') },
      },
      {
        before: async () => { await tab("Pilots"); mark.toast = toastId(); },
        target: { sel: ".dialog .btn", text: "Fill the schedule" }, title: "Crew the extra seat",
        body: "The extra seat shows as more red. Fill the schedule only adds people; the shifts already there stay.",
        task: { say: "Tap Fill the schedule.", done: filled, doIt: () => click({ sel: ".dialog .btn", text: "Fill the schedule" }) },
      },
      {
        target: ".dialog-foot .btn.primary", title: "Save",
        body: "Any red left means nobody rated and current was free those days. That's when to hire, train, or move someone from another job.",
        task: { say: "Tap Save.", done: () => editing()?.kind !== "season", doIt: () => click(".dialog-foot .btn.primary") },
      },
      { page: "aircraft", title: "Done", body: "The new tail shows the fire season on the Fleet board." },
    ],
  },
];


// ---------------------------------------------------------------- lessons: setting up, hands-on

const COURSE = "Glacier landings", TAIL = "N520AK", PILOT = "Kit Larkin", ICEFIELD = "Juneau Icefield Tours";
/** The course added in this lesson (not one from before it started). */
const course = () => data().trainings.find((t) => !mark.trainings.has(t.id));
const same = (a: string, b: string) => a.trim().toLowerCase() === b.toLowerCase();
/** Take out what an earlier try of a lesson added, then note what's there now. */
function clearOld(fn: (d: AppData) => AppData) {
  store().change(fn);
  remember();
}
const icefield = () => mission(ICEFIELD);
const newTail = () => data().aircraft.find((a) => !mark.aircraft.has(a.id));
const newPilot = () => data().people.find((p) => !mark.people.has(p.id));
const field = (label: string) => {
  const f = [...document.querySelectorAll<HTMLElement>(".dialog .field")].find((x) => x.querySelector(":scope > span")?.textContent === label);
  return (f?.querySelector("input, select") ?? null) as HTMLInputElement | null;
};
const remember = () => { mark.trainings = new Set(data().trainings.map((t) => t.id)); mark.aircraft = new Set(data().aircraft.map((a) => a.id)); mark.people = new Set(data().people.map((p) => p.id)); };
const pickOn = (text: string) => !!findTarget({ sel: ".dialog .chip.pick.on", text });
const tapPick = async (text: string) => { if (!pickOn(text)) await click({ sel: ".dialog .chip.pick", text }); };

export const SETUP: Tour[] = [
  {
    id: "learn-training", scenario: true, title: "Add a training course", minutes: 2,
    reset: () => clearOld((d) => {
      const old = new Set(d.trainings.filter((t) => same(t.name, COURSE)).map((t) => t.id));
      return {
        ...d, trainings: d.trainings.filter((t) => !old.has(t.id)),
        missions: d.missions.map((m) => ({ ...m, requiredTrainingIds: m.requiredTrainingIds.filter((x) => !old.has(x)) })),
        people: d.people.map((p) => ({ ...p, training: p.training.filter((r) => !old.has(r.trainingId)) })),
      };
    }),
    summary: "Add a course people need, and set which mission needs it.",
    steps: [
      {
        page: "training",
        target: { sel: ".page-head .btn", text: "Add training" }, title: "A new course",
        body: `Juneau Icefield Tours now wants its pilots trained in ${COURSE}, renewed every 2 years. Courses live on the Training page.`,
        task: { say: "Tap Add training.", done: () => editing()?.kind === "training" && editing()?.id === "new", doIt: () => store().open("training", "new") },
      },
      {
        target: ".dialog .form-grid", title: "Name it and how long it lasts",
        body: "Renew every is in months. Zom's MRP warns before it runs out, and 0 means it never does.",
        task: {
          say: `Type ${COURSE} as the name, and set Renew every to 24.`,
          done: () => !!field("Name")?.value.trim() && (document.querySelector<HTMLInputElement>('.dialog input[aria-label="months"]')?.value === "24"),
          doIt: async () => { await type(field("Name"), COURSE); await type(document.querySelector<HTMLInputElement>('.dialog input[aria-label="months"]'), "24"); },
        },
      },
      {
        target: ".dialog-foot .btn.primary", title: "Add it",
        body: "A course on its own doesn't ask anything of anyone yet. A mission has to need it.",
        task: { say: "Tap Add training.", done: () => !!course() && editing()?.kind !== "training", doIt: () => click(".dialog-foot .btn.primary") },
      },
      {
        // Points at whatever comes next as the person gets there: the mission's tabs, then the course.
        target: () => (editing()?.kind !== "mission" ? "" : activeTab().startsWith("Training") ? { sel: ".dialog .chip.pick", text: course()?.name ?? COURSE } : ".dialog-tabs"),
        title: "Missions say what they need",
        body: () => `Open ${ICEFIELD} and tick ${course()?.name ?? COURSE} on its Training tab. Then only the people who work it need the course.`,
        task: {
          say: () => `Open ${ICEFIELD} (Missions page), go to its Training tab, and tap ${course()?.name ?? COURSE}.`,
          done: () => editing()?.kind === "mission" && pickOn(course()?.name ?? COURSE),
          doIt: async () => { const m = icefield(); if (m && editing()?.id !== m.id) store().open("mission", m.id); await tab("Training"); await tapPick(course()?.name ?? COURSE); },
        },
      },
      {
        target: ".dialog-foot .btn.primary", title: "Save",
        body: "Its crew now show as not current for this course until it's recorded on them, the way lesson 3 does for a new pilot.",
        task: { say: "Tap Save.", done: () => !!course() && !!icefield()?.requiredTrainingIds.includes(course()!.id), doIt: () => click(".dialog-foot .btn.primary") },
      },
      { page: "training", target: ".page .seg", title: "Lesson done", body: "Who's current on this page now counts the new course for that mission's crew." },
    ],
  },
  {
    id: "learn-aircraft", scenario: true, title: "Add an aircraft", minutes: 1,
    reset: () => clearOld((d) => {
      const old = new Set(d.aircraft.filter((a) => same(a.tail, TAIL)).map((a) => a.id));
      return { ...d, aircraft: d.aircraft.filter((a) => !old.has(a.id)), seasons: d.seasons.map((x) => ({ ...x, aircraftIds: x.aircraftIds.filter((id) => !old.has(id)) })), jobs: d.jobs.filter((j) => !old.has(j.aircraftId)) };
    }),
    summary: "Put a new helicopter on the fleet by its tail number.",
    steps: [
      {
        page: "aircraft",
        target: { sel: ".page-head .btn", text: "Add aircraft" }, title: "A new helicopter",
        body: `The company just bought an AS350 B3, ${TAIL}, based in Juneau. Aircraft live on the Fleet page.`,
        task: { say: "Tap Add aircraft.", done: () => editing()?.kind === "aircraft" && editing()?.id === "new", doIt: () => store().open("aircraft", "new") },
      },
      {
        target: { sel: ".dialog .field", text: "Tail number" }, title: "Tail, type and base",
        body: "The tail number is how it's shown everywhere. The type has to match what pilots are rated on, so pick it from the suggestions.",
        task: {
          say: `Type ${TAIL} as the tail number, AS350 B3 as the type, and Juneau as the base.`,
          done: () => !!field("Tail number")?.value.trim() && !!field("Type")?.value.trim(),
          doIt: async () => { await type(field("Tail number"), TAIL); await type(field("Type"), "AS350 B3"); await type(field("Base"), "Juneau"); },
        },
      },
      {
        target: ".dialog .stepper", title: "Pilot seats",
        body: "How many pilots fly it at once. An AS350 has one; leave it at 1.",
        task: { say: "Make sure Pilot seats is 1.", done: () => document.querySelector<HTMLInputElement>('.dialog input[aria-label="pilot seats"]')?.value === "1", doIt: async () => { while (Number(document.querySelector<HTMLInputElement>('.dialog input[aria-label="pilot seats"]')?.value) > 1) await click('.dialog button[aria-label="Fewer pilot seats"]'); } },
      },
      {
        target: ".dialog-foot .btn.primary", title: "Add it",
        body: "If something's missing, the button says what.",
        task: { say: "Tap Add aircraft.", done: () => !!newTail() && editing()?.kind !== "aircraft", doIt: () => click(".dialog-foot .btn.primary") },
      },
      {
        page: "aircraft", target: () => ({ sel: ".g-label", text: newTail()?.tail ?? TAIL }), title: "On the board",
        body: "It shows under its type, free from today. A customer can be booked onto it with Can we take a job? or by tapping a free block.",
      },
    ],
  },
  {
    id: "learn-pilot", scenario: true, title: "Add a pilot", minutes: 3,
    reset: () => clearOld((d) => {
      const old = new Set(d.people.filter((p) => same(p.name, PILOT)).map((p) => p.id));
      return { ...d, people: d.people.filter((p) => !old.has(p.id)), shifts: d.shifts.filter((x) => !old.has(x.personId)), timeOff: d.timeOff.filter((t) => !old.has(t.personId)), jobs: d.jobs.map((j) => ({ ...j, maintainerIds: j.maintainerIds.filter((id) => !old.has(id)) })) };
    }),
    summary: "A new pilot: what they're rated on, the mission they work, and their training.",
    steps: [
      {
        page: "people",
        target: { sel: ".page-head .btn", text: "Add pilot" }, title: "A new hire",
        body: `${PILOT} joins to fly ${ICEFIELD}. People live on the Crew page.`,
        task: { say: "Tap Add pilot.", done: () => editing()?.kind === "person" && editing()?.id === "new", doIt: () => store().open("person", "new", { role: "Pilot" }) },
      },
      {
        target: { sel: ".dialog .field", text: "Name" }, title: "Name and base",
        body: "Base is where they usually work from. A fixed rotation (like 2 weeks on, 2 off) is lower down; leave it off for now.",
        task: { say: `Type ${PILOT} as the name and Juneau as the base.`, done: () => !!field("Name")?.value.trim(), doIt: async () => { await type(field("Name"), PILOT); await type(field("Base"), "Juneau"); } },
      },
      {
        before: async () => { if (editing()?.kind === "person" && !activeTab().startsWith("Ratings")) await tab("Ratings"); },
        target: { sel: ".dialog .chip.pick", text: "AS350 B3" }, title: "What they can fly",
        body: "Rated on is the aircraft types they can fly. They're only offered for jobs on those types.",
        task: { say: "Tap AS350 B3.", done: () => pickOn("AS350 B3"), doIt: async () => { await tab("Ratings"); await tapPick("AS350 B3"); } },
      },
      {
        before: async () => { if (editing()?.kind === "person" && !activeTab().startsWith("Ratings")) await tab("Ratings"); },
        target: { sel: ".dialog .chip.pick", text: ICEFIELD }, title: "The mission they work",
        body: "Works on is the missions they rotate through. It decides which training they need, and they're picked first when those missions are filled.",
        task: { say: `Tap ${ICEFIELD}.`, done: () => pickOn(ICEFIELD), doIt: async () => { await tab("Ratings"); await tapPick(ICEFIELD); } },
      },
      {
        before: async () => {
          if (editing()?.kind !== "person") return;
          // The courses come from the mission they work, so make sure it's ticked.
          if (!activeTab().startsWith("Ratings")) await tab("Ratings");
          mark.auto = !pickOn(ICEFIELD);
          if (mark.auto) await tapPick(ICEFIELD);
          await tab("Training");
        },
        target: () => (findTarget(".dialog .picker-row") ? ".dialog .picker-row" : ".dialog .toolbar"), title: "Their training",
        body: () => `${mark.auto ? `${ICEFIELD} wasn't ticked under Works on, so it's ticked now: the courses below come from it. ` : ""}Each course ${ICEFIELD} needs has a + button. It's added as done today; tap its line afterwards to change the dates.`,
        task: {
          say: "Tap each course under “Needed for their missions” until none are left.",
          done: () => activeTab().startsWith("Training") && !findTarget({ sel: ".dialog .form-section", text: "Needed for their missions" }) && !document.querySelector(".dialog .line-edit") && document.querySelectorAll(".dialog .line").length > 0,
          doIt: async () => {
            if (!activeTab().startsWith("Training")) await tab("Training");
            for (let i = 0; i < 8; i++) {
              await click({ sel: ".dialog .line-edit .btn", text: "Done" });
              const b = [...document.querySelectorAll<HTMLElement>(".dialog .picker-row .btn")].find(visible);
              if (!b) break;
              b.click(); await sleep(150);
            }
            await click({ sel: ".dialog .line-edit .btn", text: "Done" });
          },
        },
      },
      {
        target: ".dialog-foot .btn.primary", title: "Add them",
        body: "They'll now be offered, and picked by Fill the schedule, for jobs they're rated and current for.",
        task: { say: "Tap Add pilot.", done: () => !!newPilot() && editing()?.kind !== "person", doIt: () => click(".dialog-foot .btn.primary") },
      },
      {
        page: "training", before: () => choose('select[aria-label="Show crew for"]', icefield()?.id ?? ""),
        target: () => ({ sel: ".page .table-wrap tr, .page .list-card", text: newPilot()?.name ?? PILOT }), title: "Lesson done",
        body: () => {
          const p = newPilot(), m = icefield();
          if (!p) return "The pilot wasn't added. Run the lesson again to try once more.";
          const name = p.name;
          if (!m || !p.missionIds.includes(m.id)) return `${name} was added, but isn't on ${ICEFIELD}'s crew, so they don't show here. Open them on the Crew page and tick it under Works on.`;
          const now = Date.now();
          const missing = [...neededTraining(data(), p).keys()].filter((id) => trainingStatus(p, id, now, now + 1).state !== "ok").length;
          return `${name} is on ${ICEFIELD}'s crew${missing ? `, but still needs ${missing} course${missing === 1 ? "" : "s"}: tap their row to add them` : " and current on everything it needs"}.`;
        },
      },
    ],
  },
];

/** The learning path, in order: set up, then the everyday jobs. */
export const LESSONS: Tour[] = [...SETUP, ...SCENARIOS];
/** A lesson's number on the path, from 1; 0 for the tours. */
export const lessonNo = (id: string) => LESSONS.findIndex((t) => t.id === id) + 1;

// ---------------------------------------------------------------- state and the overlay

/** Which walkthroughs someone has finished, kept in this browser so the guide can tick them off. */
const PROGRESS = "zoms-mrp:tours-done";
const readDone = (): Record<string, true> => { try { return JSON.parse(localStorage.getItem(PROGRESS) ?? "{}"); } catch { return {}; } };
const ALL = () => [...LESSONS, ...TOURS];

interface TourState {
  tour: Tour | null; step: number; done: Record<string, true>;
  start: (id: string) => void; stop: () => void; go: (n: number) => void;
  /** The lesson after this one on the learning path, if any. */
  next: (id: string) => Tour | undefined;
}

// Someone who starts a walkthrough from their own data goes back to it when the walkthrough ends.
let backToOwn = false;

export const useTour = create<TourState>((set, get) => ({
  tour: null,
  step: 0,
  done: readDone(),
  start: (id) => {
    const tour = ALL().find((t) => t.id === id);
    if (!tour) return;
    void (async () => {
      // The walkthroughs need the demo's data.
      if (!store().demo) {
        backToOwn = true;
        await store().setDemo(true);
      }
      if (store().editing) store().close();
      // Each walkthrough begins on a fresh demo, so it goes the same way every time.
      store().resetDemo(true);
      tour.reset?.();
      set({ tour, step: 0 });
    })();
  },
  stop: () => {
    if (!get().tour) return;
    if (store().editing) store().close();
    // Every walkthrough leaves the demo the way it found it.
    if (store().demo) {
      store().resetDemo(true);
      if (backToOwn) void store().setDemo(false); // says "Back to your own data."
      else store().showToast("The demo is back the way it was.");
    }
    backToOwn = false;
    set({ tour: null, step: 0 });
  },
  go: (n) => {
    const { tour } = get();
    if (!tour) return;
    if (n >= tour.steps.length) {
      const done = { ...get().done, [tour.id]: true as const };
      try { localStorage.setItem(PROGRESS, JSON.stringify(done)); } catch { /* only a convenience */ }
      set({ done });
      get().stop();
    } else set({ step: Math.max(0, n) });
  },
  next: (id) => { const i = LESSONS.findIndex((t) => t.id === id); return i >= 0 ? LESSONS[i + 1] : undefined; },
}));

// Walkthroughs only ever touch the demo: switching to your own data mid-way ends the walkthrough.
useStore.subscribe((now, before) => {
  if (before.demo && !now.demo && useTour.getState().tour) useTour.getState().stop();
});

/**
 * The highlight and the card. Mounted once in the app. The page stays usable underneath: it can be
 * scrolled and tapped, which is how the scenarios' "Your turn" tasks get done.
 */
export function TourOverlay() {
  const { tour, step, go, stop } = useTour();
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [ready, setReady] = useState(false);
  const [done, setDone] = useState(false);
  const [small, setSmall] = useState(false);
  const [busy, setBusy] = useState(false);
  // Was the task already done when the step opened (say, after Back)? Then it waits for Next.
  const [doneAtStart, setDoneAtStart] = useState(false);
  // On a phone the card leads with what to do; the explanation waits behind "Why?".
  const [why, setWhy] = useState(false);
  const s = tour?.steps[step];

  // Set up the step: page, form, clicks, then find what to point at.
  useEffect(() => {
    if (!s) return;
    let cancelled = false;
    setReady(false);
    setDone(false);
    setDoneAtStart(!!s.task?.done());
    setWhy(false);
    (async () => {
      const st = store();
      if (s.page) {
        if (st.editing) st.close();
        if (st.page !== s.page) st.go(s.page);
        await sleep(30);
      }
      await s.before?.();
      const el = s.target ? await waitFor(s.target, 1200) : null;
      if (cancelled) return;
      // A tall target scrolls to its top, so the card at the bottom leaves its start in view.
      el?.scrollIntoView({ block: el.getBoundingClientRect().height > window.innerHeight * 0.4 ? "start" : "center", inline: "nearest" });
      await sleep(40);
      if (cancelled) return;
      setRect(el?.getBoundingClientRect() ?? null);
      setReady(true);
    })();
    return () => { cancelled = true; };
  }, [s]);

  // Follow the target as the page scrolls, resizes or changes.
  const measure = useCallback(() => {
    const r = s?.target ? findTarget(s.target)?.getBoundingClientRect() ?? null : null;
    setRect((old) => (old && r && old.top === r.top && old.left === r.left && old.width === r.width && old.height === r.height) || (!old && !r) ? old : r);
  }, [s]);
  useLayoutEffect(() => {
    if (!tour) return;
    window.addEventListener("resize", measure);
    document.addEventListener("scroll", measure, true);
    const t = setInterval(measure, 400);
    return () => { window.removeEventListener("resize", measure); document.removeEventListener("scroll", measure, true); clearInterval(t); };
  }, [tour, measure]);

  // A task moves on by itself once it's done.
  useEffect(() => {
    if (!s?.task || !ready || done) return;
    if (doneAtStart && s.task.done()) { setDone(true); return; }
    const t = setInterval(() => {
      if (s.task!.done()) {
        setDone(true);
        clearInterval(t);
        setTimeout(() => { if (useTour.getState().step === step) go(step + 1); }, 600);
      }
    }, 150);
    return () => clearInterval(t);
  }, [s, ready, done, step, go, doneAtStart]);

  // Room under the page and forms, so anything the card covers can be scrolled up above it.
  useEffect(() => {
    document.body.classList.toggle("touring", !!tour);
    return () => document.body.classList.remove("touring");
  }, [tour]);

  useEffect(() => {
    if (!tour) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); stop(); }
    };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [tour, stop]);

  if (!tour || !s) return null;
  const pad = 6;
  const phone = window.innerWidth < 700 || window.innerHeight <= 500; // the same as the phone layout in styles.css
  // Below the target if it fits, else above, else (or on a phone) along the bottom.
  const cardW = Math.min(380, window.innerWidth - 24);
  let style: React.CSSProperties = {};
  if (rect && !phone) {
    const below = rect.bottom + pad + 12;
    const left = Math.min(Math.max(16, rect.left), window.innerWidth - cardW - 16);
    if (below + 260 < window.innerHeight) style = { top: below, left };
    else if (rect.top - pad - 12 - 260 > 0) style = { bottom: window.innerHeight - rect.top + pad + 12, left };
    else style = { bottom: 16, right: 16 };
  }
  const last = step === tour.steps.length - 1;
  const next = useTour.getState().next(tour.id);
  const doIt = async () => {
    setBusy(true);
    try { await s.task!.doIt(); } finally { setBusy(false); }
  };

  if (small)
    return (
      <button className="tour-pill" onClick={() => setSmall(false)}>
        {tour.title} · {step + 1} of {tour.steps.length} <b>Show</b>
      </button>
    );

  return (
    <div className="tour" role="dialog" aria-label={`Walkthrough: ${tour.title}`}>
      {rect && ready
        ? <div className="tour-spot" style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} />
        : !s.task && <div className="tour-dim" />}
      <div className={`tour-card ${phone ? "compact" : ""} ${rect && !phone ? "" : "docked"} ${phone && rect && rect.height < window.innerHeight * 0.4 && rect.top + rect.height / 2 > window.innerHeight / 2 ? "top" : ""}`} style={{ ...style, width: cardW, opacity: ready ? 1 : 0.7 }}>
        <div className="row gap-sm">
          <span className="small muted grow">
            {phone ? `${lessonNo(tour.id) ? `Lesson ${lessonNo(tour.id)}` : "Tour"} · ${step + 1} of ${tour.steps.length}`
              : `${lessonNo(tour.id) ? `Lesson ${lessonNo(tour.id)}` : "Tour"}: ${tour.title} · step ${step + 1} of ${tour.steps.length}`}
          </span>
          {phone && s.task && <button className="btn sm ghost" onClick={() => setWhy(!why)}>{why ? "Hide" : "Why?"}</button>}
          <button className="icon-btn" aria-label="Make this card small" title="Make small, to see the page" onClick={() => setSmall(true)}><Minus size={16} /></button>
          <button className="icon-btn" aria-label="End the walkthrough" onClick={stop}><X size={16} /></button>
        </div>
        {(!phone || !s.task || why) && (
          <>
            <h3 style={{ margin: "6px 0 6px" }}>{say(s.title)}</h3>
            <p>{say(s.body)}</p>
          </>
        )}
        {last && next && <p className="small"><b>Up next:</b> {next.title} ({next.minutes} min)</p>}
        {last && lessonNo(tour.id) > 0 && <p className="small muted">Finishing puts the demo back the way it was.</p>}
        {s.task && (
          <div className={`tour-task ${done ? "done" : ""}`}>
            {done ? <><CheckCircle2 size={16} /> <b>Done.</b></> : <><Hand size={16} /> <span>{phone ? <b>{say(s.task.say)}</b> : <><b>Your turn:</b> {say(s.task.say)}</>}</span></>}
          </div>
        )}
        {!phone && <div className="tour-dots" aria-hidden="true">{tour.steps.map((_, i) => <span key={i} className={i === step ? "on" : i < step ? "past" : ""} />)}</div>}
        <div className="row gap-sm">
          {step > 0 && <button className="btn sm" onClick={() => go(step - 1)}>Back</button>}
          <span className="grow" />
          {s.task && !done ? (
            <>
              <button className="btn sm ghost" onClick={() => go(step + 1)}>Skip step</button>
              <button className="btn sm primary" disabled={busy} onClick={doIt}>Do it for me</button>
            </>
          ) : (
            last && next ? (
              <>
                <button className="btn sm" onClick={() => go(step + 1)}>Take a break</button>
                <button className="btn sm primary" autoFocus onClick={() => { go(step + 1); setTimeout(() => useTour.getState().start(next.id), 50); }}>Next lesson</button>
              </>
            ) : <button className="btn sm primary" autoFocus onClick={() => go(step + 1)}>{last ? "Finish" : "Next"}</button>
          )}
        </div>
      </div>
    </div>
  );
}
