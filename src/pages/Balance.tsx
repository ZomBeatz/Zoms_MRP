import { useMemo, useState } from "react";
import { ArrowRight, Lock, LockOpen, RotateCcw, Scale, Wand2 } from "lucide-react";
import { useStore } from "../store";
import { balanceStats, rebalance, seasonsIn, type BalanceStats } from "../balance";
import { missionCoverage } from "../coverage";
import { dayAt, fmtDates, plural, toWhen, today } from "../time";
import { missionLook, slotStyle } from "../look";
import { seasonTails } from "../rotation";
import { Avatar, Empty, Stepper, usePref } from "../components/ui";
import type { AppData, Role } from "../types";

/**
 * Making the most of the crew: how busy everyone is over a period, what-if crew sizes for each job,
 * and Rebalance, which rebuilds the period's shifts on the usual rules with locked jobs and people left
 * alone. Nothing changes until Apply (which has Undo).
 */

const PERIODS = [
  { id: "30", label: "Next 30 days", days: 30 },
  { id: "90", label: "Next 90 days", days: 90 },
  { id: "182", label: "Next 6 months", days: 182 },
] as const;

/** How busy: over the top, about right, light, or hardly used. */
const tone = (share: number) => (share > 0.85 ? "over" : share >= 0.45 ? "good" : share >= 0.15 ? "light" : "idle");
const TONE_WORDS = { over: "Very busy", good: "Busy", light: "Light", idle: "Hardly used" } as const;

