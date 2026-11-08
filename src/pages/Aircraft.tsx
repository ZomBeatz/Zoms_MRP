import { Fragment, useMemo, useState } from "react";
import { Plane, Plus, SearchCheck, Wrench } from "lucide-react";
import { format } from "date-fns";
import { bookings } from "../bookings";
import { useStore } from "../store";
import { fleetUse, freePerDay } from "../fleet";
import { downSpan } from "../aircraftTypes";
import { dayAt, fmtDates, ms, plural, toWhen, today } from "../time";
import { missionLook, slotStyle } from "../look";
import { Empty, StatusPill, usePref } from "../components/ui";
import type { Aircraft } from "../types";
import { LaneBackdrop, TimeHead, TimelineControls, TimelineHint, useTimeline } from "../components/timeline";

/**
 * The fleet over time, tail by tail, grouped by type: what each aircraft is doing, its maintenance,
 * and the free windows between, with how many aircraft are free each day across the top.
 * Drag, scroll and zoom like the Schedule. The place to see what more you can take on.
 */
export function AircraftPage() {
  const { data, open } = useStore();
  const [view, setView] = usePref<"status" | "timeline">("zoms-mrp:fleet-view", "status");
  const [span, setSpan] = useState(90);
  const tl = useTimeline(span, setSpan, 7);
  const { from, to, pct } = tl;
  const t0 = today().getTime();
  // The numbers stay put while you scroll: tiles and each tail's % booked are for the next 90 days,
  // and free windows are measured over their whole length (from a year back to two years ahead).
  const next = useMemo(() => fleetUse(data, t0, dayAt(t0, 90)), [data, t0]);
  const horizon: [number, number] = [dayAt(t0, -400), dayAt(t0, 730)];
  const wide = useMemo(() => fleetUse(data, dayAt(t0, -400), dayAt(t0, 730)), [data, t0]);
  const perDay = useMemo(() => freePerDay(data, from, to), [data, from, to]);
  const nextPerDay = useMemo(() => freePerDay(data, t0, dayAt(t0, 90)), [data, t0]);
  const fleet = next;
  const todayFree = nextPerDay[0]?.free ?? 0;

  const flyable = next.reduce((t, f) => t + f.mission + f.free, 0);
  const booked = next.reduce((t, f) => t + f.mission, 0);
  const types = [...new Set(fleet.map((f) => f.aircraft.type))].sort();
  const maxFree = Math.max(1, fleet.length);
  const retired = data.aircraft.filter((a) => a.status === "Retired");
  const live = (s: string) => s !== "Cancelled";

  return (
    <>
      <div className="page-head">
        <h1>Fleet</h1>
        <button className="btn" onClick={() => open("aircraft", "new")}><Plus size={16} /> Add aircraft…</button>
        <button className="btn primary" onClick={() => open("support", "new")}><SearchCheck size={16} /> Can we take a job?…</button>
      </div>
      {fleet.length === 0 ? (
        <Empty icon={<Plane size={28} />} text="Add your aircraft by tail number to see what each one is doing." action={<button className="btn primary" onClick={() => open("aircraft", "new")}>Add aircraft…</button>} />
      ) : (
        <>
          <div className="tiles">
            <div className="tile"><div className="label">Free today</div><div className="value">{todayFree} <span className="muted small">of {fleet.length}</span></div></div>
            <div className="tile"><div className="label">Booked, next 90 days</div><div className="value">{flyable ? Math.round((booked / flyable) * 100) : 0}%</div></div>
            <div className="tile"><div className="label">Free aircraft-days, next 90 days</div><div className="value">{next.reduce((t, f) => t + f.free, 0)}</div></div>
            <div className="tile"><div className="label">Days with nothing free, next 90</div><div className={`value ${nextPerDay.some((d) => d.free === 0) ? "warn" : ""}`}>{nextPerDay.filter((d) => d.free === 0).length}</div></div>
          </div>

          <div className="row gap wrap" style={{ marginTop: 14 }}>
            <div className="seg">
              <button className={view === "status" ? "active" : ""} onClick={() => setView("status")}>Fleet status</button>
              <button className={view === "timeline" ? "active" : ""} onClick={() => setView("timeline")}>Timeline</button>
            </div>
          </div>
          {view === "status" && <FleetStatus />}
          {view === "timeline" && <>
          <div className="sched-bar" style={{ marginTop: 14 }}>
            <TimelineControls tl={tl} />
          </div>

          <div className="gantt" ref={tl.ref} {...tl.handlers}>
            <div className="gantt-grid">
              <div className="g-corner">Aircraft</div>
              <TimeHead tl={tl} />

              <div className="g-label sub"><span className="t">Free aircraft</span><span className="small muted">each day</span></div>
              <div className="g-lane sub" title="How many aircraft are free each day">
                <LaneBackdrop tl={tl} />
                {perDay.map(({ day, free }) => (
                  <div key={day} className={`free-tick ${free === 0 ? "none" : ""}`} title={`${format(day, "EEE, MMM d")}: ${plural(free, "aircraft", "aircraft")} free`}
                    style={{ left: `${pct(day)}%`, width: `${pct(dayAt(day, 1)) - pct(day)}%`, height: free ? `${Math.max(12, (free / maxFree) * 100)}%` : 4 }} />
                ))}
              </div>

              {types.map((type) => {
                const tails = fleet.filter((f) => f.aircraft.type === type);
                const freeNow = tails.filter((f) => f.days[Math.max(0, Math.round((t0 - from) / 86_400_000))]?.kind === "free").length;
                return (
                  <Fragment key={type}>
                    <div className="g-group">{type} <span className="muted" style={{ fontWeight: 400 }}>· {plural(tails.length, "aircraft", "aircraft")}{t0 >= from && t0 < to ? `, ${freeNow} free today` : ""}</span></div>
                    {tails.map((t) => {
                      const a = t.aircraft;
                      const missions = bookings(data).filter((m) => m.aircraftIds.includes(a.id) && live(m.status) && ms(m.end) > from && ms(m.start) < to);
                      const jobs = data.jobs.filter((j) => j.aircraftId === a.id && ms(j.end) > from && ms(j.start) < to);
                      return (
                        <Fragment key={a.id}>
                          <button className="g-label" onClick={() => open("aircraft", a.id)}>
                            <span className="t"><span style={{ fontFamily: "var(--zb-font-mono)" }}>{a.tail}</span> <StatusPill status={a.status} /></span>
                            <span className="small muted" title="Over the next 90 days">{a.base} · <b className="num">{Math.round(t.use * 100)}%</b> booked</span>
                          </button>
                          <div className="g-lane fleet-lane" title="Drag to move through time">
                            <LaneBackdrop tl={tl} />
                            {(wide.find((w) => w.aircraft.id === a.id)?.freeRuns ?? [])
                              // Split at today: the part already gone is drawn faintly, and the count is from today on.
                              .flatMap(([fa, fb]): [number, number][] => (fa < t0 && fb > t0 ? [[fa, t0], [t0, fb]] : [[fa, fb]]))
                              .filter(([fa, fb]) => fb > from && fa < to).map(([fa, fb]) => {
                              const open_ = fb >= horizon[1], since = fa <= horizon[0];
                              if (fb <= t0)
                                return <div key={`f${fa}`} className="slot free-run gone" style={{ left: `${pct(fa)}%`, width: `calc(${pct(fb) - pct(fa)}% - 2px)` }} title={`${a.tail} was free ${fmtDates(toWhen(fa), toWhen(fb))}`} />;
                              const what = open_ ? `from ${format(fa, "MMM d")} on` : since ? `until ${format(dayAt(fb, -1), "MMM d")}` : fmtDates(toWhen(fa), toWhen(fb));
                              return (
                                <button key={`f${fa}`} className="slot free-run" style={{ left: `${pct(fa)}%`, width: `calc(${pct(fb) - pct(fa)}% - 2px)` }}
                                  title={`${a.tail} is free ${what}. Tap to book a mission then.`}
                                  onClick={() => !tl.justDragged.current && open("season", "new", { aircraftIds: [a.id], start: toWhen(Math.max(fa, t0)), end: toWhen(fb > Math.max(fa, t0) && !open_ ? fb : dayAt(Math.max(fa, t0), 14)) })}>
                                  <span className="t">Free</span>
                                  <span className="s">{open_ ? `from ${fa === t0 ? "today" : format(fa, "MMM d")} on` : since ? `until ${format(dayAt(fb, -1), "MMM d")}` : `${plural(Math.round((fb - fa) / 86_400_000), "day")}${fa === t0 ? " from today" : `, ${format(fa, "MMM d")} to ${format(dayAt(fb, -1), "MMM d")}`}`}</span>
                                </button>
                              );
                            })}
                            {(() => {
                              // Down for its status (in maintenance, AOG), across the dates it's out.
                              const out = downSpan(a);
                              if (!out || a.status === "Retired") return null;
                              const fa = Math.max(out[0], from), fb = Math.min(out[1], to);
                              if (!(fb > fa)) return null;
                              return (
                                <button className={`slot down ${a.status === "AOG" ? "aog" : ""}`} style={{ left: `${pct(fa)}%`, width: `calc(${pct(fb) - pct(fa)}% - 2px)` }}
                                  title={`${a.tail} is ${a.status}${a.backOn ? `, expected back ${format(ms(`${a.backOn}T00:00`), "MMM d")}` : ", back not known"}`}
                                  onClick={() => !tl.justDragged.current && open("aircraft", a.id, undefined, { spot: "status" })}>
                                  <span className="t">{a.status}</span>
                                  <span className="s">{a.backOn ? `back ${format(ms(`${a.backOn}T00:00`), "MMM d")}` : "back not known"}</span>
                                </button>
                              );
                            })()}
                            {missions.map((m) => (
                              <button key={m.id} className={`slot ${m.status === "Done" ? "past" : ""}`} style={{ ...slotStyle(missionLook(m)), left: `${pct(ms(m.start))}%`, width: `calc(${pct(ms(m.end)) - pct(ms(m.start))}% - 2px)` }}
                                title={`${m.name}\n${fmtDates(m.start, m.end)}\n${m.status}`} onClick={() => !tl.justDragged.current && open("season", m.id)}>
                                <span className="t">{m.name}</span>
                                <span className="s">{fmtDates(m.start, m.end)}</span>
                              </button>
                            ))}
                          </div>
                          {/* Maintenance in its own thin row under the tail, lined up with the gap it leaves above. */}
                          <div className="g-label maint-label">Maintenance</div>
                          <div className="g-lane maint-lane" title="Drag to move through time">
                            <LaneBackdrop tl={tl} />
                            {jobs.map((j) => {
                              const clash = j.grounds && !j.done && missions.find((m) => m.status !== "Done" && ms(m.start) < ms(j.end) && ms(j.start) < ms(m.end));
                              const narrow = (ms(j.end) - ms(j.start)) / (to - from) < 0.045;
                              return (
                                <button key={j.id} className={`slot job ${j.grounds ? "grounds" : "light"} ${clash ? "clash" : ""} ${narrow ? "narrow" : ""}`}
                                  style={{ left: `${pct(ms(j.start))}%`, width: `calc(${pct(ms(j.end)) - pct(ms(j.start))}% - 2px)` }}
                                  title={`${clash ? `Conflict: during “${clash.name}”\n` : ""}${j.title}\n${fmtDates(j.start, j.end)}${j.grounds ? "\nThe aircraft can't fly." : "\nThe aircraft can still fly."}`}
                                  onClick={() => !tl.justDragged.current && open("job", j.id)}>
                                  <span className="t"><Wrench size={10} />{narrow ? "" : clash ? `Conflict: ${j.title}` : j.title}</span>
                                </button>
                              );
                            })}
                          </div>
                        </Fragment>
                      );
                    })}
                  </Fragment>
                );
              })}
            </div>
          </div>
          <TimelineHint />
          <div className="legend">
            <span><span className="swatch free-run" style={{ position: "static" }} />Free</span>
            <span><span className="swatch" style={{ background: "color-mix(in srgb, var(--zb-warn) 22%, var(--zb-surface))", border: "1px dashed var(--zb-warn)" }} />Maintenance (grounded)</span>
            <span><span className="swatch" style={{ background: "var(--zb-surface-3)", border: "1px dashed var(--zb-text-2)" }} />Check (still flies)</span>
            <span><span className="swatch" style={{ background: "var(--zb-orange)", width: 3 }} />Today</span>
            <span><span className="swatch" style={{ background: "color-mix(in srgb, var(--zb-danger) 22%, var(--zb-surface))", outline: "2px solid var(--zb-danger)" }} />Maintenance during a mission</span>
            <span><span className="swatch" style={{ background: "repeating-linear-gradient(45deg, var(--zb-surface-3) 0 4px, var(--zb-surface) 4px 8px)" }} />In maintenance, AOG</span>
            <span className="muted">Missions show in their own colors. Free windows count from today. Tap a free block to book it.</span>
          </div>
          </>}
          {retired.length > 0 && <p className="small muted">Retired: {retired.map((a) => a.tail).join(", ")}.</p>}
        </>
      )}
    </>
  );
}

