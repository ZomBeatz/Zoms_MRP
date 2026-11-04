import { useMemo, useState } from "react";
import { GraduationCap, Plus, Users } from "lucide-react";
import { format } from "date-fns";
import { useStore } from "../store";
import { neededTraining } from "../coverage";
import { daysSince } from "../currency";
import { DAY } from "../time";
import { missionLook, slotStyle } from "../look";
import { Avatar, Empty } from "../components/ui";
import { validUntil, type Person, type Training } from "../types";

/**
 * Training is set by each mission, and people only need what the missions they work ask for.
 * “Who's current” shows each person against the training they need; everything else reads “Not needed”.
 */

type Tab = "current" | "courses";

interface Standing { label: string; tone: string; date?: string }

function standing(p: Person, t: Training, warnDays: number): Standing {
  const recs = p.training.filter((r) => r.trainingId === t.id);
  if (!recs.length) return { label: "Not done", tone: "danger" };
  if (recs.some((r) => !validUntil(r))) return { label: "Current", tone: "ok" };
  const latest = recs.map((r) => validUntil(r)!).sort().at(-1)!;
  const end = new Date(`${latest}T00:00`).getTime();
  const date = format(end, "MMM d, yyyy");
  if (end <= Date.now()) return { label: "Ran out", tone: "danger", date };
  if (end <= Date.now() + warnDays * DAY) return { label: "Runs out soon", tone: "warn", date };
  return { label: "Current", tone: "ok", date };
}

