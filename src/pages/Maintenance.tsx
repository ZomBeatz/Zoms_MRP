import { useState } from "react";
import { Plus, Wrench } from "lucide-react";
import { byId, useStore } from "../store";
import { fmtRange, ms } from "../time";
import { Avatar, Empty, useSort } from "../components/ui";

export function Maintenance() {
  const { data, open } = useStore();
  const [showDone, setShowDone] = useState(false);
  const aircraft = byId(data.aircraft);
  const people = byId(data.people);
  const { header, sorted } = useSort<"title" | "aircraft" | "start" | "kind">("start");
  const rows = data.jobs.filter((j) => showDone || !j.done);
  const list = sorted(rows, (j, k) => (k === "aircraft" ? aircraft.get(j.aircraftId)?.tail ?? "" : k === "start" ? ms(j.start) : j[k]));
  const unstaffed = (ids: string[]) => ids.length === 0;
  return (
    <>
      <div className="page-head">
        <h1>Maintenance</h1>
        <button className="btn primary" onClick={() => open("job", "new")}><Plus size={16} /> New job…</button>
      </div>
      <label className="check small" style={{ marginBottom: 14 }}><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Show finished jobs</label>
      {list.length === 0 ? (
        <Empty icon={<Wrench size={28} />} text="Inspections and repairs go here, with the maintainers working on them." action={<button className="btn primary" onClick={() => open("job", "new")}>New job…</button>} />
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead><tr>{header("title", "Job")}{header("aircraft", "Aircraft")}{header("kind", "Kind")}{header("start", "When")}<th>Maintainers</th><th>Status</th></tr></thead>
              <tbody>
                {list.map((j) => {
                  const ac = aircraft.get(j.aircraftId);
                  return (
                    <tr key={j.id} onClick={() => open("job", j.id, undefined, unstaffed(j.maintainerIds) && !j.done ? { spot: "maintainers" } : undefined)}>
                      <td className="name">{j.title}</td>
                      <td style={{ fontFamily: "var(--zb-font-mono)" }}>{ac?.tail ?? "Removed"}</td>
                      <td>{j.kind}</td>
                      <td>{fmtRange(j.start, j.end)}</td>
                      <td>
                        {unstaffed(j.maintainerIds) ? <span className="pill warn">Nobody assigned</span> : (
                          <span className="row gap-sm">{j.maintainerIds.map((id) => people.get(id)).filter((p) => !!p).map((p) => <Avatar key={p.id} person={p} />)}</span>
                        )}
                      </td>
                      <td>{j.done ? <span className="pill">Done</span> : j.grounds ? <span className="pill warn">Grounds aircraft</span> : <span className="pill accent">Open</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="cards-list">
            {list.map((j) => (
              <button key={j.id} className="list-card" onClick={() => open("job", j.id, undefined, unstaffed(j.maintainerIds) && !j.done ? { spot: "maintainers" } : undefined)}>
                <span className="row gap-sm"><b className="grow">{j.title}</b>{j.done ? <span className="pill">Done</span> : j.grounds ? <span className="pill warn">Grounds aircraft</span> : null}</span>
                <span className="small muted">{aircraft.get(j.aircraftId)?.tail} · {j.kind} · {fmtRange(j.start, j.end)}</span>
                {unstaffed(j.maintainerIds) && !j.done && <span className="small" style={{ color: "var(--zb-warn)" }}>Nobody assigned yet</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}
