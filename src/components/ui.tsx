import { useEffect, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import type { AircraftStatus, MissionStatus, Person } from "../types";
import { PATTERNS, SWATCHES, slotStyle } from "../look";
import type { Pattern } from "../types";

export interface Tab { key: string; label: ReactNode; /** A red dot: something on this tab needs a look. */ alert?: boolean }

/**
 * A form over the page. The title, a summary line and the tabs stay at the top and the buttons stay
 * at the bottom; only the middle scrolls. On a phone it fills the screen.
 */
/** Focus a form's first box only with a mouse: on a touch screen it would pop up the keyboard over the form. */
export const autoFocusBox = typeof matchMedia === "function" && matchMedia("(hover: hover) and (pointer: fine)").matches;

export function Dialog({ title, onClose, children, foot, wide, icon, meta, tabs, tab, onTab }: {
  title: ReactNode; onClose: () => void; children: ReactNode; foot: ReactNode; wide?: boolean;
  /** A swatch or avatar before the title. */ icon?: ReactNode;
  /** The thing at a glance, under the title. */ meta?: ReactNode;
  tabs?: Tab[]; tab?: string; onTab?: (key: string) => void;
}) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`dialog ${wide ? "wide" : ""} ${tabs ? "tabbed" : ""}`} role="dialog" aria-modal="true">
        <div className="dialog-head">
          <div className="dialog-title">
            {icon}
            <h2>{title}</h2>
            <button className="icon-btn" aria-label="Close" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
          {meta && <div className="dialog-meta">{meta}</div>}
          {tabs && (
            <div className="dialog-tabs" role="tablist">
              {tabs.map((t) => (
                <button key={t.key} role="tab" aria-selected={tab === t.key} className={tab === t.key ? "on" : ""} onClick={() => onTab?.(t.key)}>
                  {t.label}{t.alert && <span className="tab-dot" aria-label="needs a look" />}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="dialog-body">{children}</div>
        <div className="dialog-foot">{foot}</div>
      </div>
    </div>
  );
}

/**
 * A whole number that can be cleared and typed again. It keeps what's typed, passes on numbers that
 * fit, and settles between min and max when you leave it (an empty box goes back to what it was).
 */
export function NumberInput({ value, onChange, min = 0, max = 365, ...rest }: { value: number; onChange: (n: number) => void; min?: number; max?: number } & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "min" | "max" | "type">) {
  const [text, setText] = useState<string | null>(null);
  return (
    <input {...rest} type="number" inputMode="numeric" min={min} max={max} value={text ?? value}
      onFocus={(e) => { setText(String(value)); e.target.select(); }}
      onChange={(e) => {
        setText(e.target.value);
        const n = Math.round(parseFloat(e.target.value));
        if (n >= min && n <= max) onChange(n);
      }}
      onBlur={() => {
        const n = Math.round(parseFloat(text ?? ""));
        if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
        setText(null);
      }} />
  );
}

/** A number with − and + buttons, easy to hit on a phone. */
export function Stepper({ value, onChange, min = 0, max = 20, label }: { value: number; onChange: (n: number) => void; min?: number; max?: number; label: string }) {
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n) || 0));
  return (
    <span className="stepper">
      <button type="button" aria-label={`Fewer ${label}`} disabled={value <= min} onClick={() => onChange(clamp(value - 1))}>−</button>
      <NumberInput aria-label={label} min={min} max={max} value={value} onChange={onChange} />
      <button type="button" aria-label={`More ${label}`} disabled={value >= max} onClick={() => onChange(clamp(value + 1))}>+</button>
    </span>
  );
}

export function Field({ label, hint, error, full, children }: { label: string; hint?: string; error?: string | null; full?: boolean; children: ReactNode }) {
  return (
    <label className={`field ${full ? "full" : ""}`}>
      <span>{label}</span>
      {children}
      {error ? <span className="err">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </label>
  );
}

const missionTone: Record<MissionStatus, string> = { Planned: "accent", Confirmed: "ok", Flying: "ok", Done: "", Cancelled: "" };
const aircraftTone: Record<AircraftStatus, string> = { Ready: "ok", "In maintenance": "warn", Grounded: "danger", Retired: "" };

export function StatusPill({ status }: { status: MissionStatus | AircraftStatus }) {
  const tone = (missionTone as Record<string, string>)[status] ?? (aircraftTone as Record<string, string>)[status] ?? "";
  return <span className={`pill ${tone}`}>{status}</span>;
}

export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");

export function Avatar({ person }: { person: Person }) {
  return (
    <span className={`avatar ${person.role.toLowerCase()}`} title={`${person.name} (${person.role})`}>
      {initials(person.name)}
    </span>
  );
}

export function Empty({ icon, text, action }: { icon: ReactNode; text: string; action?: ReactNode }) {
  return (
    <div className="empty">
      {icon}
      <p>{text}</p>
      {action}
    </div>
  );
}

/** Color swatches plus a free color picker, and the pattern choices drawn in that color. */
export function LookPicker({ color, pattern, onChange }: { color: string; pattern: Pattern; onChange: (color: string, pattern: Pattern) => void }) {
  return (
    <div className="full" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="field">
        <span>Color</span>
        <div className="picker-row">
          {SWATCHES.map((c) => (
            <button key={c} type="button" className={`swatch-btn ${color === c ? "on" : ""}`} style={{ background: c }} aria-label={`Color ${c}`} onClick={() => onChange(c, pattern)} />
          ))}
          <input type="color" aria-label="Any color" value={color} onChange={(e) => onChange(e.target.value, pattern)} />
        </div>
      </div>
      <div className="field">
        <span>Pattern</span>
        <div className="picker-row">
          {PATTERNS.map((p) => (
            <button key={p.id} type="button" className={`pattern-btn ${pattern === p.id ? "on" : ""}`} style={slotStyle({ color, pattern: p.id })} onClick={() => onChange(color, p.id)}>
              {p.label}
            </button>
          ))}
        </div>
        <span className="hint">The pattern helps tell missions apart when colors are close.</span>
      </div>
    </div>
  );
}

/** Sortable tables: click a header to sort, again to flip. */
export function useSort<K extends string>(initial: K) {
  const [sort, setSort] = useState<{ key: K; dir: 1 | -1 }>({ key: initial, dir: 1 });
  const header = (key: K, label: string, right = false) => (
    <th className={`sortable ${right ? "r" : ""}`} onClick={() => setSort((s) => ({ key, dir: s.key === key ? (-s.dir as 1 | -1) : 1 }))} aria-sort={sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      {label}
      {sort.key === key && (sort.dir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
    </th>
  );
  const sorted = <T,>(rows: T[], get: (row: T, key: K) => string | number) =>
    [...rows].sort((a, b) => {
      const x = get(a, sort.key), y = get(b, sort.key);
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * sort.dir;
    });
  return { header, sorted };
}
