import { useMemo, useState } from "react";
import { AlertTriangle, BookOpen, Check, CheckCircle2, ClipboardCheck, CircleAlert, Plane, SearchCheck, Users, Wrench } from "lucide-react";
import { bookings } from "../bookings";
import { useStore } from "../store";
import { ignoredIssues, missionCoverage, type Issue } from "../coverage";
import { format } from "date-fns";
import { dayAt, fmtRange, ms, overlaps, today } from "../time";
import { missionLook, slotStyle } from "../look";
import { NumberInput, StatusPill } from "../components/ui";
import { fleetUse } from "../fleet";
import { seasonTails } from "../rotation";
import { withDemo } from "../platform";
import { Setup } from "./Guide";
import { fixesFor, type Fix } from "../fixes";
import { dueList } from "../program";
import type { Booking } from "../types";

/** Problems someone ignored, with why, and Restore to bring one back. */
export function IgnoredList() {
  const { data, change } = useStore();
  const [open, setOpen] = useState(false);
  const list = ignoredIssues(data);
  if (!list.length) return null;
  return (
    <div className="ignored">
      <button className="link" onClick={() => setOpen(!open)}>{open ? "Hide" : "Show"} {list.length} ignored {list.length === 1 ? "problem" : "problems"}</button>
      {open && (
        <div className="issues" style={{ marginTop: 8 }}>
          {list.map((x) => (
            <div key={x.id} className="issue-card row-card">
              <div className="issue">
                <span className="grow">
                  <b>{x.title}</b>
                  <div className="small muted">Ignored {format(new Date(`${x.on}T00:00`), "MMM d")}{x.note ? `: ${x.note}` : ""}</div>
                </span>
              </div>
              <button className="btn sm" onClick={() => change((d) => ({ ...d, ignored: d.ignored.filter((y) => y.id !== x.id) }), `Restored “${x.title}”`)}>Restore</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** One tap to confirm a planned season, with Undo in the message. */
export function ConfirmButton({ season }: { season: Pick<Booking, "id" | "name" | "start" | "end" | "status"> }) {
  const change = useStore((s) => s.change);
  if (season.status !== "Planned") return null;
  return (
    <button className="btn sm confirm" title="Mark it confirmed" onClick={(e) => {
      e.stopPropagation();
      change((d) => ({ ...d, seasons: d.seasons.map((x) => (x.id === season.id ? { ...x, status: "Confirmed" } : x)) }), `Confirmed “${season.name}”, ${fmtRange(season.start, season.end)}`);
    }}><Check size={14} /> Confirm</button>
  );
}

/** Open the form where a problem is fixed, on the right tab, pointing at what to change. */
export function useFix() {
  const open = useStore((s) => s.open);
  return (f: Fix) => open(f.kind, f.id, f.defaults, { tab: f.tab, spot: f.spot });
}

/**
 * Problems, each with a button for its usual fix and any other ways out. `onFix` lets a form handle
 * fixes inside itself (a season's own problems switch its tab instead of opening it again).
 */
export function IssueList({ issues, limit, onFix }: { issues: Issue[]; limit?: number; onFix?: (f: Fix) => boolean }) {
  const data = useStore((s) => s.data);
  const openFix = useFix();
  const [all, setAll] = useState(false);
  const shown = all ? undefined : limit;
  // Ignoring one: which, and why.
  const [ignoring, setIgnoring] = useState<string | null>(null);
  const [why, setWhy] = useState("");
  const change = useStore((s) => s.change);
  const ignore = (i: Issue) => {
    change((d) => ({ ...d, ignored: [...(d.ignored ?? []), { id: i.id, title: i.title, note: why.trim(), on: format(new Date(), "yyyy-MM-dd") }] }), `Ignored “${i.title}”`);
    setIgnoring(null);
    setWhy("");
  };
  const go = (f: Fix) => {
    if (!onFix?.(f)) openFix(f);
  };
  if (!issues.length)
    return (
      <div className="issue">
        <CheckCircle2 size={16} style={{ color: "var(--zb-ok)" }} />
        <span>Everything is covered. No conflicts found.</span>
      </div>
    );
  return (
    <div className="issues">
      {issues.slice(0, shown).map((i) => {
        const fixes = fixesFor(data, i);
        return (
          <div key={i.id} className={`issue-card ${i.severity}`}>
            <button className={`issue ${i.severity}`} onClick={() => fixes[0] && go(fixes[0])} title={fixes[0]?.label}>
              {i.severity === "danger" ? <CircleAlert size={16} aria-label="Problem" /> : <AlertTriangle size={16} aria-label="Warning" />}
              <span className="grow">
                <b>{i.title}</b>
                <div className="small muted">{i.detail}</div>
              </span>
              <span className={`pill ${i.severity}`}>{i.severity === "danger" ? "Problem" : "Check"}</span>
            </button>
            <div className="issue-fixes">
              {fixes.map((f, k) => <button key={k} className={`btn sm ${k === 0 ? "primary" : ""}`} onClick={() => go(f)}>{f.label}</button>)}
              {ignoring !== i.id && <button className="btn sm ghost" onClick={() => { setIgnoring(i.id); setWhy(""); }} title="Hide it from this list, with a reason">Ignore…</button>}
            </div>
            {ignoring === i.id && (
              <div className="ignore-row">
                <input value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Why? (optional, like: on a year-long job, renewal agreed for June)" aria-label="Why ignore it"
                  onKeyDown={(e) => { if (e.key === "Enter") ignore(i); if (e.key === "Escape") setIgnoring(null); }} />
                <button className="btn sm" onClick={() => ignore(i)}>Ignore it</button>
                <button className="btn sm ghost" onClick={() => setIgnoring(null)}>Cancel</button>
              </div>
            )}
          </div>
        );
      })}
      {shown && issues.length > shown && (
        <button className="btn sm" style={{ alignSelf: "flex-start" }} onClick={() => setAll(true)}>Show all {issues.length} problems</button>
      )}
    </div>
  );
}

export function Overview({ issues }: { issues: Issue[] }) {
  const { data, go, open } = useStore();
  const now = Date.now();
  const d0 = today().getTime();
  const weekEnd = dayAt(d0, 30);

  const stats = useMemo(() => {
    const live = bookings(data).filter((m) => m.status !== "Cancelled");
    const thisWeek = live.filter((m) => overlaps(ms(m.start), ms(m.end), d0, weekEnd));
    const gaps = issues.filter((i) => i.id.startsWith("pgap-")).length;
    const conflicts = issues.filter((i) => i.severity === "danger" && !i.id.startsWith("pgap-")).length;
    const ready = data.aircraft.filter((a) => a.status === "Airworthy").length;
    const onDuty = new Set(
      data.shifts.filter((s) => ms(s.start) <= now && ms(s.end) > now).map((s) => s.personId)
        .concat(data.jobs.filter((j) => !j.done && ms(j.start) <= now && ms(j.end) > now).flatMap((j) => j.maintainerIds)),
    ).size;
    return { thisWeek, gaps, conflicts, ready, onDuty };
  }, [data, issues, d0, weekEnd, now]);

  const upcoming = bookings(data)
    .filter((m) => m.status !== "Cancelled" && m.status !== "Done" && ms(m.end) > now)
    .sort((a, b) => ms(a.start) - ms(b.start))
    .slice(0, 8);

  return (
    <>
      <div className="page-head">
        <h1>Overview</h1>
        <button className="btn" onClick={() => go("schedule")}>Open schedule</button>
      </div>
      <FlightLimitQuestion />
      {!data.missions.length && (!withDemo || !data.aircraft.length) && <GettingStarted />}
      <div className="tiles">
        <button className="tile" onClick={() => go("missions")}>
          <div className="label"><Plane size={14} /> Jobs now or in the next 30 days</div>
          <div className="value">{stats.thisWeek.length}</div>
        </button>
        <div className="tile">
          <div className="label"><CircleAlert size={14} /> Coverage gaps</div>
          <div className={`value ${stats.gaps ? "danger" : "ok"}`}>{stats.gaps}</div>
        </div>
        <div className="tile">
          <div className="label"><AlertTriangle size={14} /> Conflicts</div>
          <div className={`value ${stats.conflicts ? "danger" : "ok"}`}>{stats.conflicts}</div>
        </div>
        <button className="tile" onClick={() => go("aircraft")}>
          <div className="label"><Wrench size={14} /> Aircraft airworthy</div>
          <div className="value">{stats.ready} <span className="muted small">of {data.aircraft.filter((a) => a.status !== "Retired").length}</span></div>
        </button>
        <button className="tile" onClick={() => go("people")}>
          <div className="label"><Users size={14} /> On duty now</div>
          <div className="value">{stats.onDuty}</div>
        </button>
        {data.settings.maintenance.enabled && data.programs.length > 0 && (() => {
          const due = dueList(data).filter((d) => d.state === "overdue" || d.state === "soon");
          const late = due.filter((d) => d.state === "overdue").length;
          return (
            <button className="tile" onClick={() => go("inspections")}>
              <div className="label"><ClipboardCheck size={14} /> Inspections due</div>
              <div className={`value ${late ? "danger" : due.length ? "warn" : ""}`}>{due.length}{late ? <small> {late} overdue</small> : null}</div>
            </button>
          );
        })()}
      </div>

      <h2>Fleet, next 30 days</h2>
      <FleetNow />

      <h2>Needs attention</h2>
      <IssueList issues={issues} limit={10} />
      <IgnoredList />

      <h2>Coming up</h2>
      {upcoming.length === 0 ? (
        <div className="panel muted">No jobs coming up.</div>
      ) : (
        <div className="issues">
          {upcoming.map((m) => {
            const cov = missionCoverage(data, m);
            const pct = Math.round(cov.covered * 100);
            const look = missionLook(m);
            return (
              <div key={m.id} className="issue-card row-card">
                <button className="issue" onClick={() => open("season", m.id)}>
                  <span className="swatch" style={{ ...slotStyle(look), marginTop: 2 }} />
                  <span className="grow">
                    <b>{m.name}</b>
                    <div className="small muted">
                      {fmtRange(m.start, m.end)} · {seasonTails(data, m, "No aircraft")}
                    </div>
                  </span>
                  <span className={`pill ${pct === 100 ? "ok" : "danger"}`}>{pct === 100 ? "Crewed" : `${pct}% crewed`}</span>
                  <StatusPill status={m.status} />
                </button>
                <ConfirmButton season={m} />
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

/** Each tail: what it's doing today, how booked it is over the next 30 days, and when it's next free. */
function FleetNow() {
  const { data, open } = useStore();
  const from = today().getTime();
  const fleet = useMemo(() => fleetUse(data, from, dayAt(from, 30)), [data, from]);
  if (!fleet.length) return <div className="panel muted">No aircraft yet.</div>;
  return (
    <>
      <div className="issues">
        {fleet.map((t) => {
          const now = t.days[0];
          const run = t.freeRuns[0];
          return (
            <button key={t.aircraft.id} className="issue fleet-row" onClick={() => open("aircraft", t.aircraft.id)}>
              <span className="tail">
                <b style={{ fontFamily: "var(--zb-font-mono)" }}>{t.aircraft.tail}</b> <span className="small muted">{t.aircraft.type}</span>
              </span>
              <span className="grow small">
                {now.kind === "mission" ? <>On <b>{now.mission.name}</b></> : now.kind === "maintenance" ? <>In maintenance ({now.job.title})</> : now.kind === "down" ? <b style={{ color: now.status === "AOG" ? "var(--zb-danger)" : undefined }}>{now.status}{t.aircraft.backOn && now.status !== "Retired" ? `, back ${format(new Date(`${t.aircraft.backOn}T00:00`), "MMM d")}` : ""}</b> : <b style={{ color: "var(--zb-ok)" }}>Free today</b>}
                <span className="muted">
                  {" · "}
                  {run ? (run[0] === from ? "free now" : `free from ${format(run[0], "MMM d")}`) : "booked all 30 days"}
                </span>
              </span>
              <span className="pill accent">{Math.round(t.use * 100)}% booked</span>
            </button>
          );
        })}
      </div>
      <div style={{ marginTop: 8 }}>
        <button className="btn sm" onClick={() => open("support", "new")}><SearchCheck size={14} /> Can we take a job?…</button>
      </div>
    </>
  );
}

/**
 * Asked once, at setup or after updating to the version that added it: do pilots have a flight-hour
 * limit? The answer goes in Settings › Hitches and days off, where it can be changed later.
 */
function FlightLimitQuestion() {
  const { data, demo, canEdit, updateSettings } = useStore();
  const [hours, setHours] = useState(100);
  const [days, setDays] = useState(30);
  const asked = data.settings.asked ?? [];
  if (demo || !canEdit || asked.includes("flightLimit") || data.settings.flightLimits.length > 0) return null;
  const answer = (limit: { hours: number; days: number } | null) =>
    updateSettings({ asked: [...asked, "flightLimit"], ...(limit ? { flightLimits: [limit] } : {}) });
  return (
    <section className="panel getting-started">
      <h3><Plane size={16} /> Do your pilots have a flight-hour limit?</h3>
      <p>Such as no more than 100 flight hours in any 30 days. With one set, the checks flag a pilot who would go over it, Fill the schedule and the Crew planner keep under it, and the planner works out how many pilots that takes.</p>
      <div className="row gap wrap" style={{ alignItems: "center" }}>
        <span className="row gap-sm" style={{ alignItems: "center" }}>
          <NumberInput aria-label="Most flight hours" min={1} max={1000} value={hours} onChange={setHours} style={{ width: 72 }} />
          <span className="small muted">hours in any</span>
          <NumberInput aria-label="Days" min={1} max={365} value={days} onChange={setDays} style={{ width: 64 }} />
          <span className="small muted">days</span>
        </span>
        <button className="btn primary" onClick={() => answer({ hours, days })}>Set this limit</button>
        <button className="btn" onClick={() => answer(null)}>No limit</button>
      </div>
      <p className="small muted" style={{ margin: "10px 0 0" }}>You can change it any time in Settings › Hitches and days off.</p>
    </section>
  );
}

/** With nothing set up yet, say where to begin instead of showing empty numbers. */
function GettingStarted() {
  const { go, demo, setDemo } = useStore();
  if (!withDemo)
    return (
      <section className="panel getting-started">
        <h3><BookOpen size={16} /> Getting started</h3>
        <Setup />
        <p className="small muted" style={{ margin: "10px 0 0" }}>
          The <button className="link" onClick={() => go("guide")}>Guide</button> explains each part and how to do everyday jobs.
        </p>
      </section>
    );
  const toSetup = () => {
    go("guide");
    setTimeout(() => document.getElementById("guide-setup")?.scrollIntoView({ block: "start" }), 300);
  };
  return (
    <section className="panel getting-started">
      <h3><BookOpen size={16} /> Getting started</h3>
      <p>Nothing is set up yet. The Guide lists what to add, in order, with a button for each step: aircraft, qualifications, crew, then each customer as a job.</p>
      <div className="row gap-sm wrap">
        <button className="btn primary" onClick={toSetup}>Set up step by step</button>
        {!demo && <button className="btn" onClick={() => setDemo(true)}>Look at the demo first</button>}
      </div>
    </section>
  );
}
