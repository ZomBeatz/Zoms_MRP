import { useEffect, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import type { AircraftStatus, MissionStatus, Person } from "../types";
import { PATTERNS, SWATCHES, slotStyle } from "../look";
import type { Pattern } from "../types";

export function Dialog({ title, onClose, children, foot, wide }: { title: ReactNode; onClose: () => void; children: ReactNode; foot: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`dialog ${wide ? "wide" : ""}`} role="dialog" aria-modal="true">
        <div className="dialog-head">
          <h2>{title}</h2>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="dialog-body">{children}</div>
        <div className="dialog-foot">{foot}</div>
      </div>
    </div>
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
