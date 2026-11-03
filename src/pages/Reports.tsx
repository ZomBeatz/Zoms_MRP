import { useMemo, useState } from "react";
import { FileSpreadsheet, Printer } from "lucide-react";
import { downloadWorkbook } from "../excel";
import { showInFolder } from "../files";
import { bookings } from "../bookings";
import { useStore } from "../store";
import { dutyOf, missionCoverage } from "../coverage";
import { DAY, dayAt, fmtDates, fmtDays, ms, toWhen, today } from "../time";
import { missionLook, slotStyle } from "../look";
import { seasonTails } from "../rotation";
import { Avatar } from "../components/ui";
import type { AppData, Booking } from "../types";

/**
 * How the business and its resources are used over a period: days per mission (customer),
 * how busy each aircraft and person was, and how much mission time was fully crewed.
 */

const PERIODS = [
  { id: "last90", label: "Last 90 days", from: -90, to: 0 },
  { id: "last30", label: "Last 30 days", from: -30, to: 0 },
  { id: "next30", label: "Next 30 days", from: 0, to: 30 },
  { id: "next90", label: "Next 90 days", from: 0, to: 90 },
  { id: "year", label: "Next 12 months", from: 0, to: 365 },
] as const;

const clip = (a: number, b: number, from: number, to: number) => Math.max(0, Math.min(b, to) - Math.max(a, from));

export function report(data: AppData, from: number, to: number) {
  const days = (to - from) / DAY;
  const missions = bookings(data).filter((m) => m.status !== "Cancelled" && clip(ms(m.start), ms(m.end), from, to) > 0);
  const mDays = (m: Booking) => clip(ms(m.start), ms(m.end), from, to) / DAY;

  const fleet = data.aircraft.filter((a) => a.status !== "Retired").map((a) => {
    const flying = missions.filter((m) => m.aircraftIds.includes(a.id)).reduce((t, m) => t + mDays(m), 0);
    const maint = data.jobs.filter((j) => j.aircraftId === a.id).reduce((t, j) => t + clip(ms(j.start), ms(j.end), from, to) / DAY, 0);
    return { a, flying, maint, idle: Math.max(0, days - flying - maint) };
  });

  const crew = data.people.map((p) => {
    const on = dutyOf(data, p.id).reduce((t, d) => t + clip(d.a, d.b, from, to), 0) / DAY;
    const off = data.timeOff.filter((t) => t.personId === p.id).reduce((t, o) => t + clip(ms(o.start), ms(o.end), from, to), 0) / DAY;
    return { p, on, off };
  });

  let total = 0, covered = 0;
  for (const m of missions) {
    const n = mDays(m);
    total += n;
    covered += n * missionCoverage(data, m).covered;
  }

  return {
    days, missions, total, crewedShare: total ? covered / total : 1,
    // One bar per kind of mission (every season of a customer's work together).
    // One bar per mission (all its seasons in the period together).
    byMission: data.missions
      .map((m) => ({ m, days: missions.filter((x) => x.missionId === m.id).reduce((t, x) => t + mDays(x), 0) }))
      .filter((x) => x.days > 0)
      .sort((x, y) => y.days - x.days),
    fleet: fleet.sort((x, y) => y.flying - x.flying),
    crew: crew.sort((x, y) => y.on - x.on),
  };
}

