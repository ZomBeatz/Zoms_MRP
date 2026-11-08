import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { LaneBackdrop, TimeHead, TimelineControls, TimelineHint, useTimeline } from "../components/timeline";
import { StickyNote, Wrench } from "lucide-react";
import { bookings } from "../bookings";
import { onTail } from "../slots";
import { byId, useStore } from "../store";
import { missionCoverage, requiredTraining, trainingStatus, whoCanCover, type Issue } from "../coverage";
import { fmtRotation, offRotationSpans, seasonTails, seasonTypes } from "../rotation";
import { dayAt, fmtDates, fmtRange, ms, overlaps, toWhen, today } from "../time";
import { missionLook, slotStyle } from "../look";
import { Avatar, StatusPill } from "../components/ui";
import type { AppData, Booking, Person, Settings } from "../types";
import { format } from "date-fns";
import { move, partnerOf, trim, type Edge } from "../trim";

/**
 * The Gantt chart: time runs left to right, one row per mission, aircraft or person.
 * Each slot is drawn in its mission's color and pattern.
 */

interface Bar {
  key: string;
  a: number;
  b: number;
  title: string;
  sub?: string;
  tip: string;
  className?: string;
  style?: CSSProperties;
  onClick: () => void;
  icon?: ReactNode;
  /** A crew shift: its ends can be dragged to change its dates. */
  shiftId?: string;
}

interface Row {
  key: string;
  label: ReactNode;
  sub?: boolean;
  bars: Bar[];
  /** Spans drawn behind the bars: time off, and days off their own rotation. */
  shade?: [number, number][];
  rotationOff?: [number, number][];
  /** Clicking empty space here adds a mission with these values. */
  addDefaults?: Record<string, unknown>;
  onLabel?: () => void;
  /** A person's row: shifts can be dropped on it to give them to this person. */
  personId?: string;
}

type Section = { heading?: string; rows: Row[] };

const VIEWS: { id: Settings["scheduleGroup"]; label: string }[] = [
  { id: "aircraft", label: "Aircraft" },
  { id: "missions", label: "Missions" },
  { id: "people", label: "Crew" },
];

/** Put overlapping bars on separate tracks so none hide another. */
function pack(bars: Bar[]): { bar: Bar; track: number }[] & { tracks?: number } {
  const ends: number[] = [];
  const out = [...bars].sort((x, y) => x.a - y.a).map((bar) => {
    let t = ends.findIndex((e) => e <= bar.a);
    if (t < 0) t = ends.length;
    ends[t] = bar.b;
    return { bar, track: t };
  }) as { bar: Bar; track: number }[] & { tracks?: number };
  out.tracks = Math.max(1, ends.length);
  return out;
}

