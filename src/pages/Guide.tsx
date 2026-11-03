import type { ReactNode } from "react";
import { Clock, PlayCircle } from "lucide-react";
import { TOURS, useTour } from "../tour";
import { useStore } from "../store";
import { isOnlineDemo, isServerBuild } from "../platform";

const mac = typeof navigator !== "undefined" && /Mac/.test(navigator.platform);
const mod = mac ? "⌘" : "Ctrl";

export const SHORTCUTS: [string, string][] = [
  [`${mod} scroll`, "Zoom a chart in or out (or pinch)"],
  ["Shift scroll", "Move a chart through time (or drag it)"],
  ["N", "New mission (or a new item on its own page)"],
  [`${mod} Z`, "Undo"],
  [`${mod} Shift Z`, "Redo"],
  ["[", "Fold the sidebar"],
  ["?", "This guide"],
  ["Esc", "Close a form"],
];

const SECTIONS: { id: string; title: string; tour?: string; body: ReactNode }[] = [
  {
    id: "flow", title: "How it's meant to be used",
    body: (
      <>
        <p>Zom's MRP answers two questions: <b>what can the fleet support</b>, and <b>is every job crewed</b>. The usual order:</p>
        <ol>
          <li><b>Set up once.</b> Add your aircraft by tail number, your pilots and maintainers with the types they're rated on, and the training courses you track.</li>
          <li><b>Add each customer as a mission.</b> Pick its color, the training its crew need and its regular crew.</li>
          <li><b>Give it a season</b> for each stretch of dates it flies. Add the aircraft when they're known, how many pilots and maintainers it needs at any time, and its rotation (like 14 on, 7 off).</li>
          <li><b>Fill the schedule.</b> Zom's MRP rotates rated, current, free people through the season. Fix what's left by hand.</li>
          <li><b>Check the overview each day.</b> It lists every gap and conflict. Tap one to fix it.</li>
          <li><b>When a customer calls</b>, use <b>Can we take a job?</b> on the Fleet page before saying yes.</li>
        </ol>
      </>
    ),
  },
  {
    id: "overview", title: "Overview", tour: "basics",
    body: <p>What's flying now and in the next 30 days, the fleet at a glance, and <b>Needs attention</b>: every problem Zom's MRP finds, worst first. Tap a problem to open what needs fixing. The number beside Overview in the sidebar is how many there are.</p>,
  },
  {
    id: "fleet", title: "Fleet", tour: "new-job",
    body: (
      <>
        <p>Every tail over time, grouped by type. Colored bars are missions, green dashed blocks are free windows (counted from today), and a thin row under each tail holds its maintenance. The row at the top counts how many aircraft are free each day.</p>
        <p><b>Can we take a job?</b> takes dates, an aircraft type, pilots on board and any training, and answers tail by tail: <i>Can do</i>, <i>Short crew</i> or <i>Can't</i>, with the reason and the first day a busy tail is free. <b>Book on…</b> starts the mission with it all filled in. Tap a free window on the board to book that window.</p>
      </>
    ),
  },
  {
    id: "missions", title: "Missions and seasons", tour: "crew",
    body: (
      <>
        <p>A <b>mission</b> is one customer's kind of work, like “Interior Fire Service”. It keeps what stays the same: the contact, its color and pattern on the schedule, the <b>training</b> its crew need and its <b>crew</b> (the people who rotate through it). Names don't need a year; that's what seasons are for.</p>
        <p>A <b>season</b> is one stretch of dates: its aircraft (any number, added whenever they're known), the pilots and maintainers needed at any time across them, and a <b>pilot rotation</b> and <b>maintainer rotation</b> that can differ. Its status runs Planned, Confirmed, Flying, Done. <b>Copy to next season</b> books next year's dates with the same setup.</p>
        <p>A season's form has tabs. <b>Pilots</b> and <b>Maintainers</b> show how much is crewed, then one line per shift with open seats in date order. A red dot on a tab means something there needs a look.</p>
      </>
    ),
  },
  {
    id: "rotations", title: "Rotations and filling the schedule", tour: "crew",
    body: (
      <>
        <p><b>Fill the schedule</b> walks through the season's open days and puts people on in stretches of the job's “on” days. It only picks someone who is:</p>
        <ul>
          <li>rated on one of the season's aircraft types,</li>
          <li>current on the mission's training for the whole stretch,</li>
          <li>not booked elsewhere and not on time off,</li>
          <li>on their own rotation, if they have one, and rested for the job's “off” days.</li>
        </ul>
        <p>The mission's own crew go first, then whoever has worked least. Days nobody can cover stay open, so you see them. <b>Start over</b> clears that role's shifts and fills again.</p>
        <p>A person can also have a <b>fixed rotation</b> of their own (Crew › person › Details), like 21 on, 14 off from a first day. They're only offered on their on days, their off days are shaded on the schedule, and booking them on one is flagged.</p>
      </>
    ),
  },
  {
    id: "schedule", title: "Schedule", tour: "gaps",
    body: (
      <>
        <p>The plan as a Gantt chart, with rows by <b>Aircraft</b>, <b>Missions</b> (each with its crew under it) or <b>Crew</b>. Pick a mission from the list to see only its work.</p>
        <p>The crew view starts with <b>Open seats</b>: red dashed slots for every job that's short. With a mission picked, it shows the people on it, then the people who are rated and current but not on it yet.</p>
        <p>{mod} + scroll or pinch to zoom from a week to a year. Drag, Shift + scroll or swipe sideways to move through time. The line marks the start of today.</p>
      </>
    ),
  },
  {
    id: "crew", title: "Crew",
    body: <p>Pilots and maintainers, with <b>Details</b> (base, phone, their own rotation, time off), <b>Ratings and missions</b> (the aircraft types they can work, and the missions they're on), and <b>Training</b> (one line per course, with when it runs out). Time off has its own tab on the Crew page; nobody is offered for a shift while they're off.</p>,
  },
  {
    id: "training", title: "Training", tour: "training",
    body: <p>Each mission sets the training its crew need, so people only need the courses of the missions they work or are booked on. <b>Who's current</b> shows everyone against every course they need: current, runs out soon, or lapsed. Narrow it to one mission's crew. Warnings start the number of days set in Settings before a course runs out, and any shift where training would lapse mid-hitch is flagged.</p>,
  },
  {
    id: "maintenance", title: "Maintenance", tour: "maintenance",
    body: <p>Inspections and repairs on a tail, with the maintainers working on them. Tick <b>The aircraft can't fly during this job</b> to ground it: it's then not free on the Fleet page, and any mission booked on it is flagged.</p>,
  },
  {
    id: "checks", title: "What Zom's MRP checks",
    body: (
      <ul>
        <li>Open pilot seats, and maintainers missing on call</li>
        <li>People or aircraft booked twice, or booked during time off or maintenance</li>
        <li>Confirmed jobs with no aircraft, and aircraft that are grounded or retired</li>
        <li>More pilots booked than the aircraft have seats</li>
        <li>People on a type they aren't rated on, or booked on their own days off</li>
        <li>Training that's missing, has run out, or runs out during a hitch</li>
        <li>Hitches longer than the limit, or too few days off between them (Settings › Hitches and days off)</li>
      </ul>
    ),
  },
  {
    id: "reports", title: "Reports and Excel",
    body: <p>Pick a period to see fleet use, days per mission, how busy each person is and how much of the flying was fully crewed. <b>Export to Excel</b> makes one workbook (fleet board, seasons, crew, training, maintenance, problems) to post in Teams. The desktop app can also keep an Excel copy up to date in a folder you pick, such as a Teams channel's synced folder (Settings › Excel copy for Teams).</p>,
  },
  {
    id: "data", title: "Your data",
    body: (
      <>
        <p>
          {isServerBuild ? "On the server, everyone signs in to the same plan. Admins add people as Admin, Scheduler (changes the plan) or Viewer (looks only). If two people save at once, the second is told and nothing is overwritten. The server keeps a copy every day."
            : "The desktop app keeps the plan in a file on this computer and a copy every day for a month. Settings › Your data makes a backup file you can restore anywhere."}
        </p>
        <p>The demo data is kept apart from your own. Switch it on or off in Settings › Demo data. To start fresh with real data, use <b>Settings › Your data › Clear all data</b>.</p>
      </>
    ),
  },
];

/** How every part works and how it's meant to be used, with walkthroughs of the demo. */
export function Guide() {
  const start = useTour((s) => s.start);
  const demo = useStore((s) => s.demo);
  return (
    <div className="guide">
      <div className="page-head"><h1>Guide</h1></div>

      <h2 style={{ marginTop: 0 }}>Walkthroughs</h2>
      <p className="muted" style={{ marginTop: -4 }}>
        Each one runs over the demo data and shows one thing at a time. {demo || isOnlineDemo ? "Nothing is saved unless you save it." : "Starting one switches to the demo; your own data is kept apart."}
      </p>
      <div className="tour-cards">
        {TOURS.map((t) => (
          <button key={t.id} className="tour-pick" onClick={() => start(t.id)}>
            <span className="row gap-sm"><PlayCircle size={18} className="accent" /><b className="grow">{t.title}</b><span className="small muted row" style={{ gap: 4 }}><Clock size={12} /> {t.minutes} min</span></span>
            <span className="small muted">{t.summary}</span>
          </button>
        ))}
      </div>

      <nav className="guide-toc" aria-label="Contents">
        {SECTIONS.map((s) => <a key={s.id} href={`#guide-${s.id}`} onClick={(e) => { e.preventDefault(); document.getElementById(`guide-${s.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>{s.title}</a>)}
        <a href="#guide-shortcuts" onClick={(e) => { e.preventDefault(); document.getElementById("guide-shortcuts")?.scrollIntoView({ behavior: "smooth" }); }}>Shortcuts</a>
      </nav>

      {SECTIONS.map((s) => (
        <section key={s.id} id={`guide-${s.id}`} className="guide-section">
          <div className="row gap-sm wrap">
            <h2 className="grow">{s.title}</h2>
            {s.tour && <button className="btn sm" onClick={() => start(s.tour!)}><PlayCircle size={14} /> Show me</button>}
          </div>
          {s.body}
        </section>
      ))}

      <section id="guide-shortcuts" className="guide-section kbd-hint">
        <h2>Shortcuts</h2>
        <table className="table" style={{ boxShadow: "none" }}>
          <tbody>{SHORTCUTS.map(([k, d]) => <tr key={k} style={{ cursor: "default" }}><td style={{ width: 150 }}><kbd>{k}</kbd></td><td>{d}</td></tr>)}</tbody>
        </table>
      </section>
    </div>
  );
}
