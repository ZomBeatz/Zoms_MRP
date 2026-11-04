import type { ReactNode } from "react";
import { CheckCircle2, Clock, PlayCircle } from "lucide-react";
import { LESSONS, TOURS, useTour, type Tour } from "../tour";
import { useStore } from "../store";
import { isDesktopApp, isOnlineDemo, isServerBuild, withDemo } from "../platform";

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
  [`${mod} K`, "Find anything by name"],
  ["Esc", "Close a form (it asks first if you've changed something)"],
];

/** Everyday jobs, as short step lists. Keep the names of buttons and tabs exactly as they are in the app. */
const RECIPES: { q: string; steps: ReactNode[] }[] = [
  {
    q: "A customer wants more days",
    steps: [
      <>Go to <b>Missions</b> and tap the mission.</>,
      <>Open the <b>Seasons</b> tab and tap the season.</>,
      <>On <b>Details</b>, change the <b>Last day</b> (or First day).</>,
      <>Go to <b>Pilots</b> and press <b>Fill the schedule</b> to crew the new days. Do the same on <b>Maintainers</b>.</>,
      <>Press <b>Save</b>.</>,
    ],
  },
  {
    q: "Move a shift's first or last day",
    steps: [
      <>On the <b>Schedule</b>, find the shift (the <b>Crew</b> view is handiest) and grab either end: the cursor turns into ↔.</>,
      <>Drag left or right. The new day shows above the bar; let go to keep it (Undo is in the message).</>,
      <>Where someone takes over from them (⇄ on the bar), their replacement's first day moves with it, so the seat stays covered. Hold <b>Alt</b> (<b>Option</b> on a Mac) to move just the one.</>,
    ],
  },
  {
    q: "Swap one pilot for another",
    steps: [
      <>Open the season: tap its bar on the <b>Schedule</b>, or go through <b>Missions</b> › the mission › <b>Seasons</b>.</>,
      <>Go to the <b>Pilots</b> tab and tap the shift you want to change.</>,
      <>Pick the other person. The list says who isn't rated, current or free.</>,
      <>Change the days too if only part of the shift moves, then press <b>Done</b> and <b>Save</b>.</>,
    ],
  },
  {
    q: "Someone is sick or on leave",
    steps: [
      <>Go to <b>Crew</b> and press <b>Add time off</b>.</>,
      <>Pick who, the first and last day, and a reason. Press <b>Add time off</b>.</>,
      <>Any shift they had on those days now shows under <b>Needs attention</b> on the <b>Overview</b>. Press <b>Swap them out</b> on it: the shift opens, ready to pick someone else.</>,
    ],
  },
  {
    q: "An aircraft breaks down",
    steps: [
      <>Go to <b>Maintenance</b> and press <b>New job</b>.</>,
      <>Name it, pick the tail and the days it will be down.</>,
      <>Tick <b>The aircraft can't fly during this job</b> and save.</>,
      <>Any mission booked on it shows on the <b>Overview</b>. Open it, and on the season's <b>Details</b> take that tail off and add a free one. The <b>Fleet</b> page shows which tails are free.</>,
    ],
  },
  {
    q: "Someone finished or renewed a course",
    steps: [
      <>Go to <b>Training</b> and tap the person (or <b>Crew</b> › the person).</>,
      <>Open their <b>Training</b> tab and tap the course. If it isn't there, press <b>Add training</b>.</>,
      <>Set <b>Completed</b> to the day they did it. <b>Runs out</b> moves on by itself.</>,
      <>Press <b>Done</b>, then <b>Save</b>.</>,
    ],
  },
  {
    q: "Book the same job again next year",
    steps: [
      <>Go to <b>Missions</b> and tap the mission.</>,
      <>On the <b>Seasons</b> tab press <b>Copy to next season</b>. It copies the dates a year on, with the same aircraft, crew numbers and rotation.</>,
      <>The new season opens by itself. Change anything that's different, crew it on <b>Pilots</b> with <b>Fill the schedule</b>, and press <b>Save</b>.</>,
    ],
  },
  {
    q: "Add someone to a mission's regular crew",
    steps: [
      <>Go to <b>Missions</b>, tap the mission and open the <b>Crew</b> tab.</>,
      <>Tap their name under <b>Could join</b> to tick it, and press <b>Save</b>.</>,
      <>They now get first pick when the schedule is filled, and they need the mission's training.</>,
    ],
  },
  {
    q: "Find who can cover some dates",
    steps: [
      <>Go to <b>Schedule</b> and pick <b>Crew</b> at the top.</>,
      <>Pick the mission in the list. Under its own crew you'll see the people who are rated and current but not on it yet, with their days already booked.</>,
    ],
  },
  {
    q: "Plan an inspection and put maintainers on it",
    steps: [
      <>Go to <b>Maintenance</b> and press <b>New job</b>.</>,
      <>Name it, like <b>100 hour inspection</b>, pick the aircraft and the first and last day.</>,
      <>Under <b>Who's doing it</b>, tap the maintainers. Free ones rated on that aircraft come first; <b>Busy</b>, <b>Off</b> or <b>Not rated</b> says why someone else isn't a good pick.</>,
      <>Leave <b>The aircraft can't fly during this job</b> ticked if it's grounded meanwhile, then <b>Save</b>. When it's done, open it and tick <b>Finished</b>.</>,
    ],
  },
  {
    q: "Someone can't get back for a renewal",
    steps: [
      <>On the training problem, press <b>Extend it</b> (or open the person, <b>Training</b>, and their course).</>,
      <>Tick <b>Extend it</b>, pick the day it counts as current until, and write why, like <b>On the North Slope job until June</b>.</>,
      <>It counts as current until then, shows <b>Extended</b> with the reason, and the problem goes away. Only use it where your operation allows.</>,
      <>For any other problem you've decided to live with, press <b>Ignore…</b> and say why. <b>Show ignored</b> under the list brings it back.</>,
    ],
  },
  {
    q: "Plan inspections from the maintenance manual",
    steps: [
      <>Go to <b>Inspections</b>, then <b>Programs</b>. For each aircraft type, add its inspections: every so many flight hours and/or months, how many days it takes, and whether it grounds the aircraft.</>,
      <>Under <b>Flight hours</b>, type each tail's hours when you have them. In between, Zom's MRP adds mission days × hours per flying day.</>,
      <>Under <b>Due</b>, press <b>Record last done…</b> where there's no record yet. Then each tail shows when it's due, and <b>Plan it…</b> books it in the latest free days before then.</>,
      <>To have that happen on its own, tick <b>Plan inspections automatically</b> in <b>Settings › Maintenance programs</b>. If another system already does all this, turn it off there.</>,
    ],
  },
  {
    q: "See if we can do it with fewer people",
    steps: [
      <>Go to <b>Balance</b> and pick the period.</>,
      <>Under <b>Jobs in this period</b>, change a job's <b>Pilots</b> or <b>Maintainers</b>, say from 2 to 1. Nothing is saved yet.</>,
      <>Lock any job or person that should stay as it is, then press <b>Rebalance</b>. The numbers at the top show before and after: open seat-days, conflicts and the busiest person. Each person's bar shows their share of the days they can work, with a line where they are now.</>,
      <>Press <b>Apply</b> to keep it (Undo is in the message), or <b>Undo the changes here</b> to drop it. Time off, ratings, training, rotations and rest are always followed.</>,
    ],
  },
  {
    q: "Share the plan with the team",
    steps: [
      <>On <b>Reports</b>, pick the period: one of the ready-made ones, or <b>Pick dates</b> for your own first and last day.</>,
      <>Press <b>PDF report</b> for pages to email, print or put on a screen, or <b>Excel report</b> for a workbook to post in Teams.</>,
      <>For the whole plan in one workbook, use <b>Settings › Your data › Export to Excel</b>.</>,
    ],
  },
  {
    q: "Get around on a phone",
    steps: [
      <>The <b>☰</b> button at the top left opens the menu of pages. The <b>+</b> at the top right starts a new mission.</>,
      <>Charts are wider than a phone: swipe them sideways to move through time and pinch to zoom.</>,
      <>Forms open full screen. Their tabs are along the top, <b>Save</b> and <b>Cancel</b> along the bottom. The phone's back button closes a form without saving.</>,
    ],
  },
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
          <li><b>Give it a season</b> for each stretch of dates it flies. Add the aircraft when they're known, how many pilots and maintainers it needs at a time, when it needs maintainers (all the time, some days a week, at the start and end, or on call), and its rotation (like 14 on, 7 off).</li>
          <li><b>Fill the schedule.</b> Zom's MRP rotates rated, current, free people through the season. Fix what's left by hand.</li>
          <li><b>Check the overview each day.</b> It lists every gap and conflict, each with a button that takes you to the fix.</li>
          <li><b>When a customer calls</b>, use <b>Can we take a job?</b> on the Fleet page before saying yes.</li>
        </ol>
      </>
    ),
  },
  {
    id: "setup", title: "Set up your own operation", tour: "add-mission",
    body: <Setup />,
  },
  {
    id: "howto", title: "How do I…",
    body: (
      <>
        <p>The everyday jobs, step by step. Tap one to open it.</p>
        <div className="recipes">
          {RECIPES.map((r) => (
            <details key={r.q} className="recipe">
              <summary>{r.q}</summary>
              <ol>{r.steps.map((x, i) => <li key={i}>{x}</li>)}</ol>
            </details>
          ))}
        </div>
      </>
    ),
  },
  {
    id: "colors", title: "What the colors mean",
    body: (
      <ul className="color-key">
        <li><span className="pill ok">Green</span> All good: ready, crewed, current.</li>
        <li><span className="pill warn">Amber</span> Look soon: training runs out soon, or a job is missing something it will need.</li>
        <li><span className="pill danger">Red</span> Fix it: an open seat, someone booked twice, training that ran out, a grounded aircraft that's booked.</li>
        <li><span className="pill accent">Blue</span> Planned, not confirmed yet. Blue buttons are the next thing to press.</li>
        <li><span className="swatch-dash free" /> Green dashed block: an aircraft that's free. Tap it to book that window.</li>
        <li><span className="swatch-dash open" /> Red dashed block: an open seat a job still needs filled.</li>
        <li>Each mission has its own color and pattern on the charts, so you can tell them apart even printed in grey. The list under each chart says which is which.</li>
        <li>The colored line down a chart is the start of today.</li>
      </ul>
    ),
  },
  {
    id: "words", title: "Words used here",
    body: (
      <dl className="glossary">
        <dt>Tail</dt><dd>An aircraft, named by its tail number, like N412ZM.</dd>
        <dt>Type</dt><dd>The kind of aircraft, like Bell 412. People are <b>rated</b> on types.</dd>
        <dt>Rated</dt><dd>Allowed to fly or work on a type of aircraft.</dd>
        <dt>Mission</dt><dd>One customer's kind of work, like “Interior Fire Service”.</dd>
        <dt>Season</dt><dd>One stretch of dates a mission flies, like May 15 to Sep 15.</dd>
        <dt>Shift</dt><dd>One person on a season for some days in a row.</dd>
        <dt>Hitch</dt><dd>The days someone works in a row before time off. Several shifts back to back count as one hitch.</dd>
        <dt>Rotation</dt><dd>A repeating pattern of days on and days off, like 14 on, 7 off.</dd>
        <dt>Open seat</dt><dd>A day a job needs one more pilot or maintainer than it has.</dd>
        <dt>Current</dt><dd>Training that hasn't run out yet.</dd>
        <dt>Grounded</dt><dd>An aircraft that can't fly, usually because of maintenance.</dd>
      </dl>
    ),
  },
  {
    id: "mistakes", title: "Mistakes are easy to undo",
    body: (
      <ul>
        <li>Nothing in a form is kept until you press <b>Save</b>. <b>Cancel</b> or the back button leaves everything as it was.</li>
        <li>If Save can't save yet, it tells you what's missing, like a name or a date.</li>
        <li><b>Delete</b> asks once more before it deletes. After you add or delete something, the message at the bottom has an <b>Undo</b> button. {mod} Z undoes any change.</li>
        <li>On a phone, the back button closes the form you're in, then goes back to the page before.</li>
        {withDemo && <li>In the demo, try anything. <b>Reset demo</b> puts it all back.</li>}
      </ul>
    ),
  },
  {
    id: "overview", title: "Overview", tour: "basics",
    body: <p>What's flying now and in the next 30 days, the fleet at a glance, and <b>Needs attention</b>: every problem Zom's MRP finds, worst first. Each has a button for the usual fix, like <b>Add a pilot</b>, <b>Record the training</b> or <b>Add the rating</b>, and sometimes another way out. It opens the right form on the right tab and outlines in red what to change. When nobody can take an open seat, the season says why for the people closest to it, with a button to fix each one. The number beside Overview in the sidebar is how many problems there are.</p>,
  },
  {
    id: "fleet", title: "Fleet", tour: "call",
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
        <p>A <b>season</b> is one stretch of dates: its aircraft (any number, added whenever they're known), the pilots and maintainers needed at a time across them, when maintainers are needed (<b>All the time</b>, <b>Days a week</b>, <b>Start and end</b> for set-up and tear-down, or <b>On call</b>, which is never a gap), and a <b>pilot rotation</b> and <b>maintainer rotation</b> that can differ. Its status runs Planned, Confirmed, Flying, Done. <b>Copy to next season</b> books next year's dates with the same setup.</p>
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
    id: "inspections", title: "Inspections",
    body: <p>Each aircraft type's maintenance program: its inspections every so many flight hours and/or months, whichever comes first. A job on the tail with the same name counts as doing it. <b>Due</b> lists every tail's inspections with when they were last done and when they're due; <b>Plan it…</b> books one in the latest free days before it's due. <b>Flight hours</b> takes readings, and between them counts mission days × hours per flying day. Overdue and due-soon inspections show under Needs attention. Turn it all off, or have it plan by itself, in <b>Settings › Maintenance programs</b>.</p>,
  },
  {
    id: "limits", title: "Work limits",
    body: <p>Settings › Hitches and days off sets the rule for everyone. A person, a mission and a season can each have <b>Own limits</b> under Work limits; the safest wins (the fewest days on, the most days off). A season can tick <b>Override</b> to use its own numbers instead of the mission's and Settings', but a person's own limits always apply to them. The checks, Fill the schedule and Rebalance all follow them.</p>,
  },
  {
    id: "balance", title: "Balance",
    body: <p>How busy everyone is over a period, and a way to make the most of them. Each person's bar is the share of the days they can work (time off doesn't count) that they're booked: red is very busy, green busy, blue light, grey hardly used. Try other crew sizes for a job, lock jobs or people that should stay as they are, and press <b>Rebalance</b>. It keeps the shifts that are there, fills open seats and starts over for jobs whose size you changed (or for every job, with <b>Start over for every job</b>), on the same rules as Fill the schedule. Before and after numbers show what it changes; nothing is saved until <b>Apply</b>.</p>,
  },
  {
    id: "reports", title: "Reports and Excel",
    body: <p>Pick a period (or <b>Pick dates</b> for your own) to see fleet use, days per mission, how busy each person is and how much of the flying was fully crewed. <b>PDF report</b> and <b>Excel report</b> make the same period into pages that are easy to read: the numbers and charts, the fleet and crew boards colored like the app, the missions, workload, a training grid, maintenance and problems. <b>Settings › Your data › Export to Excel</b> makes one workbook of the whole plan. The desktop app can also keep an Excel copy up to date in a folder you pick, such as a Teams channel's synced folder (Settings › Excel copy for Teams).</p>,
  },
  {
    id: "data", title: "Your data",
    body: (
      <>
        <p>
          {isServerBuild ? "On the server, everyone signs in to the same plan. Admins add people as Admin, Scheduler (changes the plan) or Viewer (looks only). If two people save at once, the second is told and nothing is overwritten. The server keeps a copy every day."
            : isDesktopApp || !withDemo
              ? `${isDesktopApp ? "The desktop app keeps the plan in a file on this computer and a copy every day for a month." : "The plan is kept in this browser, on this device."} Settings › Your data makes a backup file you can restore anywhere.`
              : "The demo is kept in this browser, apart from anything else."}
        </p>
        {withDemo && !isOnlineDemo && <p>The demo data is kept apart from your own. Switch it on or off in Settings › Demo data, where <b>Remove demo data</b> takes it off this device.</p>}
        <p>To start over with nothing, use <b>Settings › Your data › Clear all data</b>.</p>
      </>
    ),
  },
];