export function Schedule({ issues }: { issues: Issue[] }) {
  const { data, open, updateSettings } = useStore();
  const { scheduleSpan: span, scheduleGroup: view } = data.settings;
  // Opens a couple of days back, so what's running now shows where it started.
  const tl = useTimeline(span, (n) => updateSettings({ scheduleSpan: n }));
  const { from, to, pct, justDragged } = tl;
  // Narrow everything to one mission, picked from a list.
  const [missionId, setMissionId] = useState("");

  const sections = useMemo(() => buildRows(data, view, from, to, issues, open, missionId), [data, view, from, to, issues, open, missionId]);
  const shown = sections.filter((s) => s.rows.length);

  // Keys: ← → move through time, T today, + − zoom (not while typing or in a form).
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.ctrlKey || e.metaKey || e.altKey || useStore.getState().editing || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) return;
      const step = Math.max(1, Math.round(tl.span / 4));
      if (e.key === "ArrowLeft") tl.setStart(dayAt(tl.start, -step));
      else if (e.key === "ArrowRight") tl.setStart(dayAt(tl.start, step));
      else if (e.key === "t" || e.key === "T") tl.setStart(dayAt(today(), -tl.back));
      else if (e.key === "+" || e.key === "=") tl.setSpan(tl.span * 0.7);
      else if (e.key === "-") tl.setSpan(tl.span / 0.7);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [tl]);

  // Dragging a shift's end, like trimming a clip; a handover (the next shift starting that day) moves with it.
  const change = useStore((s) => s.change);
  const [trimming, setTrimming] = useState<{ shiftId: string; edge: Edge | "move"; x0: number; y0: number; dayPx: number; by: number; solo: boolean; engaged: boolean; target?: string } | null>(null);
  const trimmed = useRef(false);
  const preview = trimming
    ? trimming.edge === "move" ? { ...move(data, trimming.shiftId, trimming.by), partner: undefined } : trim(data, trimming.shiftId, trimming.edge, trimming.by, trimming.solo)
    : null;
  const previewOf = (id?: string) => (preview && id ? preview.data.shifts.find((s) => s.id === id && (s.id === trimming!.shiftId || s.id === preview.partner?.id)) : undefined);
  // Shifts handing over to someone at their end (or from someone at their start): a seam to show.
  const seams = useMemo(() => {
    // Only where the handover partner is known (linked, or the only one that meets it).
    const role = new Map(data.people.map((p) => [p.id, p.role]));
    const starts = new Set(data.shifts.map((s) => `${s.seasonId}|${role.get(s.personId)}|${s.start}`));
    return new Set(data.shifts.filter((s) => starts.has(`${s.seasonId}|${role.get(s.personId)}|${s.end}`) && partnerOf(data, s, "end")).map((s) => s.id));
  }, [data]);
  const startTrim = (e: React.PointerEvent, shiftId: string, edge: Edge) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const lane = (e.currentTarget as HTMLElement).closest(".g-lane")!.getBoundingClientRect();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setTrimming({ shiftId, edge, x0: e.clientX, y0: e.clientY, dayPx: lane.width / span, by: 0, solo: e.altKey, engaged: true });
  };
  /** Pressing the middle of a shift: once it moves a few pixels, it's being dragged (else it's a tap). */
  const startMove = (e: React.PointerEvent, shiftId: string) => {
    // With a finger, dragging the middle of a bar scrolls the page; only a mouse or pen moves the shift.
    if (e.button !== 0 || e.pointerType === "touch" || (e.target as HTMLElement).closest(".slot-edge")) return;
    e.stopPropagation();
    const lane = (e.currentTarget as HTMLElement).closest(".g-lane")!.getBoundingClientRect();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setTrimming({ shiftId, edge: "move", x0: e.clientX, y0: e.clientY, dayPx: lane.width / span, by: 0, solo: false, engaged: false });
  };
  const moveTrim = (e: React.PointerEvent) => {
    if (!trimming) return;
    if (!trimming.engaged && Math.abs(e.clientX - trimming.x0) < 6 && Math.abs(e.clientY - trimming.y0) < 6) return;
    const by = Math.round((e.clientX - trimming.x0) / trimming.dayPx);
    // Over another person's row: dropping gives them the shift.
    const target = trimming.edge === "move" ? (document.elementFromPoint(e.clientX, e.clientY)?.closest(".g-lane") as HTMLElement | null)?.dataset.person : undefined;
    if (!trimming.engaged || by !== trimming.by || e.altKey !== trimming.solo || target !== trimming.target) setTrimming({ ...trimming, by, solo: e.altKey, engaged: true, target });
  };
  const endMove = (t: NonNullable<typeof trimming>) => {
    trimmed.current = true;
    setTimeout(() => (trimmed.current = false), 0);
    const r = move(data, t.shiftId, t.by);
    const s = r.data.shifts.find((x) => x.id === t.shiftId)!;
    const who = (id: string) => data.people.find((p) => p.id === id)?.name ?? "Someone";
    if (t.target && t.target !== s.personId) {
      // Only to someone who can legally take it on those days.
      const b = bookings(data).find((x) => x.id === s.seasonId)!;
      const m = data.missions.find((x) => x.id === b.missionId);
      const role = data.people.find((p) => p.id === s.personId)?.role ?? "Pilot";
      const c = whoCanCover(r.data, role, ms(s.start), ms(s.end), seasonTypes(data, b), [s.id], m ? requiredTraining(data, m, role) : [], b.missionId).find((x) => x.person.id === t.target);
      if (!c || !c.ok) {
        const why = !c ? `isn't a ${role.toLowerCase()}` : !c.qualified ? "isn't rated on the aircraft" : !c.trained ? "isn't current on the training" : !c.current ? "hasn't flown the type lately" : c.off ? "has time off then" : !c.onRotation ? "is off rotation then" : "is booked elsewhere then";
        useStore.getState().showToast(`${who(t.target)} can't take it: ${who(t.target).split(" ")[0]} ${why}.`);
        return;
      }
      change(() => ({ ...r.data, shifts: r.data.shifts.map((x) => (x.id === s.id ? { ...x, personId: t.target!, after: undefined } : x)) }), `${who(t.target)} takes ${fmtDates(s.start, s.end)} on ${b.name}`);
      return;
    }
    if (!r.moved) return;
    change(() => r.data, `${who(s.personId)}'s shift moved to ${fmtDates(s.start, s.end)}`);
  };
  const endTrim = () => {
    if (!trimming) return;
    const t = trimming;
    setTrimming(null);
    if (!t.engaged) return; // a tap: the bar's click opens the season
    if (t.edge === "move") return endMove(t);
    const r = trim(data, t.shiftId, t.edge, t.by, t.solo);
    if (!r.moved) return;
    trimmed.current = true;
    setTimeout(() => (trimmed.current = false), 0);
    const s = r.data.shifts.find((x) => x.id === t.shiftId)!;
    const who = (id: string) => data.people.find((p) => p.id === id)?.name ?? "Someone";
    const day = format(t.edge === "end" ? ms(s.end) - 1 : ms(s.start), "MMM d");
    change(() => r.data, `${who(s.personId)}'s ${t.edge === "end" ? "last" : "first"} day is now ${day}${r.partner ? `; ${who(r.partner.personId)} ${t.edge === "end" ? "starts" : "finishes"} ${t.edge === "end" ? format(ms(s.end), "MMM d") : format(ms(s.start) - 1, "MMM d")}` : ""}`);
  };

  const lane = (r: Row) => {
    const packed = pack(r.bars.filter((b) => b.b > from && b.a < to));
    const tracks = packed.tracks ?? 1;
    const minH = r.sub ? 34 : 44;
    const trackH = tracks > 1 ? 26 : minH - 10;
    const height = Math.max(minH, tracks * trackH + 10);
    return (
      <div
        data-person={r.personId}
        className={`g-lane ${r.sub ? "sub" : ""} ${trimming?.edge === "move" && trimming.engaged && trimming.target && trimming.target === r.personId ? "drop" : ""}`}
        style={{ height }}
        title={r.addDefaults ? "Drag to move through time. Tap empty space to add a mission here." : "Drag to move through time."}
        onClick={(e) => {
          if (justDragged.current || !r.addDefaults || e.target !== e.currentTarget) return;
          const day = tl.dayAtX(e.clientX, e.currentTarget.getBoundingClientRect());
          open("season", "new", { ...r.addDefaults, start: toWhen(day), end: toWhen(dayAt(day, 14)) });
        }}
      >
        <LaneBackdrop tl={tl} />
        {r.rotationOff?.map(([a, b], i) => b > from && a < to && <div key={`r${i}`} className="g-offrot" title="Off rotation" style={{ left: `${pct(a)}%`, width: `${pct(b) - pct(a)}%` }} />)}
        {r.shade?.map(([a, b], i) => b > from && a < to && <div key={i} className="g-off" style={{ left: `${pct(a)}%`, width: `${pct(b) - pct(a)}%` }} />)}
        {packed.map(({ bar, track }) => {
          const pv = previewOf(bar.shiftId);
          const a = pv ? ms(pv.start) : bar.a, b = pv ? ms(pv.end) : bar.b;
          const live = !!pv;
          return (
          <button
            key={bar.key}
            className={`slot ${bar.className ?? ""} ${bar.shiftId ? "trimmable" : ""} ${live ? "trimming" : ""}`}
            title={bar.shiftId ? `${bar.tip}\nDrag either end to change the dates.` : bar.tip}
            onClick={() => !trimmed.current && bar.onClick()}
            onPointerDown={bar.shiftId ? (e) => startMove(e, bar.shiftId!) : undefined}
            onPointerMove={bar.shiftId ? moveTrim : undefined}
            onPointerUp={bar.shiftId ? endTrim : undefined}
            onPointerCancel={bar.shiftId ? () => setTrimming(null) : undefined}
            style={{
              ...bar.style,
              left: `${pct(a)}%`,
              width: `max(4px, calc(${pct(b) - pct(a)}% - 2px))`,
              ...(tracks > 1 ? { top: 5 + track * trackH, bottom: "auto", height: trackH - 3 } : {}),
            }}
          >
            <span className="t">{bar.icon}{bar.title}</span>
            {bar.sub && trackH > 30 && <span className="s">{bar.sub}</span>}
            {bar.shiftId && (["start", "end"] as const).map((edge) => (
              <span key={edge} className={`slot-edge ${edge}`} aria-hidden="true"
                onPointerDown={(e) => startTrim(e, bar.shiftId!, edge)} onPointerMove={moveTrim} onPointerUp={endTrim} onPointerCancel={() => setTrimming(null)}
                onClick={(e) => e.stopPropagation()} />
            ))}
            {bar.shiftId && seams.has(bar.shiftId) && <span className="slot-seam" aria-hidden="true" title="Handover: dragging this end moves the next person's start too (hold Alt or Option to move just this one)">⇄</span>}
            {live && trimming && trimming.engaged && (pv!.id === trimming.shiftId) && (
              <span className={`trim-tip ${trimming.edge === "move" ? "start" : trimming.edge}`}>
                {trimming.edge === "move" ? `${format(a, "MMM d")} to ${format(b - 1, "MMM d")}${trimming.target && trimming.target !== pv!.personId ? ` → ${data.people.find((x) => x.id === trimming.target)?.name ?? ""}` : ""}`
                  : trimming.edge === "end" ? `Last day ${format(b - 1, "MMM d")}` : `First day ${format(a, "MMM d")}`}
                {preview?.partner ? ` ⇄ ${data.people.find((p) => p.id === preview.partner!.personId)?.name ?? ""}` : ""}
              </span>
            )}
          </button>
          );
        })}
      </div>
    );
  };

  return (
    <>
      <div className="page-head">
        <h1>Schedule</h1>
        <div className="seg" role="tablist" aria-label="Rows">
          {VIEWS.map((v) => (
            <button key={v.id} className={view === v.id ? "active" : ""} onClick={() => updateSettings({ scheduleGroup: v.id })}>{v.label}</button>
          ))}
        </div>
      </div>
      <div className="sched-bar">
        <TimelineControls tl={tl} />
        <span className="grow" />
        <select value={missionId} onChange={(e) => setMissionId(e.target.value)} aria-label="Show one mission" style={{ maxWidth: 240 }}>
          <option value="">All missions</option>
          {[...data.missions].sort((a, b) => a.name.localeCompare(b.name)).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>

      <div className="gantt" ref={tl.ref} {...tl.handlers}>
        <div className="gantt-grid">
          <div className="g-corner">{VIEWS.find((v) => v.id === view)?.label}</div>
          <TimeHead tl={tl} />
          {shown.length === 0 && (
            <div style={{ gridColumn: "1 / -1" }} className="empty">
              <p>{missionId ? "Nothing for this mission in these dates." : emptyText(view)}</p>
              {!missionId && <button className="btn primary" onClick={() => open(view === "aircraft" ? "aircraft" : view === "people" ? "person" : "mission", "new")}>{addText(view)}</button>}
            </div>
          )}
          {shown.map((s, si) => (
            <Fragment key={s.heading ?? si}>
              {s.heading && <div className="g-group">{s.heading}</div>}
              {s.rows.map((r) => (
                <Fragment key={r.key}>
                  {r.onLabel ? (
                    <button className={`g-label ${r.sub ? "sub" : ""}`} onClick={r.onLabel}>{r.label}</button>
                  ) : (
                    <div className={`g-label ${r.sub ? "sub" : ""}`}>{r.label}</div>
                  )}
                  {lane(r)}
                </Fragment>
              ))}
            </Fragment>
          ))}
        </div>
      </div>
      <TimelineHint />
      <Legend data={data} view={view} />
    </>
  );
}


