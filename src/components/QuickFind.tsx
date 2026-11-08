import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, ExternalLink, Search, X } from "lucide-react";
import { useStore } from "../store";
import { PAGE_HELP, SECTION_DOCS, askGuideFor, docsUrl } from "../help";
import { RECIPES, SECTIONS, recipeId } from "../pages/Guide";
import type { Page } from "../types";
import { bookings } from "../bookings";
import { fmtDates } from "../time";

/**
 * Find anything by typing part of its name: pages, people, aircraft (tail or type), missions and their
 * seasons, maintenance jobs, training courses, and the Guide's topics and How do I… answers, with a link to
 * the online guide for pages and topics. Enter or a tap opens it. Ctrl/⌘ K or the search button.
 */

type Kind = "person" | "aircraft" | "mission" | "season" | "job" | "training";
interface Hit { key: string; label: string; sub: string; kind: Kind | "page" | "guide"; id: string; words?: string; docs?: string }

const PAGES: Hit[] = PAGE_HELP.map((h) => ({ key: `pg${h.page}`, label: h.label, sub: h.about, kind: "page", id: h.page, words: h.words, docs: h.docs }));
const TOPICS: Hit[] = [
  ...RECIPES.map((r): Hit => ({ key: `r${r.q}`, label: r.q, sub: "How do I…", kind: "guide", id: recipeId(r.q) })),
  ...SECTIONS.map((x): Hit => ({ key: `g${x.id}`, label: x.title, sub: "Guide", kind: "guide", id: x.id, docs: SECTION_DOCS[x.id] })),
];

export function QuickFind({ onClose }: { onClose: () => void }) {
  const { data, open, go: goTo, page } = useStore();
  const [q, setQ] = useState("");
  const [at, setAt] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);

  const all = useMemo((): Hit[] => {
    const tails = new Map(data.aircraft.map((a) => [a.id, a.tail]));
    const hidden = new Set(data.settings.hiddenPages ?? []);
    if (!data.settings.maintenance.enabled) hidden.add("inspections");
    return [
      ...PAGES.filter((h) => !hidden.has(h.id as Page)),
      ...data.people.map((p): Hit => ({ key: `p${p.id}`, label: p.name, sub: `${p.role}${p.quals.length ? ` · ${p.quals.join(", ")}` : ""}`, kind: "person", id: p.id })),
      ...data.aircraft.map((a): Hit => ({ key: `a${a.id}`, label: a.tail, sub: `${a.type} · ${a.status}`, kind: "aircraft", id: a.id })),
      ...data.missions.map((m): Hit => ({ key: `m${m.id}`, label: m.name, sub: "Client", kind: "mission", id: m.id })),
      ...bookings(data).map((b): Hit => ({ key: `s${b.id}`, label: b.name, sub: `Job ${fmtDates(b.start, b.end)} · ${b.status}`, kind: "season", id: b.id })),
      ...data.jobs.map((j): Hit => ({ key: `j${j.id}`, label: j.title, sub: `Maintenance · ${tails.get(j.aircraftId) ?? ""} · ${fmtDates(j.start, j.end)}`, kind: "job", id: j.id })),
      ...data.trainings.map((t): Hit => ({ key: `t${t.id}`, label: t.name, sub: "Qualification", kind: "training", id: t.id })),
      ...TOPICS,
    ];
  }, [data]);

  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = words.length
    ? all.filter((h) => words.every((w) => `${h.label} ${h.sub} ${h.words ?? ""}`.toLowerCase().includes(w)))
      // Names that start with what's typed first.
      .sort((x, y) => Number(!x.label.toLowerCase().startsWith(words[0])) - Number(!y.label.toLowerCase().startsWith(words[0])))
      .slice(0, 30)
    : [];
  const go = (h: Hit) => {
    onClose();
    if (h.kind === "page") goTo(h.id as Page);
    else if (h.kind === "guide") {
      askGuideFor(h.id);
      if (page === "guide") window.dispatchEvent(new Event("mrp-guide-target"));
      else goTo("guide");
    } else open(h.kind, h.id);
  };

  return (
    <div className="backdrop quickfind-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="quickfind" role="dialog" aria-modal="true" aria-label="Find">
        <div className="quickfind-bar">
          <Search size={18} />
          <input ref={input} value={q} placeholder="Find a page, person, tail, client or how-to" aria-label="Find"
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
              <div key={h.key} className={`quickfind-hit ${i === at ? "on" : ""}`} onMouseEnter={() => setAt(i)}>
                <button className="quickfind-open" onClick={() => go(h)}>
                  <b>{h.kind === "guide" && <BookOpen size={14} className="muted" />}{h.label}</b><span className="small muted">{h.sub}</span>
                </button>
                {h.docs !== undefined && (
                  <a className="quickfind-docs small" href={docsUrl(h.docs)} target="_blank" rel="noreferrer" title="Read about it in the online guide">
                    Online guide <ExternalLink size={12} />
                  </a>
                )}
              </div>
            ))}
            {hits.length === 0 && <div className="small muted" style={{ padding: 12 }}>Nothing called that.</div>}
          </div>
        )}
      </div>
    </div>
  );
}