function TourCards({ tours, onStart, numbered }: { tours: Tour[]; onStart: (id: string) => void; numbered?: boolean }) {
  const done = useTour((s) => s.done);
  // The first one not done yet is next up.
  const nextUp = numbered ? tours.find((t) => !done[t.id])?.id : undefined;
  return (
    <div className="tour-cards">
      {tours.map((t, i) => (
        <button key={t.id} className={`tour-pick ${done[t.id] ? "done" : ""} ${nextUp === t.id ? "next" : ""}`} onClick={() => onStart(t.id)}>
          <span className="row gap-sm">
            {done[t.id] ? <CheckCircle2 size={18} className="ok" /> : numbered ? <span className="lesson-no">{i + 1}</span> : <PlayCircle size={18} className="accent" />}
            <b className="grow">{t.title}</b>
            <span className="small muted row" style={{ gap: 4 }}><Clock size={12} /> {t.minutes} min</span>
          </span>
          <span className="small muted">{t.summary}</span>
          {done[t.id] ? <span className="small ok-text">Done. Tap to do it again.</span> : nextUp === t.id ? <span className="small accent-text">Next up</span> : null}
        </button>
      ))}
    </div>
  );
}

/** The order to add things in, with a button for each. */
export function Setup() {
  const { data, demo, open, setDemo } = useStore();
  const steps: { done: boolean; text: ReactNode; action: string; run: () => void }[] = [
    { done: data.aircraft.length > 0, text: <><b>Add your aircraft</b> by tail number, with their type and pilot seats.</>, action: "Add aircraft…", run: () => open("aircraft", "new") },
    { done: data.trainings.length > 0, text: <><b>Add the training courses</b> you track, and how often each is renewed.</>, action: "Add training…", run: () => open("training", "new") },
    { done: data.people.some((p) => p.role === "Pilot"), text: <><b>Add your pilots</b> with the types they're rated on, their training dates, and their own rotation if they have one.</>, action: "Add pilot…", run: () => open("person", "new", { role: "Pilot" }) },
    { done: data.people.some((p) => p.role === "Maintainer"), text: <><b>Add your maintainers</b> the same way.</>, action: "Add maintainer…", run: () => open("person", "new", { role: "Maintainer" }) },
    { done: data.missions.length > 0, text: <><b>Add each customer as a mission</b>, with its first season, the training it needs and its regular crew.</>, action: "New mission…", run: () => open("mission", "new") },
    { done: data.shifts.length > 0, text: <><b>Crew each season:</b> open it, go to Pilots, and press Fill the schedule.</>, action: "Go to Missions", run: () => useStore.getState().go("missions") },
  ];
  if (demo)
    return (
      <p>
        You're looking at the demo now. To set up your own, switch to your own data first; the demo stays as it is.{" "}
        {!isOnlineDemo && <button className="btn sm" onClick={() => setDemo(false)}>Use my own data</button>}
      </p>
    );
  return (
    <>
      <p>Add things in this order, so each step has what it needs. Ticked steps are done.</p>
      <ol className="setup">
        {steps.map((s, i) => (
          <li key={i} className={s.done ? "done" : ""}>
            <span className="grow">{s.text}</span>
            <button className={`btn sm ${!s.done && steps.slice(0, i).every((x) => x.done) ? "primary" : ""}`} onClick={s.run}>{s.action}</button>
          </li>
        ))}
      </ol>
    </>
  );
}

/** How every part works and how it's meant to be used, with walkthroughs where there's a demo to run them on. */
export function Guide() {
  const start = useTour((s) => s.start);
  const demo = useStore((s) => s.demo);
  return (
    <div className="guide">
      <div className="page-head"><h1>Guide</h1></div>

      {withDemo ? (
        <>
          <h2 style={{ marginTop: 0 }}>Learn it step by step</h2>
          <p className="muted" style={{ marginTop: -4 }}>
            Short lessons you do yourself on the demo, a few minutes each. Every step says what to tap and moves on when you've done it; <b>Do it for me</b> does it for you.
            Each lesson starts from a fresh copy of the demo and puts it back when it's over, so try anything. Take a break between lessons any time: finished ones are ticked off here.
            {demo || isOnlineDemo ? "" : " Starting one switches to the demo, and you're back on your own data when it ends. Your data isn't touched."}
          </p>
          <TourCards tours={LESSONS} onStart={start} numbered />

          <h2>Look around</h2>
          <p className="muted" style={{ marginTop: -4 }}>Tours that point at one thing at a time and explain it. You can scroll and tap the page while they run.</p>
          <TourCards tours={TOURS} onStart={start} />
        </>
      ) : (
        <p className="muted" style={{ marginTop: 0 }}>How Zom's MRP works, and how to do the everyday jobs. Tap a topic to jump to it.</p>
      )}

      <nav className="guide-toc" aria-label="Contents">
        {SECTIONS.map((s) => <a key={s.id} href={`#guide-${s.id}`} onClick={(e) => { e.preventDefault(); document.getElementById(`guide-${s.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>{s.title}</a>)}
        <a href="#guide-shortcuts" className="kbd-hint" onClick={(e) => { e.preventDefault(); document.getElementById("guide-shortcuts")?.scrollIntoView({ behavior: "smooth" }); }}>Shortcuts</a>
      </nav>

      {SECTIONS.map((s) => (
        <section key={s.id} id={`guide-${s.id}`} className="guide-section">
          <div className="row gap-sm wrap">
            <h2 className="grow">{s.title}</h2>
            {s.tour && withDemo && <button className="btn sm" onClick={() => start(s.tour!)}><PlayCircle size={14} /> Show me</button>}
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