/**
 * The fleet at a glance: how many tails are airworthy, in maintenance or AOG, then each tail with its status,
 * when it went down and is expected back, what it's doing today, its next booking and its latest log line.
 */
function FleetStatus() {
  const { data, open } = useStore();
  const t0 = today().getTime();
  const live = data.aircraft.filter((a) => a.status !== "Retired");
  const count = (s: Aircraft["status"]) => live.filter((a) => a.status === s).length;
  const types = [...new Set(live.map((a) => a.type))].sort();
  const now = useMemo(() => new Map(fleetUse(data, t0, dayAt(t0, 1)).map((f) => [f.aircraft.id, f.days[0]])), [data, t0]);
  const day = (iso: string) => format(new Date(`${iso}T00:00`), "MMM d");
  const next = (a: Aircraft) => bookings(data)
    .filter((b) => b.aircraftIds.includes(a.id) && b.status !== "Cancelled" && b.status !== "Done" && ms(b.start) > t0)
    .sort((x, y) => ms(x.start) - ms(y.start))[0];
  const last = (a: Aircraft) => [...(a.log ?? [])].sort((x, y) => x.on.localeCompare(y.on)).at(-1);
  const doing = (a: Aircraft) => {
    const u = now.get(a.id);
    if (!u || u.kind === "free") return <span style={{ color: "var(--zb-ok)" }}>Free today</span>;
    if (u.kind === "mission") return <>On <b>{u.mission.name}</b></>;
    if (u.kind === "maintenance") return <>Maintenance: {u.job.title}</>;
    return <span className="muted">Down</span>;
  };
  const downFor = (a: Aircraft) => (a.status === "AOG" || a.status === "In maintenance")
    ? <>{a.statusSince ? `Since ${day(a.statusSince)}` : "Down"}{" · "}{a.backOn ? <b>back {day(a.backOn)}</b> : <span className="muted">back not known</span>}</>
    : null;
  return (
    <>
      <div className="tiles" style={{ marginTop: 14 }}>
        <div className="tile"><div className="label">Airworthy</div><div className="value ok">{count("Airworthy")} <span className="muted small">of {live.length}</span></div></div>
        <div className="tile"><div className="label">In maintenance</div><div className={`value ${count("In maintenance") ? "warn" : ""}`}>{count("In maintenance")}</div></div>
        <div className="tile"><div className="label">AOG</div><div className={`value ${count("AOG") ? "danger" : ""}`}>{count("AOG")}</div></div>
        <div className="tile"><div className="label">Flying a mission today</div><div className="value">{live.filter((a) => now.get(a.id)?.kind === "mission").length}</div></div>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Tail</th><th>Status</th><th>Down</th><th>Today</th><th>Next booking</th><th>Base</th><th>Latest in the log</th></tr></thead>
          <tbody>
            {types.map((type) => (
              <Fragment key={type}>
                <tr className="group-row"><td colSpan={7}><b>{type}</b> <span className="muted small">· {plural(live.filter((a) => a.type === type).length, "aircraft", "aircraft")}</span></td></tr>
                {live.filter((a) => a.type === type).sort((x, y) => x.tail.localeCompare(y.tail)).map((a) => {
                  const n = next(a), l = last(a);
                  return (
                    <tr key={a.id} onClick={() => open("aircraft", a.id)}>
                      <td className="name mono">{a.tail}</td>
                      <td><StatusPill status={a.status} /></td>
                      <td className="small">{downFor(a) ?? <span className="muted">–</span>}</td>
                      <td className="small">{doing(a)}</td>
                      <td className="small">{n ? <>{n.name} <span className="muted">· {day(n.start.slice(0, 10))}</span></> : <span className="muted">None</span>}</td>
                      <td className="small">{a.base || <span className="muted">–</span>}</td>
                      <td className="small" style={{ maxWidth: 280 }}>{l ? <><span className="muted">{day(l.on)}:</span> {l.text}</> : <span className="muted">Nothing yet</span>}</td>
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <div className="cards-list">
        {[...live].sort((x, y) => x.type.localeCompare(y.type) || x.tail.localeCompare(y.tail)).map((a) => (
          <button key={a.id} className="list-card" onClick={() => open("aircraft", a.id)}>
            <span className="row gap-sm"><b className="mono">{a.tail}</b> <span className="small muted">{a.type}</span> <StatusPill status={a.status} /></span>
            {downFor(a) && <span className="small">{downFor(a)}</span>}
            <span className="small">{doing(a)}</span>
          </button>
        ))}
      </div>
      <p className="small muted">In maintenance and AOG keep a tail off every mission from the day it went down until it's expected back; missions booked on it then show under Needs attention. Tap a tail to change its status or read its log.</p>
    </>
  );
}