const emptyText = (v: Settings["scheduleGroup"]) =>
  ({ missions: "No missions in these days.", aircraft: "No aircraft yet.", people: "No crew yet." })[v];
const addText = (v: Settings["scheduleGroup"]) =>
  ({ missions: "New mission…", aircraft: "Add aircraft…", people: "Add a person…" })[v];


function Legend({ data, view }: { data: AppData; view: Settings["scheduleGroup"] }) {
  return (
    <div className="legend">
      {data.missions.map((m) => (
        <span key={m.id}><span className="swatch" style={slotStyle(missionLook(m))} />{m.name}</span>
      ))}
      {<span><span className="swatch" style={{ background: "var(--zb-surface-3)", border: "1px dashed var(--zb-text-2)" }} />Maintenance</span>}
      {<span><span className="swatch" style={{ background: "color-mix(in srgb, var(--zb-warn) 22%, var(--zb-surface))", border: "1px dashed var(--zb-warn)" }} />Grounds the aircraft</span>}
      <span><span className="swatch" style={{ border: "2px dashed var(--zb-danger)" }} />Open seat</span>
      {view === "people" && <span><span className="swatch g-off" style={{ position: "static" }} />Time off</span>}
      {view === "people" && <span><span className="swatch g-offrot" style={{ position: "static" }} />Off rotation</span>}
      <span><span className="swatch" style={{ background: "var(--zb-orange)", width: 3 }} />Today</span>
    </div>
  );
}

