import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { useStore } from "../store";
import { bookings } from "../bookings";
import { fmtDates } from "../time";

/**
 * Find anything by typing part of its name: people, aircraft (tail or type), missions and their seasons,
 * maintenance jobs and training courses. Enter or a tap opens it. Ctrl/⌘ K or the search button.
 */

interface Hit { key: string; label: string; sub: string; kind: "person" | "aircraft" | "mission" | "season" | "job" | "training"; id: string }

export function QuickFind({ onClose }: { onClose: () => void }) {
  const { data, open } = useStore();
  const [q, setQ] = useState("");
  const [at, setAt] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);

  const all = useMemo((): Hit[] => {
    const tails = new Map(data.aircraft.map((a) => [a.id, a.tail]));
    return [
      ...data.people.map((p): Hit => ({ key: `p${p.id}`, label: p.name, sub: `${p.role}${p.quals.length ? ` · ${p.quals.join(", ")}` : ""}`, kind: "person", id: p.id })),
      ...data.aircraft.map((a): Hit => ({ key: `a${a.id}`, label: a.tail, sub: `${a.type} · ${a.status}`, kind: "aircraft", id: a.id })),
      ...data.missions.map((m): Hit => ({ key: `m${m.id}`, label: m.name, sub: "Mission", kind: "mission", id: m.id })),
      ...bookings(data).map((b): Hit => ({ key: `s${b.id}`, label: b.name, sub: `Season ${fmtDates(b.start, b.end)} · ${b.status}`, kind: "season", id: b.id })),
      ...data.jobs.map((j): Hit => ({ key: `j${j.id}`, label: j.title, sub: `Maintenance · ${tails.get(j.aircraftId) ?? ""} · ${fmtDates(j.start, j.end)}`, kind: "job", id: j.id })),
      ...data.trainings.map((t): Hit => ({ key: `t${t.id}`, label: t.name, sub: "Training course", kind: "training", id: t.id })),
    ];
  }, [data]);

  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = words.length
    ? all.filter((h) => words.every((w) => `${h.label} ${h.sub}`.toLowerCase().includes(w)))
      // Names that start with what's typed first.
      .sort((x, y) => Number(!x.label.toLowerCase().startsWith(words[0])) - Number(!y.label.toLowerCase().startsWith(words[0])))
      .slice(0, 30)
    : [];
  const go = (h: Hit) => {
    onClose();
    open(h.kind, h.id);
  };

  return (
    <div className="backdrop quickfind-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="quickfind" role="dialog" aria-modal="true" aria-label="Find">
        <div className="quickfind-bar">
          <Search size={18} />
          <input ref={input} value={q} placeholder="Find a person, tail, mission, job or course" aria-label="Find"
            onChange={(e) => { setQ(e.target.value); setAt(0); }}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              else if (e.key === "ArrowDown") { e.preventDefault(); setAt((x) => Math.min(hits.length - 1, x + 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setAt((x) => Math.max(0, x - 1)); }
              else if (e.key === "Enter" && hits[at]) go(hits[at]);
            }} />
          <button className="icon-btn" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
        {words.length > 0 && (
          <div className="quickfind-list">
            {hits.map((h, i) => (
              <button key={h.key} className={`quickfind-hit ${i === at ? "on" : ""}`} onMouseEnter={() => setAt(i)} onClick={() => go(h)}>
                <b>{h.label}</b><span className="small muted">{h.sub}</span>
              </button>
            ))}
            {hits.length === 0 && <div className="small muted" style={{ padding: 12 }}>Nothing called that.</div>}
          </div>
        )}
      </div>
    </div>
  );
}
