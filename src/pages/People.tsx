import { useState } from "react";
import { CalendarOff, Plus, Users } from "lucide-react";
import { useStore } from "../store";
import { dutyOf, type Issue } from "../coverage";
import { DAY, dayAt, fmtDays, fmtRange, ms, toWhen as toW, today } from "../time";
import { Avatar, Empty, useSort } from "../components/ui";
import type { Role } from "../types";

type Tab = Role | "Time off";

export function People({ issues }: { issues: Issue[] }) {
  const { data, open } = useStore();
  const [tab, setTab] = useState<Tab>(() => {
    try {
      return (localStorage.getItem("zoms-mrp:crew-tab") as Tab) || "Pilot";
    } catch {
      return "Pilot";
    }
  });
  const pick = (t: Tab) => {
    setTab(t);
    try {
      localStorage.setItem("zoms-mrp:crew-tab", t);
    } catch { /* only a convenience */ }
  };
  const { header, sorted } = useSort<"name" | "base" | "week" | "next">("name");
  const now = Date.now();
  const weekFrom = today().getTime(), weekTo = dayAt(today(), 30);
  const flagged = new Set(issues.filter((i) => i.severity === "danger").map((i) => i.personId));
  const count = (r: Role) => data.people.filter((p) => p.role === r).length;

  const rows = data.people.filter((p) => p.role === tab).map((p) => {
    const duty = dutyOf(data, p.id);
    const week = duty.reduce((t, d) => t + Math.max(0, Math.min(d.b, weekTo) - Math.max(d.a, weekFrom)), 0) / DAY;
    const next = duty.find((d) => d.b > now);
    const off = data.timeOff.find((t) => t.personId === p.id && ms(t.end) > now && ms(t.start) <= now);
    return { p, week, next, off };
  });
  const list = sorted(rows, (r, k) => (k === "name" ? r.p.name : k === "base" ? r.p.base : k === "week" ? r.week : r.next?.a ?? Infinity));
  const offList = [...data.timeOff].filter((t) => ms(t.end) > now - 7 * DAY).sort((a, b) => ms(a.start) - ms(b.start));

  return (
    <>
      <div className="page-head">
        <h1>Crew</h1>
        <button className="btn" onClick={() => open("timeOff", "new")}><CalendarOff size={16} /> Add time off…</button>
        <button className="btn primary" onClick={() => open("person", "new", { role: tab === "Time off" ? "Pilot" : tab })}><Plus size={16} /> Add {tab === "Maintainer" ? "maintainer" : "pilot"}…</button>
      </div>
      <div className="seg" style={{ marginBottom: 14 }}>
        <button className={tab === "Pilot" ? "active" : ""} onClick={() => pick("Pilot")}>Pilots <span className="chip">{count("Pilot")}</span></button>
        <button className={tab === "Maintainer" ? "active" : ""} onClick={() => pick("Maintainer")}>Maintainers <span className="chip">{count("Maintainer")}</span></button>
        <button className={tab === "Time off" ? "active" : ""} onClick={() => pick("Time off")}>Time off <span className="chip">{offList.length}</span></button>
      </div>

      {tab === "Time off" ? (
        offList.length === 0 ? (
          <Empty icon={<CalendarOff size={28} />} text="Vacation, training and sick days go here, so nobody gets booked while they're away." action={<button className="btn primary" onClick={() => open("timeOff", "new")}>Add time off…</button>} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Person</th><th>When</th><th>Reason</th></tr></thead>
              <tbody>
                {offList.map((t) => {
                  const p = data.people.find((x) => x.id === t.personId);
                  return (
                    <tr key={t.id} onClick={() => open("timeOff", t.id)}>
                      <td className="name">{p ? <span className="row gap-sm"><Avatar person={p} />{p.name}</span> : "Removed person"}</td>
                      <td>{fmtRange(t.start, t.end)}</td>
                      <td>{t.reason || <span className="muted">None given</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : null}
      {tab === "Time off" && offList.length > 0 && (
        <div className="cards-list">
          {offList.map((t) => {
            const p = data.people.find((x) => x.id === t.personId);
            return (
              <button key={t.id} className="list-card" onClick={() => open("timeOff", t.id)}>
                <span className="row gap-sm">{p && <Avatar person={p} />}<b>{p?.name ?? "Removed person"}</b></span>
                <span className="small muted">{fmtRange(t.start, t.end)}{t.reason ? ` · ${t.reason}` : ""}</span>
              </button>
            );
          })}
        </div>
      )}
      {tab === "Time off" ? null : list.length === 0 ? (
        <Empty icon={<Users size={28} />} text={`Add your ${tab === "Pilot" ? "pilots" : "maintainers"} and the aircraft types they're qualified on.`}
          action={<button className="btn primary" onClick={() => open("person", "new", { role: tab })}>Add {tab === "Pilot" ? "pilot" : "maintainer"}…</button>} />
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead><tr>{header("name", "Name")}<th>Qualified on</th>{header("base", "Base")}{header("week", "Days on, next 30", true)}{header("next", "Next duty")}</tr></thead>
              <tbody>
                {list.map(({ p, week, next, off }) => (
                  <tr key={p.id} onClick={() => open("person", p.id)}>
                    <td className="name"><span className="row gap-sm"><Avatar person={p} />{p.name}{flagged.has(p.id) && <span className="pill danger">Conflict</span>}{off && <span className="pill">Off</span>}</span></td>
                    <td><span className="row gap-sm wrap">{p.quals.map((q) => <span key={q} className="chip">{q}</span>)}</span></td>
                    <td>{p.base || <span className="muted">None</span>}</td>
                    <td className="r">{Math.round(week)}</td>
                    <td>{next ? <>{next.label}<div className="small muted">{fmtRange(toW(next.a), toW(next.b))}</div></> : <span className="muted">Nothing booked</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="cards-list">
            {list.map(({ p, week, next }) => (
              <button key={p.id} className="list-card" onClick={() => open("person", p.id)}>
                <span className="row gap-sm"><Avatar person={p} /><b>{p.name}</b>{flagged.has(p.id) && <span className="pill danger">Conflict</span>}</span>
                <span className="small muted">{p.quals.join(", ")} · {fmtDays(week)} on in the next 30 days</span>
                <span className="small">{next ? `Next: ${next.label}` : "Nothing booked"}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}