export function Reports() {
  const { data, open } = useStore();
  const [period, setPeriod] = useState<string>("next30");
  const p = PERIODS.find((x) => x.id === period)!;
  const from = dayAt(today(), p.from);
  const to = dayAt(today(), p.to);
  const r = useMemo(() => report(data, from, to), [data, from, to]);
  const fleetUse = r.fleet.length ? r.fleet.reduce((t, f) => t + f.flying, 0) / (r.fleet.length * r.days) : 0;
  const crewDays = r.crew.reduce((t, c) => t + c.on, 0);
  const crewShare = r.crew.length ? crewDays / (r.crew.length * r.days) : 0;
  const maxMission = Math.max(1, ...r.byMission.map((x) => x.days));

  const [exporting, setExporting] = useState(false);
  const exportExcel = async () => {
    setExporting(true);
    try {
      const where = await downloadWorkbook(data);
      useStore.getState().showToast("Saved to Downloads. Post it in a Teams channel to share it.", where ? { label: "Show", run: () => showInFolder(where) } : undefined);
    } catch {
      useStore.getState().showToast("Couldn't make the Excel file. Try again.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <h1>Reports</h1>
        <button className="btn" onClick={exportExcel} disabled={exporting} title="The fleet board, seasons, crew roster, training, maintenance and problems, one sheet each">
          <FileSpreadsheet size={16} /> {exporting ? "Making the file…" : "Export to Excel"}
        </button>
        <button className="btn" onClick={() => window.print()}><Printer size={16} /> Print</button>
      </div>
      <div className="row gap wrap" style={{ marginBottom: 16 }}>
        <div className="seg">
          {PERIODS.map((x) => <button key={x.id} className={period === x.id ? "active" : ""} onClick={() => setPeriod(x.id)}>{x.label}</button>)}
        </div>
        <span className="muted small">{fmtDates(toWhen(from), toWhen(to))}</span>
      </div>

      <div className="tiles">
        <div className="tile"><div className="label">Missions</div><div className="value">{r.byMission.length}</div></div>
        <div className="tile"><div className="label">Mission days</div><div className="value">{Math.round(r.total)}</div></div>
        <div className="tile"><div className="label">Fully crewed</div><div className={`value ${r.crewedShare < 1 ? "warn" : "ok"}`}>{Math.round(r.crewedShare * 100)}%</div></div>
        <div className="tile"><div className="label">Fleet on missions</div><div className="value">{Math.round(fleetUse * 100)}%</div></div>
        <div className="tile"><div className="label">Crew busy</div><div className="value">{Math.round(crewShare * 100)}%</div></div>
      </div>

      <div className="report-grid">
        <section className="panel">
          <h3>Days by mission</h3>
          {r.byMission.length === 0 ? <p className="muted">No missions in this period.</p> : (
            <div className="hbars">
              {r.byMission.map(({ m, days }) => (
                <button key={m.id} className="hbar" onClick={() => open("mission", m.id)} title={`${m.name}: ${fmtDays(days)} in this period`}>
                  <span className="hbar-label ellipsis">{m.name}</span>
                  <span className="hbar-track"><span className="hbar-fill" style={{ ...slotStyle(missionLook(m)), width: `${(days / maxMission) * 100}%` }} /></span>
                  <span className="hbar-value">{Math.round(days)} d</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="panel">
          <h3>Aircraft use</h3>
          <div className="legend" style={{ marginTop: 0, marginBottom: 10 }}>
            <span><span className="swatch" style={{ background: "var(--zb-cat-1)" }} />On missions</span>
            <span><span className="swatch" style={{ background: "var(--zb-cat-4)" }} />Maintenance</span>
            <span><span className="swatch" style={{ background: "var(--zb-surface-3)" }} />Available</span>
          </div>
          <div className="hbars">
            {r.fleet.map(({ a, flying, maint, idle }) => (
              <button key={a.id} className="hbar" onClick={() => open("aircraft", a.id)}
                title={`${a.tail}: ${fmtDays(flying)} on missions, ${fmtDays(maint)} maintenance, ${fmtDays(idle)} available`}>
                <span className="hbar-label" style={{ fontFamily: "var(--zb-font-mono)" }}>{a.tail}</span>
                <span className="hbar-track stack">
                  <span style={{ width: `${(flying / r.days) * 100}%`, background: "var(--zb-cat-1)" }} />
                  <span style={{ width: `${(maint / r.days) * 100}%`, background: "var(--zb-cat-4)" }} />
                  <span style={{ flex: 1, background: "var(--zb-surface-3)" }} />
                </span>
                <span className="hbar-value">{Math.round((flying / r.days) * 100)}%</span>
              </button>
            ))}
          </div>
        </section>

        {(["Pilot", "Maintainer"] as const).map((role) => (
          <section className="panel" key={role}>
            <h3>{role === "Pilot" ? "Pilot" : "Maintainer"} days on</h3>
            <div className="hbars">
              {r.crew.filter((c) => c.p.role === role).map(({ p, on, off }) => (
                <button key={p.id} className="hbar" onClick={() => open("person", p.id)} title={`${p.name}: ${fmtDays(on)} on${off ? `, ${fmtDays(off)} of time off` : ""}`}>
                  <span className="hbar-label row gap-sm ellipsis"><Avatar person={p} />{p.name}</span>
                  <span className="hbar-track"><span className="hbar-fill" style={{ width: `${(on / r.days) * 100}%`, background: role === "Pilot" ? "var(--zb-cat-1)" : "var(--zb-cat-2)" }} /></span>
                  <span className="hbar-value">{Math.round((on / r.days) * 100)}%</span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      <h2>Missions in this period</h2>
      {r.missions.length === 0 ? <div className="panel muted">No missions in this period.</div> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Mission</th><th>Aircraft</th><th>When</th><th className="r">Days in period</th><th className="r">Crewed</th></tr></thead>
            <tbody>
              {[...r.missions].sort((a, b) => ms(a.start) - ms(b.start)).map((m) => {
                const pct = Math.round(missionCoverage(data, m).covered * 100);
                return (
                  <tr key={m.id} onClick={() => open("season", m.id)}>
                    <td className="name"><span className="row gap-sm"><span className="swatch" style={slotStyle(missionLook(m))} />{m.name}</span></td>
                    <td style={{ fontFamily: "var(--zb-font-mono)" }}>{seasonTails(data, m, "None")}</td>
                    <td>{fmtDates(m.start, m.end)}</td>
                    <td className="r">{Math.round(clip(ms(m.start), ms(m.end), from, to) / DAY)}</td>
                    <td className="r"><span className={`pill ${pct === 100 ? "ok" : "danger"}`}>{pct}%</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