export function Balance() {
  const { data, change, open } = useStore();
  const [period, setPeriod] = usePref<string>("balance-period", "90");
  const days = PERIODS.find((p) => p.id === period)!.days;
  const from = dayAt(today(), 0), to = dayAt(today(), days);

  // What-if crew sizes (season id → numbers), a proposed plan, and what's locked.
  const [sizes, setSizes] = useState<Record<string, { pilots: number; maintainers: number }>>({});
  const [proposal, setProposal] = useState<AppData | null>(null);
  const [lockedJobs, setLockedJobs] = useState<Set<string>>(new Set());
  const [lockedPeople, setLockedPeople] = useState<Set<string>>(new Set());
  const [role, setRole] = usePref<Role>("balance-role", "Pilot");
  const [everything, setEverything] = useState(false);

  /** The plan with the what-if sizes, before rebalancing. */
  const draft: AppData = useMemo(() => ({
    ...data,
    seasons: data.seasons.map((s) => (sizes[s.id] ? { ...s, pilotsNeeded: sizes[s.id].pilots, maintainersNeeded: sizes[s.id].maintainers } : s)),
  }), [data, sizes]);
  const now = useMemo(() => balanceStats(data, from, to), [data, from, to]);
  const shown = proposal ?? draft;
  const next = useMemo(() => (proposal || Object.keys(sizes).length ? balanceStats(shown, from, to) : null), [shown, proposal, sizes, from, to]);
  const jobs = seasonsIn(shown, from, to);
  const changed = !!proposal || Object.keys(sizes).length > 0;

  const toggle = (set: Set<string>, id: string) => {
    const n = new Set(set);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  };
  const resize = (id: string, patch: Partial<{ pilots: number; maintainers: number }>) => {
    const s = data.seasons.find((x) => x.id === id)!;
    setSizes((all) => ({ ...all, [id]: { pilots: all[id]?.pilots ?? s.pilotsNeeded, maintainers: all[id]?.maintainers ?? s.maintainersNeeded, ...patch } }));
    setProposal(null);
  };
  // Jobs whose size changed start over; the rest keep their shifts and get their open seats filled.
  const run = () => setProposal(rebalance(draft, from, to, { seasons: lockedJobs, people: lockedPeople }, everything ? "all" : new Set(Object.keys(sizes))));
  const reset = () => { setSizes({}); setProposal(null); };
  const apply = () => {
    const plan = proposal ?? draft;
    change(() => plan, proposal ? "Applied the rebalanced plan" : "Applied the new crew sizes");
    reset();
  };
  const moved = proposal ? countChanges(data, proposal) : 0;

  if (!data.people.length || !data.seasons.length)
    return (
      <>
        <div className="page-head"><h1>Balance</h1></div>
        <Empty icon={<Scale size={28} />} text="Once there are jobs and crew, this shows how busy everyone is and can spread the work more evenly." />
      </>
    );

  return (
    <>
      <div className="page-head">
        <h1>Balance</h1>
        <div className="seg">
          {PERIODS.map((p) => <button key={p.id} className={period === p.id ? "active" : ""} onClick={() => { setPeriod(p.id); setProposal(null); }}>{p.label}</button>)}
        </div>
      </div>
      <p className="muted" style={{ marginTop: -8 }}>
        How busy everyone is from {fmtDates(toWhen(from), toWhen(to))}. Try other crew sizes, lock what should stay, then <b>Rebalance</b> to spread the work on the usual rules: ratings, qualifications, time off, rotations and rest. Nothing changes until you press <b>Apply</b>.
      </p>

      <Compare now={now} next={next} />

      <div className="balance-actions">
        <button className="btn primary" onClick={run}><Wand2 size={16} /> Rebalance</button>
        {changed && <button className="btn primary solid-ok" onClick={apply}>Apply{proposal ? ` (${plural(moved, "shift")} change)` : ""}</button>}
        {changed && <button className="btn" onClick={reset}><RotateCcw size={14} /> Undo the changes here</button>}
        <label className="check"><input type="checkbox" checked={everything} onChange={(e) => { setEverything(e.target.checked); setProposal(null); }} /> Start over for every job</label>
      </div>
      <p className="small muted" style={{ marginTop: 0 }}>
        {everything ? "Rebalance takes every unlocked shift in the period off and fills the jobs again from scratch, to spread the work evenly." : "Rebalance keeps the shifts that are there, fills the open seats, and starts over only for jobs whose crew size you changed."}
      </p>

      <h2>Jobs in this period</h2>
      <p className="small muted" style={{ marginTop: -6 }}>Change how many pilots or maintainers a job needs to see what it frees up. Lock a job to keep its shifts as they are.</p>
      <div className="balance-jobs">
        {jobs.map((b) => {
          const cov = missionCoverage(shown, b);
          const locked = lockedJobs.has(b.id);
          const what = sizes[b.id];
          return (
            <div key={b.id} className={`balance-job ${locked ? "locked" : ""}`}>
              <button className="balance-job-main" onClick={() => open("season", b.id)}>
                <span className="swatch" style={slotStyle(missionLook(b))} />
                <span className="grow">
                  <b>{b.name}</b>
                  <span className="small muted" style={{ display: "block" }}>{fmtDates(b.start, b.end)} · {seasonTails(shown, b, "No aircraft")}</span>
                </span>
                <span className={`pill ${cov.covered >= 1 ? "ok" : "danger"}`}>{Math.round(cov.covered * 100)}%</span>
              </button>
              <div className="balance-job-sizes">
                <label className="size"><span className="small muted">Pilots{what && what.pilots !== data.seasons.find((s) => s.id === b.id)?.pilotsNeeded ? " (what if)" : ""}</span>
                  <Stepper label="pilots" min={0} max={8} value={b.pilotsNeeded} onChange={(n) => resize(b.id, { pilots: n })} /></label>
                <label className="size"><span className="small muted">Maintainers</span>
                  <Stepper label="maintainers" min={0} max={8} value={b.maintainersNeeded} onChange={(n) => resize(b.id, { maintainers: n })} /></label>
                <button className={`btn sm lock ${locked ? "on" : ""}`} aria-pressed={locked} onClick={() => { setLockedJobs((x) => toggle(x, b.id)); setProposal(null); }}
                  title={locked ? "Locked: its shifts stay as they are" : "Lock to keep its shifts"}>
                  {locked ? <Lock size={14} /> : <LockOpen size={14} />} {locked ? "Locked" : "Lock"}
                </button>
              </div>
            </div>
          );
        })}
        {jobs.length === 0 && <div className="panel muted">No jobs in this period.</div>}
      </div>

      <div className="row gap wrap" style={{ alignItems: "baseline", marginTop: 24 }}>
        <h2 style={{ margin: 0 }} className="grow">Crew</h2>
        <div className="seg">
          {(["Pilot", "Maintainer"] as const).map((r) => <button key={r} className={role === r ? "active" : ""} onClick={() => setRole(r)}>{r === "Pilot" ? "Pilots" : "Maintainers"}</button>)}
        </div>
      </div>
      <p className="small muted">The bar is the share of the days they can work (not counting time off) that they're booked{next ? "; the line marks where they are now" : ""}. Lock someone to keep their shifts and give them no new ones.</p>
      <div className="legend" style={{ marginBottom: 8 }}>
        {(["over", "good", "light", "idle"] as const).map((t) => <span key={t}><span className={`swatch load-${t}`} />{TONE_WORDS[t]}</span>)}
      </div>
      <div className="balance-people">
        {(next ?? now).people.filter((x) => x.person.role === role).sort((a, b) => b.share - a.share).map((x) => {
          const before = now.people.find((y) => y.person.id === x.person.id)!;
          const locked = lockedPeople.has(x.person.id);
          const t = tone(x.share);
          return (
            <div key={x.person.id} className={`balance-person ${locked ? "locked" : ""}`}>
              <button className="balance-person-name" onClick={() => open("person", x.person.id)}>
                <Avatar person={x.person} /><span className="ellipsis">{x.person.name}</span>
              </button>
              <span className="load-track" title={`${Math.round(x.share * 100)}% of the days they can work`}>
                <span className={`load-fill load-${t}`} style={{ width: `${Math.min(100, x.share * 100)}%` }} />
                {next && <span className="load-was" style={{ left: `${Math.min(100, before.share * 100)}%` }} aria-hidden="true" />}
              </span>
              <span className="load-words small">
                <b>{Math.round(x.on)} d</b>{x.off ? ` · ${Math.round(x.off)} off` : ""}
                {next && Math.round(x.on) !== Math.round(before.on) && <span className="muted"> (was {Math.round(before.on)})</span>}
              </span>
              <button className={`icon-btn lock ${locked ? "on" : ""}`} aria-pressed={locked} aria-label={locked ? `Unlock ${x.person.name}` : `Lock ${x.person.name}`}
                onClick={() => { setLockedPeople((s) => toggle(s, x.person.id)); setProposal(null); }}>
                {locked ? <Lock size={15} /> : <LockOpen size={15} />}
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}

/** Now, and after the what-if or rebalance: open seat-days, problems, the busiest person. */
function Compare({ now, next }: { now: BalanceStats; next: BalanceStats | null }) {
  const cell = (label: string, a: number, b: number | undefined, unit = "", lowerIsBetter = true) => (
    <div className="tile">
      <div className="label">{label}</div>
      <div className="value compare">
        <span className={b !== undefined ? "was" : ""}>{a}{unit}</span>
        {b !== undefined && <><ArrowRight size={16} /><span className={b === a ? "" : (b < a) === lowerIsBetter ? "ok" : "warn"}>{b}{unit}</span></>}
      </div>
    </div>
  );
  return (
    <div className="tiles">
      {cell("Open seat-days", now.openDays, next?.openDays)}
      {cell("Conflicts", now.problems, next?.problems)}
      {cell("Serious conflicts", now.serious, next?.serious)}
      {cell("Busiest person", now.busiest, next?.busiest, " d")}
    </div>
  );
}

/** How many shifts a new plan adds or takes away. */
function countChanges(a: AppData, b: AppData) {
  const key = (s: AppData["shifts"][number]) => `${s.seasonId}|${s.personId}|${s.start}|${s.end}`;
  const x = new Set(a.shifts.map(key)), y = new Set(b.shifts.map(key));
  return [...x].filter((k) => !y.has(k)).length + [...y].filter((k) => !x.has(k)).length;
}
