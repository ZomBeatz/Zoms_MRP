import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { dayAt, fmtDates, fmtDay, plural, toWhen, today } from "../time";

/**
 * A stretch of days you can move through: Ctrl + scroll (or pinch) zooms from a week to a year; drag,
 * Shift + scroll or a sideways swipe moves through time; plain scrolling moves up and down the rows.
 * Shared by the Schedule and the Fleet page, so both behave the same. Put `ref` and `handlers` on the scrolling box; its `.g-head` measures the width.
 */
export function useTimeline(span: number, setSpan: (n: number) => void, back = 2) {
  const [start, setStart] = useState(() => dayAt(today(), -back));
  const from = start, to = dayAt(start, span);
  const pct = (t: number) => ((Math.min(Math.max(t, from), to) - from) / (to - from)) * 100;
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; start: number; px: number; moved: boolean } | null>(null);
  const justDragged = useRef(false);
  const live = useRef({ start, span });
  live.current = { start, span };
  const width = () => ref.current?.querySelector(".g-head")?.getBoundingClientRect().width ?? 800;
  const clampSpan = (n: number) => Math.min(365, Math.max(7, Math.round(n)));
  const setSpanRef = useRef(setSpan);
  setSpanRef.current = setSpan;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let acc = 0;
    let fspan = live.current.span; // the zoom as a fraction, so small pinch steps add up
    const pan = (px: number, n0: number, s0: number) => {
      acc += (px / width()) * n0;
      const step = Math.trunc(acc);
      if (!step) return;
      acc -= step;
      const s1 = dayAt(s0, step);
      live.current = { start: s1, span: n0 }; // fast scrolling sends several events before the next draw
      setStart(s1);
    };
    const onWheel = (e: WheelEvent) => {
      const { start: s0, span: n0 } = live.current;
      // Ctrl + scroll (or ⌘ + scroll), and a trackpad pinch, zoom around the pointer.
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        if (Math.round(fspan) !== n0) fspan = n0; // a preset or the slider changed it
        // A mouse wheel sends big steps; a pinch sends many small ones.
        const rate = Math.abs(e.deltaY) < 40 ? 1.008 : 1.0015;
        fspan = Math.min(365, Math.max(7, fspan * Math.pow(rate, e.deltaY)));
        const next = clampSpan(fspan);
        if (next === n0) return;
        const head = el.querySelector(".g-head")?.getBoundingClientRect();
        const frac = head ? Math.min(1, Math.max(0, (e.clientX - head.left) / head.width)) : 0.5;
        const s1 = dayAt(s0, Math.round(frac * n0 - frac * next));
        live.current = { start: s1, span: next };
        setStart(s1);
        setSpanRef.current(next);
        return;
      }
      // Shift + scroll, or a sideways swipe: move through time.
      if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        e.preventDefault();
        pan(Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY, n0, s0);
      }
      // Plain scrolling moves up and down the rows, like any page.
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const handlers = {
    onPointerDown: (e: React.PointerEvent) => {
      const t = e.target as HTMLElement;
      if (e.button !== 0 || t.closest("button, input, a, select")) return;
      if (!t.closest(".g-lane, .g-head")) return;
      drag.current = { x: e.clientX, start, px: width(), moved: false };
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    onPointerMove: (e: React.PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const dx = e.clientX - d.x;
      if (Math.abs(dx) > 4) d.moved = true;
      if (d.moved) setStart(dayAt(d.start, -Math.round((dx / d.px) * span)));
    },
    onPointerUp: () => {
      if (drag.current?.moved) {
        justDragged.current = true;
        setTimeout(() => (justDragged.current = false), 0);
      }
      drag.current = null;
    },
    onPointerCancel: () => (drag.current = null),
  };

  // Columns by the calendar: days for a week or two; months over day numbers or week starts beyond that.
  const days = Array.from({ length: span }, (_, i) => dayAt(start, i));
  const months = days.filter((d, i) => i === 0 || new Date(d).getDate() === 1);
  const ticks = span <= 14 ? [] : span <= 31 ? days : span <= 120 ? days.filter((d) => new Date(d).getDay() === 1) : months;
  const lines = span <= 31 ? days : span <= 120 ? ticks : months;
  const majors = span <= 14 ? days : months;
  const weekends = span <= 120 ? days.filter((d) => [0, 6].includes(new Date(d).getDay())) : [];

  return {
    start, setStart, span, setSpan: (n: number) => setSpan(clampSpan(n)), from, to, pct, ref, handlers, justDragged,
    scale: { days, months, ticks, lines, majors, weekends },
    /** The day at a point on a lane. */
    dayAtX: (x: number, box: DOMRect) => dayAt(from + ((x - box.left) / box.width) * (to - from)),
    back,
  };
}

export type Timeline = ReturnType<typeof useTimeline>;

