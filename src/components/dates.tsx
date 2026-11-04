import { useState } from "react";
import { addDays, addMonths, differenceInCalendarDays, format, isSameMonth, startOfMonth, startOfWeek } from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useStore } from "../store";

/**
 * Picking dates. The date boxes stay (typing works, and so do the lessons), with a calendar beside them:
 * a month at a time, big days, the chosen days shaded, and days that can't be picked greyed out
 * (before the first day, or outside what's allowed, like a pilot's shift outside its season).
 * Dates are "2026-11-04" strings, inclusive. Out-of-range typing is pulled back inside the limits.
 */

const ymd = (d: Date) => format(d, "yyyy-MM-dd");
const day = (s: string) => new Date(`${s}T00:00`);
const clampTo = (s: string, min?: string, max?: string) => (min && s < min ? min : max && s > max ? max : s);

/** A month of days to tap. `pick` gets each tapped day. */
function Calendar({ month, setMonth, from, to, min, max, pick, picking }: {
  month: Date; setMonth: (d: Date) => void; from?: string; to?: string; min?: string; max?: string;
  pick: (d: string) => void; picking?: "first" | "last";
}) {
  const weekStartsOn = useStore((s) => s.data.settings.weekStart ?? 1);
  const start = startOfWeek(startOfMonth(month), { weekStartsOn });
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const weeks = days.slice(35).some((d) => isSameMonth(d, month)) ? 6 : 5;
  const today = ymd(new Date());
  const lowest = picking === "last" && from ? (min && min > from ? min : from) : min;
  const canBack = !min || ymd(addDays(startOfMonth(month), -1)) >= min;
  const canNext = !max || ymd(startOfMonth(addMonths(month, 1))) <= max;
  return (
    <div className="cal" role="group" aria-label={format(month, "MMMM yyyy")}>
      <div className="cal-head">
        <button type="button" className="icon-btn" aria-label="Previous month" disabled={!canBack} onClick={() => setMonth(addMonths(month, -1))}><ChevronLeft size={18} /></button>
        <b>{format(month, "MMMM yyyy")}</b>
        <button type="button" className="icon-btn" aria-label="Next month" disabled={!canNext} onClick={() => setMonth(addMonths(month, 1))}><ChevronRight size={18} /></button>
      </div>
      <div className="cal-grid">
        {days.slice(0, 7).map((d) => <span key={d.getDay()} className="cal-dow" aria-hidden="true">{format(d, "EEEEEE")}</span>)}
        {days.slice(0, weeks * 7).map((d) => {
          const s = ymd(d);
          const off = (lowest && s < lowest) || (max && s > max);
          const inRange = from && to && s >= from && s <= to;
          const cls = ["cal-day", isSameMonth(d, month) ? "" : "other", inRange ? "in" : "", s === from ? "from" : "", s === to ? "to" : "", s === today ? "today" : ""].join(" ");
          return (
            <button key={s} type="button" className={cls} disabled={!!off} aria-pressed={!!inRange} aria-label={format(d, "EEEE, MMMM d, yyyy")} onClick={() => pick(s)}>
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** First and last day, side by side, with a calendar to pick both. */
export function DateRange({ first, last, onChange, min, max, labels = ["First day", "Last day"], spot, note }: {
  first: string; last: string; onChange: (first: string, last: string) => void; min?: string; max?: string;
  labels?: [string, string]; spot?: string; note?: string;
}) {
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState<"first" | "last">("first");
  const [month, setMonth] = useState(() => startOfMonth(day(first || ymd(new Date()))));
  const bad = !!first && !!last && last < first;
  const days = first && last && !bad ? differenceInCalendarDays(day(last), day(first)) + 1 : 0;
  const setFirst = (v: string) => {
    const f = clampTo(v, min, max);
    onChange(f, last && last < f ? f : last);
  };
  const setLast = (v: string) => onChange(first, clampTo(v < first ? first : v, min, max));
  const pick = (s: string) => {
    if (picking === "first") {
      setFirst(s);
      setPicking("last");
    } else {
      setLast(s);
      setOpen(false);
      setPicking("first");
    }
  };
  return (
    <div className="full date-range" data-spot={spot}>
      <div className="date-row">
        <label className="field">
          <span>{labels[0]}</span>
          <input type="date" value={first} min={min} max={max} onChange={(e) => e.target.value && setFirst(e.target.value)} />
        </label>
        <label className="field">
          <span>{labels[1]}</span>
          <input type="date" value={last} min={first || min} max={max} onChange={(e) => e.target.value && setLast(e.target.value)} />
        </label>
        <button type="button" className={`btn cal-toggle ${open ? "on" : ""}`} aria-expanded={open} aria-label={open ? "Close the calendar" : "Pick on a calendar"}
          onClick={() => { setOpen(!open); setPicking("first"); setMonth(startOfMonth(day(first || ymd(new Date())))); }}>
          <CalendarDays size={18} />
        </button>
      </div>
      <div className="date-sum">
        {bad ? <span className="err">The last day can't be before the first day.</span>
          : days ? <span className="small muted">{format(day(first), "EEE, MMM d")} to {format(day(last), "EEE, MMM d, yyyy")} · {days === 1 ? "1 day" : `${days} days`}{note ? ` · ${note}` : ""}</span> : null}
      </div>
      {open && (
        <div className="cal-pop">
          <div className="cal-hint"><b>{picking === "first" ? `Tap the ${labels[0].toLowerCase()}` : `Now tap the ${labels[1].toLowerCase()}`}</b>
            {picking === "last" && <button type="button" className="link" onClick={() => setOpen(false)}>Keep {format(day(last), "MMM d")}</button>}
          </div>
          <Calendar month={month} setMonth={setMonth} from={first} to={last} min={min} max={max} pick={pick} picking={picking} />
        </div>
      )}
    </div>
  );
}

/** One date with a calendar beside it. `clearable` adds "No date" (training that never runs out). */
export function DateInput({ value, onChange, min, max, label, hint, clearable, ariaLabel, today }: {
  value: string; onChange: (v: string) => void; min?: string; max?: string; label?: string; hint?: string; clearable?: string; ariaLabel?: string;
  /** Show a Today button (when something was done just now). */
  today?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => startOfMonth(day(value || ymd(new Date()))));
  const set = (v: string) => onChange(v ? clampTo(v, min, max) : v);
  const box = (
    <span className="date-one">
      <input type="date" value={value} min={min} max={max} aria-label={ariaLabel} onChange={(e) => (e.target.value || clearable) && set(e.target.value)} />
      <button type="button" className={`btn cal-toggle ${open ? "on" : ""}`} aria-expanded={open} aria-label={open ? "Close the calendar" : "Pick on a calendar"}
        onClick={() => { setOpen(!open); setMonth(startOfMonth(day(value || ymd(new Date())))); }}>
        <CalendarDays size={18} />
      </button>
      {today && <button type="button" className="btn sm" onClick={() => set(ymd(new Date()))}>Today</button>}
    </span>
  );
  return (
    <div className="field date-single">
      {label && <span>{label}</span>}
      {box}
      {hint && <span className="hint">{hint}</span>}
      {open && (
        <div className="cal-pop">
          <Calendar month={month} setMonth={setMonth} from={value} to={value} min={min} max={max} pick={(s) => { set(s); setOpen(false); }} />
          {clearable && <button type="button" className="link" onClick={() => { onChange(""); setOpen(false); }}>{clearable}</button>}
        </div>
      )}
    </div>
  );
}