function buildRows(
  data: AppData, view: Settings["scheduleGroup"], from: number, to: number, issues: Issue[],
  open: (kind: "mission" | "season" | "aircraft" | "person" | "job" | "timeOff" | "training" | "support", id: string, defaults?: Record<string, unknown>) => void,
  missionId = "",
): Section[] {
  const aircraft = byId(data.aircraft);
  const people = byId(data.people);
  const missions = byId(bookings(data));
  const inView = (a: string, b: string) => overlaps(ms(a), ms(b), from, to);
  const troubled = new Set(issues.filter((i) => i.severity === "danger" && i.seasonId).map((i) => i.seasonId));
  const personTrouble = new Set(issues.filter((i) => i.severity === "danger" && i.personId).map((i) => `${i.personId}:${i.seasonId ?? ""}`));

  const missionBar = (m: Booking): Bar => {
    const tails = seasonTails(data, m, "No aircraft");
    return {
      key: `m-${m.id}`, a: ms(m.start), b: ms(m.end), title: m.name,
      sub: `${tails} · ${fmtDates(m.start, m.end)}`,
      tip: `${m.name}${m.contact ? `\n${m.contact}` : ""}\n${fmtRange(m.start, m.end)}\nAircraft: ${tails}\nStatus: ${m.status}`,
      className: `${m.status === "Cancelled" ? "cancelled" : ""} ${troubled.has(m.id) ? "problem" : ""}`,
      style: slotStyle(missionLook(m)),
      onClick: () => open("season", m.id),
    };
  };
  const jobBar = (j: AppData["jobs"][0]): Bar => {
    const ac = aircraft.get(j.aircraftId);
    return {
      key: `j-${j.id}`, a: ms(j.start), b: ms(j.end), title: j.title, icon: <Wrench size={11} />,
      sub: `${ac?.tail ?? ""} · ${j.kind}${j.grounds ? " · grounded" : ""}`,
      tip: `${j.title} (${j.kind})\n${ac?.tail ?? ""}\n${fmtRange(j.start, j.end)}${j.grounds ? "\nThe aircraft can't fly during this job." : ""}`,
      className: `job ${j.grounds ? "grounds" : ""}`,
      onClick: () => open("job", j.id),
    };
  };
  const gapBars = (m: Booking): Bar[] =>
    m.status === "Cancelled" || m.status === "Done"
      ? []
      : missionCoverage(data, m).pilotGaps.map((g) => ({
          key: `g-${m.id}-${g.a}`, a: g.a, b: g.b, title: `${g.short} open`, tip: `${m.name}: ${g.short} pilot seat${g.short > 1 ? "s" : ""} open, ${fmtDates(toWhen(g.a), toWhen(g.b))}`,
          onClick: () => open("season", m.id),
        }));

  const visibleMissions = bookings(data).filter((m) => inView(m.start, m.end) && (!missionId || m.missionId === missionId)).sort((x, y) => ms(x.start) - ms(y.start));
  const chosen = data.missions.find((m) => m.id === missionId);

  if (view === "missions") {
    return [{
      rows: visibleMissions.flatMap((m) => {
        // Only the people with a shift in the dates on screen get a row.
        const shifts = data.shifts.filter((s) => s.seasonId === m.id && inView(s.start, s.end));
        const crew = [...new Set(shifts.map((s) => s.personId))]
          .map((id) => people.get(id)!)
          .filter(Boolean)
          .sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === "Pilot" ? -1 : 1));
        const gaps = gapBars(m).filter((g) => overlaps(g.a, g.b, from, to)).map(asGap);
        const rows: Row[] = [{
          key: m.id,
          label: (
            <>
              <span className="t ellipsis"><span className="swatch" style={{ ...slotStyle(missionLook(m)), width: 12, height: 12 }} />{m.name}</span>
              <span className="small muted ellipsis">{seasonTails(data, m, "No aircraft")} · <StatusPill status={m.status} /></span>
            </>
          ),
          bars: [missionBar(m)],
          onLabel: () => open("season", m.id),
        }];
        for (const p of crew)
          rows.push({
            key: `${m.id}-${p.id}`, sub: true,
            label: <span className="t ellipsis"><Avatar person={p} />{p.name}</span>,
            onLabel: () => open("person", p.id),
            bars: shifts.filter((s) => s.personId === p.id).map((s) => ({
              key: `s-${s.id}`, a: ms(s.start), b: ms(s.end), title: p.role === "Pilot" ? "Flying" : "On call", sub: s.note || fmtDates(s.start, s.end), icon: s.note ? <StickyNote size={11} /> : undefined,
              tip: `${p.name} on ${m.name}\n${fmtRange(s.start, s.end)}${s.note ? `\nNote: ${s.note}` : ""}`,
              className: personTrouble.has(`${p.id}:${m.id}`) || personTrouble.has(`${p.id}:`) ? "problem" : "",
              style: slotStyle(missionLook(m)), onClick: () => open("season", m.id), shiftId: s.id,
            })),
            shade: data.timeOff.filter((t) => t.personId === p.id).map((t) => [ms(t.start), ms(t.end)]),
          });
        if (gaps.length)
          rows.push({
            key: `${m.id}-gaps`, sub: true,
            label: <span className="t" style={{ color: "var(--zb-danger)" }}>Open pilot seats</span>,
            bars: gaps,
          });
        return rows;
      }),
    }];
  }

  if (view === "aircraft") {
    // With a mission picked, just the aircraft it flies.
    const its = chosen ? new Set(bookings(data).filter((m) => m.missionId === chosen.id).flatMap((m) => m.aircraftIds)) : null;
    return [{
      rows: data.aircraft
        .filter((a) => a.status !== "Retired" && (!its || its.has(a.id)))
        .sort((a, b) => a.tail.localeCompare(b.tail))
        .map((a) => ({
          key: a.id,
          label: (
            <>
              <span className="t">{a.tail}</span>
              <span className="small muted ellipsis">{a.type} · <StatusPill status={a.status} /></span>
            </>
          ),
          onLabel: () => open("aircraft", a.id),
          addDefaults: { aircraftIds: [a.id] },
          bars: [
            ...visibleMissions.filter((m) => m.aircraftIds.includes(a.id)).map((m) => missionBar(onTail(m, a.id))),
            ...data.jobs.filter((j) => j.aircraftId === a.id && !j.done && inView(j.start, j.end)).map(jobBar),
          ],
        })),
    }];
  }

  // Crew. Open seats first, so a gap and the people who could fill it are on one screen.
  const openSeats: Row[] = visibleMissions
    .filter((m) => m.status !== "Cancelled" && m.status !== "Done")
    .flatMap((m) => {
      const cov = missionCoverage(data, m);
      const bars = [
        ...cov.pilotGaps.map((g) => ({ ...g, word: "pilot" })),
        ...cov.maintainerGaps.map((g) => ({ ...g, word: "maintainer" })),
      ]
        .filter((g) => overlaps(g.a, g.b, from, to))
        .map((g): Bar => asGap({
          key: `og-${m.id}-${g.word}-${g.a}`, a: g.a, b: g.b, title: `${g.short} ${g.word}${g.short > 1 ? "s" : ""} open`,
          tip: `${m.name}: ${g.short} ${g.word} seat${g.short > 1 ? "s" : ""} open, ${fmtDates(toWhen(g.a), toWhen(g.b))}`,
          onClick: () => open("season", m.id),
        }));
      if (!bars.length) return [];
      return [{
        key: `open-${m.id}`, bars, onLabel: () => open("season", m.id),
        label: <span className="t ellipsis"><span className="swatch" style={{ ...slotStyle(missionLook(m)), width: 12, height: 12 }} />{m.name}</span>,
      }];
    });

  const personRow = (p: Person): Row => {
    const off = data.timeOff.filter((t) => t.personId === p.id);
    return {
      key: p.id,
      label: (
        <>
          <span className="t ellipsis"><Avatar person={p} />{p.name}</span>
          <span className="small muted ellipsis">{p.rotation ? `${fmtRotation(p.rotation)} · ` : ""}{p.quals.join(", ") || "No qualifications yet"}</span>
        </>
      ),
      onLabel: () => open("person", p.id),
      personId: p.id,
      shade: off.filter((t) => !t.soft).map((t) => [ms(t.start), ms(t.end)] as [number, number]),
      rotationOff: offRotationSpans(p, from, to),
      bars: [
        ...data.shifts
          .filter((s) => s.personId === p.id && inView(s.start, s.end))
          .map((s): Bar | null => {
            const m = missions.get(s.seasonId);
            if (!m) return null;
            const tails = seasonTails(data, m, "No aircraft");
            return {
              key: `s-${s.id}`, a: ms(s.start), b: ms(s.end), title: m.name, sub: s.note || tails, icon: s.note ? <StickyNote size={11} /> : undefined,
              tip: `${p.name} on ${m.name}\n${fmtRange(s.start, s.end)}\n${tails}${s.note ? `\nNote: ${s.note}` : ""}`,
              className: `${m.status === "Cancelled" ? "cancelled" : ""} ${personTrouble.has(`${p.id}:${m.id}`) || personTrouble.has(`${p.id}:`) ? "problem" : ""}`,
              style: slotStyle(missionLook(m)), onClick: () => open("season", m.id), shiftId: s.id,
            };
          })
          .filter((b): b is Bar => !!b),
        ...data.jobs.filter((j) => j.maintainerIds.includes(p.id) && !j.done && inView(j.start, j.end)).map(jobBar),
        ...off.filter((t) => inView(t.start, t.end)).map((t): Bar => ({
          key: `o-${t.id}`, a: ms(t.start), b: ms(t.end), title: t.soft ? `Rather not${t.reason ? `: ${t.reason}` : ""}` : t.reason || "Time off",
          tip: `${p.name}: ${t.soft ? "would rather not work" : t.reason || "Time off"}${t.soft && t.reason ? ` (${t.reason})` : ""}\n${fmtRange(t.start, t.end)}${t.soft ? "\nA preference: they can still be booked." : ""}`,
          className: t.soft ? "off soft" : "off", onClick: () => open("timeOff", t.id),
        })),
      ],
    };
  };
  const byRoleThenName = (a: Person, b: Person) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === "Pilot" ? -1 : 1);
  const seats: Section[] = openSeats.length ? [{ heading: "Open seats", rows: openSeats }] : [];

  if (chosen) {
    // The mission's crew, then everyone else who's rated on its aircraft and current on its training today.
    const ids = new Set(data.seasons.filter((x) => x.missionId === chosen.id).map((x) => x.id));
    const onIt = data.people.filter((p) => p.missionIds.includes(chosen.id) || data.shifts.some((s) => s.personId === p.id && ids.has(s.seasonId)));
    const types = [...new Set(bookings(data).filter((m) => m.missionId === chosen.id).flatMap((m) => seasonTypes(data, m)))];
    const now = Date.now();
    const qualified = data.people.filter((p) => !onIt.includes(p)
      && (!types.length || types.some((t) => p.quals.includes(t)))
      && requiredTraining(data, chosen, p.role).every((tid) => trainingStatus(p, tid, now, now + 1).state === "ok"));
    return [
      ...seats,
      { heading: `On ${chosen.name}`, rows: onIt.sort(byRoleThenName).map(personRow) },
      { heading: "Rated and current, not on this mission", rows: qualified.sort(byRoleThenName).map(personRow) },
    ];
  }
  return [
    ...seats,
    { heading: "Pilots", rows: data.people.filter((p) => p.role === "Pilot").sort(byRoleThenName).map(personRow) },
    { heading: "Maintainers", rows: data.people.filter((p) => p.role === "Maintainer").sort(byRoleThenName).map(personRow) },
  ];
}

/** Open seats are drawn as dashed red outlines, not filled slots. */
function asGap(b: Bar): Bar {
  return { ...b, className: "gap-outline", style: { background: "color-mix(in srgb, var(--zb-danger) 8%, transparent)", border: "2px dashed var(--zb-danger)", color: "var(--zb-danger)", boxShadow: "none" } };
}
