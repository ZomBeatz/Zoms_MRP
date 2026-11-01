import { useMemo, useState } from "react";
import { GraduationCap, Plus } from "lucide-react";
import { format } from "date-fns";
import { useStore } from "../store";
import { neededTraining } from "../coverage";
import { DAY } from "../time";
import { missionLook, slotStyle } from "../look";
import { Avatar, Empty } from "../components/ui";
import type { Person, Training } from "../types";

/**
 * Training is set by each mission, and people only need what the missions they work ask for.
 * “Who's current” shows each person against the training they need; everything else reads “Not needed”.
 */

type Tab = "current" | "courses";

interface Standing { label: string; tone: string; date?: string }

function standing(p: Person, t: Training, warnDays: number): Standing {
  const recs = p.training.filter((r) => r.trainingId === t.id);
  if (!recs.length) return { label: "Not done", tone: "danger" };
  if (recs.some((r) => !r.expires)) return { label: "Current", tone: "ok" };
  const latest = recs.map((r) => r.expires!).sort().at(-1)!;
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
            <p className="small muted" style={{ marginTop: 0 }}>
              {gaps ? `${gaps} ${gaps === 1 ? "thing needs" : "things need"} attention. ` : "Everyone has what their missions need. "}
              People need only the training their missions ask for. Click a person to record training or change what they work on.
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
    </>
  );
}
