import { useState } from "react";
import { ClipboardList, Plus } from "lucide-react";
import { byId, useStore } from "../store";
import { missionCoverage, type Issue } from "../coverage";
import { seasonsOf } from "../bookings";
import { fmtDates, ms, plural } from "../time";
import { missionLook, slotStyle } from "../look";
import { Empty, StatusPill, useSort } from "../components/ui";
import { ConfirmButton } from "./Overview";

/**
 * Every mission (one customer's work), with the season running now or the next one coming,
 * how well it's crewed, and how many seasons it has. Open one to change it or its seasons.
 */
export function Missions({ issues }: { issues: Issue[] }) {
  const { data, open } = useStore();
  const [show, setShow] = useState<"active" | "all">("active");
  const [q, setQ] = useState("");
  const aircraft = byId(data.aircraft);
  const { header, sorted } = useSort<"name" | "contact" | "season" | "crewed" | "crew">("season");
  const now = Date.now();
  const problems = new Set(issues.filter((i) => i.severity === "danger").map((i) => i.seasonId));

  const rows = data.missions
    .map((m) => {
      const seasons = seasonsOf(data, m.id).filter((x) => x.status !== "Cancelled");
      // The season to show: the one running now, else the next one, else the last one.
      const current = seasons.find((x) => ms(x.start) <= now && ms(x.end) > now) ?? seasons.find((x) => ms(x.start) > now) ?? seasons[seasons.length - 1];
      const active = !!current && ms(current.end) > now;
      const crew = data.people.filter((p) => p.missionIds.includes(m.id)).length;
      return { m, seasons, current, active, crew, cov: current && active ? missionCoverage(data, current).covered : 1 };
    })
    .filter((r) => show === "all" || r.active || r.seasons.length === 0)
    .filter((r) => !q || `${r.m.name} ${r.m.contact} ${r.m.location}`.toLowerCase().includes(q.toLowerCase()));
  const list = sorted(rows, (r, k) =>
    k === "name" ? r.m.name : k === "contact" ? r.m.contact : k === "season" ? (r.current ? (r.active ? ms(r.current.start) : Infinity) : Infinity) : k === "crewed" ? r.cov : r.crew);

  return (
    <>
      <div className="page-head">
        <h1>Missions</h1>
        <input placeholder="Filter missions" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 200 }} />
        <button className="btn primary" onClick={() => open("mission", "new")}><Plus size={16} /> New mission…</button>
      </div>
      <div className="seg" style={{ marginBottom: 14 }}>
        <button className={show === "active" ? "active" : ""} onClick={() => setShow("active")}>Running or coming up</button>
        <button className={show === "all" ? "active" : ""} onClick={() => setShow("all")}>All <span className="chip">{data.missions.length}</span></button>
      </div>
      {list.length === 0 ? (
        <Empty icon={<ClipboardList size={28} />} text={data.missions.length ? "No missions match." : "Each customer's work is a mission, with a season for each stretch of dates."}
          action={!data.missions.length && <button className="btn primary" onClick={() => open("mission", "new")}>New mission…</button>} />
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>{header("name", "Mission")}{header("contact", "Contact")}{header("season", "Now or next")}<th>Aircraft</th>{header("crewed", "Crewed", true)}{header("crew", "Crew", true)}<th className="r">Seasons</th></tr>
              </thead>
              <tbody>
                {list.map(({ m, seasons, current, active, crew, cov }) => {
                  const tails = current ? current.aircraftIds.map((id) => aircraft.get(id)).filter((x) => !!x) : [];
                  return (
                    <tr key={m.id} onClick={() => open("mission", m.id)}>
                      <td className="name"><span className="row gap-sm"><span className="swatch" style={slotStyle(missionLook(m))} />{m.name}</span></td>
                      <td>{m.contact || <span className="muted">None</span>}</td>
                      <td>
                        {current ? (
                          <span className="row gap-sm wrap">
                            <button className="link" onClick={(e) => { e.stopPropagation(); open("season", current.id); }}>{fmtDates(current.start, current.end)}</button>
                            <StatusPill status={current.status} />
                            <ConfirmButton season={{ ...current, name: m.name }} />
                          </span>
                        ) : <span className="muted">No seasons yet</span>}
                      </td>
                      <td>{tails.length ? tails.map((x) => <span key={x.id} style={{ marginRight: 8 }}><b>{x.tail}</b> <span className="muted small">{x.type}</span></span>) : current ? <span className="pill warn">No aircraft</span> : null}</td>
                      <td className="r">
                        {!active ? <span className="muted">Not running</span>
                          : problems.has(current!.id) && cov === 1 ? <span className="pill danger">Conflict</span>
                          : <span className={`pill ${cov === 1 ? "ok" : "danger"}`}>{Math.round(cov * 100)}%</span>}
                      </td>
                      <td className="r">{crew}</td>
                      <td className="r">{seasons.length}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="cards-list">
            {list.map(({ m, seasons, current, active, cov }) => (
              // A card you tap to open, with Confirm inside it (so it's a div acting as a button).
              <div key={m.id} className="list-card" role="button" tabIndex={0} onClick={() => open("mission", m.id)}
                onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); open("mission", m.id); } }}>
                <span className="row gap-sm"><span className="swatch" style={slotStyle(missionLook(m))} /><b>{m.name}</b></span>
                <span className="small muted">{current ? `${active ? "" : "Last: "}${fmtDates(current.start, current.end)}` : "No seasons yet"} · {plural(seasons.length, "season")}</span>
                {active && <span className="row gap-sm wrap small"><span className={`pill ${cov === 1 ? "ok" : "danger"}`}>{Math.round(cov * 100)}% crewed</span> {current && <StatusPill status={current.status} />}</span>}
                {current && <ConfirmButton season={{ ...current, name: m.name }} />}
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
