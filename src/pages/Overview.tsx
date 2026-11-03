import { useMemo } from "react";
import { AlertTriangle, BookOpen, CheckCircle2, CircleAlert, Plane, SearchCheck, Users, Wrench } from "lucide-react";
import { bookings } from "../bookings";
import { useStore } from "../store";
import { missionCoverage, type Issue } from "../coverage";
import { format } from "date-fns";
import { dayAt, fmtRange, ms, overlaps, plural, today } from "../time";
import { missionLook, slotStyle } from "../look";
import { StatusPill } from "../components/ui";
import { fleetUse } from "../fleet";
import { seasonTails } from "../rotation";

/** Open whatever an issue is about, so it can be fixed in one click. */
export function useOpenIssue() {
  const open = useStore((s) => s.open);
  return (i: Issue) => {
    if (i.seasonId) open("season", i.seasonId);
    else if (i.jobId) open("job", i.jobId);
    else if (i.personId) open("person", i.personId);
    else if (i.aircraftId) open("aircraft", i.aircraftId);
  };
}

export function IssueList({ issues, limit }: { issues: Issue[]; limit?: number }) {
  const openIssue = useOpenIssue();
  if (!issues.length)
    return (
      <div className="issue">
        <CheckCircle2 size={16} style={{ color: "var(--zb-ok)" }} />
        <span>Everything is covered. No conflicts found.</span>
      </div>
    );
  return (
    <div className="issues">
      {issues.slice(0, limit).map((i) => (
        <button key={i.id} className={`issue ${i.severity}`} onClick={() => openIssue(i)}>
          {i.severity === "danger" ? <CircleAlert size={16} aria-label="Problem" /> : <AlertTriangle size={16} aria-label="Warning" />}
          <span className="grow">
            <b>{i.title}</b>
            <div className="small muted">{i.detail}</div>
          </span>
          <span className={`pill ${i.severity}`}>{i.severity === "danger" ? "Problem" : "Check"}</span>
        </button>
      ))}
      {limit && issues.length > limit && <div className="small muted">And {plural(issues.length - limit, "more")}.</div>}
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
    const ready = data.aircraft.filter((a) => a.status === "Ready").length;
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
      {!data.aircraft.length && !data.missions.length && <GettingStarted />}
      <div className="tiles">
        <button className="tile" onClick={() => go("missions")}>
          <div className="label"><Plane size={14} /> Missions now or in the next 30 days</div>
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
          <div className="label"><Wrench size={14} /> Aircraft ready</div>
          <div className="value">{stats.ready} <span className="muted small">of {data.aircraft.filter((a) => a.status !== "Retired").length}</span></div>
        </button>
        <button className="tile" onClick={() => go("people")}>
          <div className="label"><Users size={14} /> On duty now</div>
          <div className="value">{stats.onDuty}</div>
        </button>
      </div>

      <h2>Fleet, next 30 days</h2>
      <FleetNow />

      <h2>Needs attention</h2>
      <IssueList issues={issues} limit={10} />

      <h2>Coming up</h2>
      {upcoming.length === 0 ? (
        <div className="panel muted">No missions coming up.</div>
      ) : (
        <div className="issues">
          {upcoming.map((m) => {
            const cov = missionCoverage(data, m);
            const pct = Math.round(cov.covered * 100);
            const look = missionLook(m);
            return (
              <button key={m.id} className="issue" onClick={() => open("season", m.id)}>
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
                {now.kind === "mission" ? <>On <b>{now.mission.name}</b></> : now.kind === "maintenance" ? <>In maintenance ({now.job.title})</> : now.kind === "down" ? "Grounded" : <b style={{ color: "var(--zb-ok)" }}>Free today</b>}
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

/** With nothing set up yet, say where to begin instead of showing empty numbers. */
function GettingStarted() {
  const { go, demo, setDemo } = useStore();
  const toSetup = () => {
    go("guide");
    setTimeout(() => document.getElementById("guide-setup")?.scrollIntoView({ block: "start" }), 300);
  };
  return (
    <section className="panel getting-started">
      <h3><BookOpen size={16} /> Getting started</h3>
      <p>Nothing is set up yet. The Guide lists what to add, in order, with a button for each step: aircraft, training, crew, then each customer as a mission.</p>
      <div className="row gap-sm wrap">
        <button className="btn primary" onClick={toSetup}>Set up step by step</button>
        {!demo && <button className="btn" onClick={() => setDemo(true)}>Look at the demo first</button>}
      </div>
    </section>
  );
}
