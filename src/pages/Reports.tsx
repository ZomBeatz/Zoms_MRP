import { useMemo, useState } from "react";
import { addDays, format } from "date-fns";
import { CalendarDays, FileSpreadsheet, FileText } from "lucide-react";
import { saveFile, showInFolder } from "../files";
import { DateRange } from "../components/dates";
import { useStore } from "../store";
import { missionCoverage } from "../coverage";
import { report, reportName } from "../report";
import { DAY, dateToEnd, dateToStart, dayAt, fmtDates, fmtDays, ms, toWhen, today } from "../time";
import { missionLook, slotStyle } from "../look";
import { seasonTails } from "../rotation";
import { Avatar, usePref } from "../components/ui";

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
const ymd = (t: number) => format(t, "yyyy-MM-dd");
/** Longest period a report covers. */
const MAX_DAYS = 3 * 366;

export function Reports() {
  const { data, open } = useStore();
  const [period, setPeriod] = usePref<string>("reports-period", "next30");
  // Your own dates: the first and last day, as "2026-11-01".
  const [first, setFirst] = useState(() => ymd(today().getTime()));
  const [last, setLast] = useState(() => ymd(addDays(today(), 89).getTime()));
  const p = PERIODS.find((x) => x.id === period);
  const custom = !p;
  const ownFrom = ms(dateToStart(first)), ownTo = ms(dateToEnd(last));
  const datesWrong = custom && (!first || !last || !(ownTo > ownFrom) || (ownTo - ownFrom) / DAY > MAX_DAYS);
  const from = p ? dayAt(today(), p.from) : datesWrong ? dayAt(today(), 0) : ownFrom;
  const to = p ? dayAt(today(), p.to) : datesWrong ? dayAt(today(), 30) : ownTo;
  const r = useMemo(() => report(data, from, to), [data, from, to]);
  const fleetUse = r.fleet.length ? r.fleet.reduce((t, f) => t + f.flying, 0) / (r.fleet.length * r.days) : 0;
  const crewDays = r.crew.reduce((t, c) => t + c.on, 0);
  const crewShare = r.crew.length ? crewDays / (r.crew.length * r.days) : 0;
  const maxMission = Math.max(1, ...r.byMission.map((x) => x.days));

  const [making, setMaking] = useState<"pdf" | "xlsx" | "week" | null>(null);
  const [weekOf, setWeekOf] = usePref<"this" | "next">("week-sheet", "this");
  /** The week sheet: Monday to Sunday, this week or next. */
  const week = async () => {
    const { showToast } = useStore.getState();
    const t = today();
    const monday = dayAt(t, -((t.getDay() + 6) % 7) + (weekOf === "next" ? 7 : 0));
    setMaking("week");
    try {
      const blob = await (await import("../reportPdf")).buildWeekPdf(data, monday);
      const where = await saveFile(`zoms-mrp-week-${format(monday, "yyyy-MM-dd")}.pdf`, blob);
      showToast(where ? "Saved to Downloads." : "Week sheet made. Look in your downloads.", where ? { label: "Show", run: () => showInFolder(where) } : undefined);
    } catch {
      showToast("Couldn't make the week sheet. Try again.");
    } finally {
      setMaking(null);
    }
  };
  /** Build the report for this period and hand it over (the desktop app puts it in Downloads). */
  const make = async (kind: "pdf" | "xlsx") => {
    const { showToast } = useStore.getState();
    if (datesWrong) return showToast(`Pick a first and last day, at most ${MAX_DAYS / 366} years apart.`);
    setMaking(kind);
    try {
      const blob = kind === "pdf"
        ? await (await import("../reportPdf")).buildPdf(data, from, to)
        : await (await import("../reportExcel")).buildReportWorkbook(data, from, to);
      const where = await saveFile(reportName(from, to, kind), blob);
      showToast(where ? "Saved to Downloads." : "Report made. Look in your downloads.", where ? { label: "Show", run: () => showInFolder(where) } : undefined);
    } catch {
      showToast(`Couldn't make the ${kind === "pdf" ? "PDF" : "Excel file"}. Try again.`);
    } finally {
      setMaking(null);
    }
  };

  return (
    <>
      <div className="page-head">
        <h1>Reports</h1>
        <div className="row gap-sm">
          <button className="btn" onClick={() => make("pdf")} disabled={!!making} title="A PDF of this period: the numbers, the fleet and crew boards, missions, workload, training, maintenance and problems">
            <FileText size={16} /> {making === "pdf" ? "Making the PDF…" : "PDF report"}
          </button>
          <button className="btn" onClick={week} disabled={!!making} title="One page with who's on each day of the week, for the crew room or Teams">
            <CalendarDays size={16} /> {making === "week" ? "Making it…" : "Week sheet"}
          </button>
          <select value={weekOf} onChange={(e) => setWeekOf(e.target.value as "this" | "next")} aria-label="Which week">
            <option value="this">This week</option>
            <option value="next">Next week</option>
          </select>
          <button className="btn" onClick={() => make("xlsx")} disabled={!!making} title="An Excel workbook of this period, colored like the app, one sheet per part">
            <FileSpreadsheet size={16} /> {making === "xlsx" ? "Making the file…" : "Excel report"}
          </button>
        </div>
      </div>
      <div className="row gap wrap" style={{ marginBottom: 16 }}>
        <div className="seg">
          {PERIODS.map((x) => <button key={x.id} className={period === x.id ? "active" : ""} onClick={() => setPeriod(x.id)}>{x.label}</button>)}
          <button className={custom ? "active" : ""} onClick={() => setPeriod("custom")}>Pick dates</button>
        </div>
        {custom ? (
          <div className="report-dates">
            <DateRange first={first} last={last} onChange={(f, l) => { setFirst(f); setLast(l); }} />
            {datesWrong && <span className="small danger-text">Pick a last day after the first, at most {MAX_DAYS / 366} years later.</span>}
          </div>
        ) : <span className="muted small">{fmtDates(toWhen(from), toWhen(to))}</span>}
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