/** Earlier / Today / Later, the range, presets and the zoom slider. */
export function TimelineControls({ tl }: { tl: Timeline }) {
  const { start, setStart, span, setSpan, from, to, back } = tl;
  return (
    <>
      <button className="icon-btn" aria-label="Earlier" onClick={() => setStart(dayAt(start, -Math.ceil(span / 2)))}><ChevronLeft size={18} /></button>
      <button className="btn sm" onClick={() => setStart(dayAt(today(), -back))}>Today</button>
      <button className="icon-btn" aria-label="Later" onClick={() => setStart(dayAt(start, Math.ceil(span / 2)))}><ChevronRight size={18} /></button>
      <span className="range">{fmtDates(toWhen(from), toWhen(to)).replace(/ \(.*\)$/, "")}</span>
      <div className="seg">
        {([[7, "Week"], [14, "2 weeks"], [30, "Month"], [90, "Quarter"], [365, "Year"]] as const).map(([n, label]) => (
          <button key={n} className={span === n ? "active" : ""} onClick={() => setSpan(n)}>{label}</button>
        ))}
      </div>
      <label className="row gap-sm small muted" title="How many days to show. Ctrl + scroll (or pinch) on the chart zooms too.">
        <span>1 week</span>
        {/* Styled so the knob reaches the very ends: at 7 or 365 days there's no track left past it. */}
        <input type="range" className="zoom-slider" min={7} max={365} value={span} onChange={(e) => setSpan(Number(e.target.value))}
          style={{ "--fill": `calc(7px + (100% - 14px) * ${(span - 7) / (365 - 7)})` } as React.CSSProperties} aria-label="Days shown" />
        <span>1 year</span>
        <b className="num" style={{ minWidth: 60, color: "var(--zb-text-2)" }}>{plural(span, "day")}</b>
      </label>
    </>
  );
}

/** A month over the dates. A month the range only clips gets a short name, or none, so it isn't cut off. */
function MonthLabel({ d, left, width }: { d: number; left: number; width: number }) {
  // The board is at least 680 px wide beside the names, so this is the narrowest a month can be.
  const px = (width / 100) * 680;
  return (
    <div className="g-day" style={{ left: `${left}%`, width: `${width}%` }} title={format(d, "MMMM yyyy")}>
      {px < 34 ? "" : px < 120 ? format(d, "MMM") : format(d, "MMMM yyyy")}
    </div>
  );
}

/** The date header: days for short spans, months over day numbers or week starts for longer ones. */
export function TimeHead({ tl }: { tl: Timeline }) {
  const { span, pct, to, scale } = tl;
  const t0 = today().getTime();
  return (
    <div className="g-head">
      {span <= 14
        ? scale.days.map((d) => (
            <div key={d} className={`g-day ${d === t0 ? "today" : ""}`} style={{ left: `${pct(d)}%`, width: `${100 / span}%` }}>
              {span <= 7 ? fmtDay(d) : format(d, "d")}
              <div className="muted small" style={{ fontWeight: 400 }}>{format(d, span <= 7 ? "EEEE" : "EEE")}</div>
            </div>
          ))
        : (span > 120 ? [] : scale.months).map((d, i) => (
            <MonthLabel key={d} d={d} left={pct(d)} width={pct(scale.months[i + 1] ?? to) - pct(d)} />
          ))}
      {span > 120 && <div className="g-day" style={{ left: 0, width: "100%" }}>{[...new Set(scale.days.map((d) => new Date(d).getFullYear()))].join(" to ")}</div>}
      {scale.ticks.map((t, i) => (
        <div key={t} className={`g-hour ${t === t0 ? "today" : ""}`}
          style={{ left: `${pct(t)}%`, width: `${span <= 31 ? 100 / span : pct(scale.ticks[i + 1] ?? to) - pct(t)}%` }}>
          {span <= 31 ? format(t, "d") : span <= 120 ? format(t, "MMM d") : format(t, "MMM")}
        </div>
      ))}
    </div>
  );
}

/** Day and month lines, weekend shading and the today line, for the back of a lane. */
export function LaneBackdrop({ tl }: { tl: Timeline }) {
  const { pct, scale, from, to } = tl;
  // Everything is whole days, so "today" starts at midnight (where free windows split too).
  const now = today().getTime();
  const w = (d: number) => pct(dayAt(d, 1)) - pct(d);
  return (
    <>
      {scale.weekends.map((d) => <div key={`w${d}`} className="g-weekend" style={{ left: `${pct(d)}%`, width: `${w(d)}%` }} />)}
      {scale.lines.map((d) => <div key={d} className="g-line minor" style={{ left: `${pct(d)}%` }} />)}
      {scale.majors.map((d) => <div key={`M${d}`} className="g-line" style={{ left: `${pct(d)}%` }} />)}
      {now >= from && now < to && <div className="g-now" style={{ left: `${pct(now)}%` }} />}
    </>
  );
}

/** How to get around the chart (not shown on touch screens, which pinch and swipe anyway). */
export function TimelineHint() {
  return (
    <p className="small muted kbd-hint" style={{ margin: "8px 0 0" }}>
      <kbd>Ctrl</kbd> + scroll or pinch to zoom. Drag, <kbd>Shift</kbd> + scroll or swipe sideways to move through time. Scroll to see more rows.
    </p>
  );
}