export function TrainingPage() {
  const { data, open } = useStore();
  const [tab, setTab] = useState<Tab>("current");
  const [kind, setKind] = useState("");
  const warn = data.settings.expiryWarningDays;
  const mission = data.missions.find((m) => m.id === kind);

  const rows = useMemo(() => {
    const people = [...data.people]
      .filter((p) => !mission || p.missionIds.includes(mission.id) || data.shifts.some((s) => s.personId === p.id && data.seasons.some((x) => x.id === s.seasonId && x.missionId === mission.id)))
      .sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === "Pilot" ? -1 : 1));
    return people.map((p) => ({ p, needs: neededTraining(data, p) }));
  }, [data, mission]);
  const columns = mission ? data.trainings.filter((t) => mission.requiredTrainingIds.includes(t.id)) : data.trainings;
  const gaps = rows.reduce((n, r) => n + [...r.needs.keys()].filter((id) => {
    const t = data.trainings.find((x) => x.id === id);
    return t && standing(r.p, t, warn).tone !== "ok";
  }).length, 0);

  return (
    <>
      <div className="page-head">
        <h1>Training</h1>
        {data.trainings.length > 0 && data.people.length > 0 && <button className="btn" onClick={() => open("groupTraining", "new")}><Users size={16} /> Record for several people…</button>}
        <button className="btn primary" onClick={() => open("training", "new")}><Plus size={16} /> Add training…</button>
      </div>
      <div className="row gap wrap" style={{ marginBottom: 14 }}>
        <div className="seg">
          <button className={tab === "current" ? "active" : ""} onClick={() => setTab("current")}>Who's current</button>
          <button className={tab === "courses" ? "active" : ""} onClick={() => setTab("courses")}>Courses <span className="chip">{data.trainings.length}</span></button>
        </div>
        {tab === "current" && (
          <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Show crew for">
            <option value="">Everyone</option>
            {data.missions.map((m) => <option key={m.id} value={m.id}>Crew for {m.name}</option>)}
          </select>
        )}
      </div>

      {tab === "current" && (
        data.trainings.length === 0 || rows.length === 0 ? (
          <Empty icon={<GraduationCap size={28} />} text={mission ? "Nobody works this mission yet. Pick its crew in the mission." : "Add training courses, set which missions need them, then record who has done what."}
            action={<button className="btn primary" onClick={() => (mission ? open("mission", mission.id) : open("training", "new"))}>{mission ? "Open the mission…" : "Add training…"}</button>} />
        ) : (
          <>
            <NeedsTraining rows={rows} warn={warn} />
            <p className="small muted" style={{ marginTop: 0 }}>
              {gaps ? `${gaps} ${gaps === 1 ? "thing needs" : "things need"} attention. ` : "Everyone has what their missions need. "}
              People need only the training their missions ask for. Tap a person to record training or change what they work on.
            </p>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>Person</th><th>Works on</th>{columns.map((t) => <th key={t.id}>{t.name}</th>)}</tr>
                </thead>
                <tbody>
                  {rows.map(({ p, needs }) => (
                    <tr key={p.id} onClick={() => open("person", p.id)}>
                      <td className="name"><span className="row gap-sm"><Avatar person={p} />{p.name}</span></td>
                      <td style={{ minWidth: 240, maxWidth: 360 }}>
                        <span className="row gap-sm wrap">
                          {p.missionIds.map((id) => data.missions.find((m) => m.id === id)).filter((m) => !!m).map((m) => (
                            <span key={m.id} className="chip" title={m.name}><span className="swatch" style={{ ...slotStyle(missionLook(m)), width: 9, height: 9 }} />{m.name}</span>
                          ))}
                          {p.missionIds.length === 0 && <span className="muted small">Nothing yet</span>}
                        </span>
                      </td>
                      {columns.map((t) => {
                        const need = needs.get(t.id);
                        const has = p.training.some((r) => r.trainingId === t.id);
                        if (!need) return <td key={t.id}>{has ? <span className="small muted">Has it</span> : <span className="small muted">Not needed</span>}</td>;
                        const s = standing(p, t, warn);
                        return (
                          <td key={t.id} title={`Needed for ${need.map((m) => m.name).join(", ")}`}>
                            <span className={`pill ${s.tone}`}>{s.label}</span>
                            {s.date && s.tone !== "ok" && <div className="small muted">{s.date}</div>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="cards-list">
              {rows.map(({ p, needs }) => (
                <button key={p.id} className="list-card" onClick={() => open("person", p.id)}>
                  <span className="row gap-sm"><Avatar person={p} /><b>{p.name}</b></span>
                  <span className="row gap-sm wrap">
                    {[...needs.keys()].map((id) => {
                      const t = data.trainings.find((x) => x.id === id);
                      if (!t) return null;
                      const s = standing(p, t, warn);
                      return <span key={id} className={`pill ${s.tone}`}>{t.name}: {s.label}</span>;
                    })}
                    {needs.size === 0 && <span className="small muted">No training needed</span>}
                  </span>
                </button>
              ))}
            </div>
          </>
        )
      )}

      {tab === "courses" && (
        data.trainings.length === 0 ? (
          <Empty icon={<GraduationCap size={28} />} text="Courses and certifications some missions need, like NVG or mountain flying." action={<button className="btn primary" onClick={() => open("training", "new")}>Add training…</button>} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Training</th><th>For</th><th className="r">Renew every</th><th>Missions that need it</th><th className="r">Need it</th><th className="r">Current</th></tr></thead>
              <tbody>
                {data.trainings.map((t) => {
                  const missions = data.missions.filter((m) => m.requiredTrainingIds.includes(t.id));
                  const needing = data.people.filter((p) => neededTraining(data, p).has(t.id));
                  const current = needing.filter((p) => standing(p, t, warn).tone !== "danger").length;
                  return (
                    <tr key={t.id} onClick={() => open("training", t.id)}>
                      <td className="name">{t.name}</td>
                      <td>{t.appliesTo === "Both" ? "Pilots and maintainers" : `${t.appliesTo}s`}</td>
                      <td className="r">{t.validMonths ? `${t.validMonths} months` : "Never runs out"}</td>
                      <td>{missions.length ? missions.map((m) => m.name).join(", ") : <span className="muted">None</span>}</td>
                      <td className="r">{needing.length}</td>
                      <td className="r">{needing.length ? <span className={`pill ${current === needing.length ? "ok" : "warn"}`}>{current} of {needing.length}</span> : <span className="muted">None</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}
      {tab === "courses" && data.trainings.length > 0 && (
        <div className="cards-list">
          {data.trainings.map((t) => {
            const needing = data.people.filter((p) => neededTraining(data, p).has(t.id));
            const current = needing.filter((p) => standing(p, t, warn).tone !== "danger").length;
            return (
              <button key={t.id} className="list-card" onClick={() => open("training", t.id)}>
                <span className="row gap-sm"><b className="grow">{t.name}</b>{needing.length > 0 && <span className={`pill ${current === needing.length ? "ok" : "warn"}`}>{current} of {needing.length} current</span>}</span>
                <span className="small muted">{t.appliesTo === "Both" ? "Pilots and maintainers" : `${t.appliesTo}s`} · {t.validMonths ? `renew every ${t.validMonths} months` : "never runs out"}</span>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

/**
 * Only the people with something to sort out: training they need that's missing, run out or running out
 * soon. Each course opens right where it's recorded or extended. Not shown when everyone's fine.
 */
function NeedsTraining({ rows, warn }: { rows: { p: Person; needs: Map<string, { name: string }[]> }[]; warn: number }) {
  const { data, open } = useStore();
  const limit = data.settings.currencyDays;
  const now = Date.now();
  const list = rows
    .map(({ p, needs }) => ({
      p,
      items: [...needs.entries()].flatMap(([id, missions]) => {
        const t = data.trainings.find((x) => x.id === id);
        if (!t) return [];
        const st = standing(p, t, warn);
        return st.tone === "ok" ? [] : [{ t, st, for: missions.map((m) => m.name).join(", ") }];
      }),
    }))
    .map((x) => ({
      ...x,
      // Pilots who haven't flown a type they're rated on within the currency limit (when there's a record).
      stale: limit && x.p.role === "Pilot" ? x.p.quals.map((type) => ({ type, days: daysSince(data, x.p, type, now) })).filter((t): t is { type: string; days: number } => t.days !== null && t.days > limit) : [],
    }))
    .filter((x) => x.items.length || x.stale.length)
    .sort((a, b) => b.items.filter((i) => i.st.tone === "danger").length - a.items.filter((i) => i.st.tone === "danger").length || a.p.name.localeCompare(b.p.name));

  if (!list.length) return null;
  return (
    <section className="panel needs-training">
      <h3>Needs training <span className="chip">{list.length}</span></h3>
      <div className="needs-list">
        {list.map(({ p, items, stale }) => (
          <div key={p.id} className="needs-person">
            <button className="row gap-sm needs-name" onClick={() => open("person", p.id, undefined, { tab: "training" })}><Avatar person={p} /><b>{p.name}</b></button>
            <div className="picker-row">
              {items.map(({ t, st, for: f }) => (
                <button key={t.id} className={`chip pick needs-${st.tone}`} title={`Needed for ${f}`} onClick={() => open("person", p.id, undefined, { tab: "training", spot: `training:${t.id}` })}>
                  {t.name}<span className={`pill ${st.tone}`}>{st.label}{st.date ? ` ${st.date}` : ""}</span>
                </button>
              ))}
              {stale.map(({ type, days }) => (
                <button key={type} className="chip pick needs-warn" title={`Current means flown within ${limit} days`} onClick={() => open("person", p.id, undefined, { tab: "work", spot: "flew" })}>
                  {type}<span className="pill warn">Not flown in {days} days</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
