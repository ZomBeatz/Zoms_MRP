import { useState } from "react";
import { BookMarked, ChevronDown, ChevronRight, Palette, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useStore } from "../store";
import { SWATCHES, reshade, shadesOf } from "../look";
import { LINES, addLines } from "../library";
import { fmtRuleSet } from "../limits";
import { uid } from "../time";
import { JobDefaultsField, RequirementPicks, ScheduleLimitsPick } from "../dialogs";
import { FlightLimitsEditor } from "./Planner";
import type { JobDefaults, RuleSet, WorkType } from "../types";

/**
 * Settings › Lines of business: each a color its clients are shades of, and the job requirements a new
 * client of it starts with (qualifications, equipment, schedule limitations, crew and rotations). The library
 * adds common ones with everything they need.
 */
export function LinesOfBusiness() {
  const { data, change } = useStore();
  const [open, setOpen] = useState<string | null>(null);
  const [library, setLibrary] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const setLine = (id: string, patch: Partial<WorkType>) => change((d) => ({ ...d, workTypes: d.workTypes.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
  const setDefaults = (t: WorkType, patch: Partial<JobDefaults>) => setLine(t.id, { defaults: { ...t.defaults, ...patch } });
  const have = new Set(data.workTypes.map((w) => w.name.trim().toLowerCase()));
  return (
    <section className="panel">
      <h3><Palette size={16} /> Lines of business</h3>
      <p className="small muted" style={{ marginTop: 0 }}>
        Kinds of work, like fire, medevac or utilities. Each has a color its clients are shades of, and job requirements a new client of it starts with:
        the qualifications and equipment its jobs need, its schedule limitations, and its crew and rotations. Each client can change them.
      </p>
      {data.workTypes.map((t) => {
        const n = data.missions.filter((m) => m.workTypeId === t.id).length;
        const d = t.defaults ?? {};
        const isOpen = open === t.id;
        return (
          <div key={t.id} className="line-of-business">
            <div className="row gap-sm wrap">
              <button className="icon-btn" aria-label={isOpen ? "Hide its job requirements" : "Show its job requirements"} onClick={() => setOpen(isOpen ? null : t.id)}>
                {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>
              <input type="color" aria-label={`Color for ${t.name || "this line of business"}`} value={t.color}
                onChange={(e) => { const color = e.target.value; change((x) => ({ ...x, workTypes: x.workTypes.map((w) => (w.id === t.id ? { ...w, color } : w)), missions: reshade(x.missions, t.id, color) })); }} />
              <input value={t.name} placeholder="Fire" style={{ width: 200 }} onChange={(e) => setLine(t.id, { name: e.target.value })} />
              <span className="row gap-sm">{shadesOf(t.color, 6).map((c) => <span key={c} className="swatch" style={{ background: c, width: 14, height: 14 }} />)}</span>
              <span className="small muted">{n === 1 ? "1 client" : `${n} clients`} · {(d.requiredTrainingIds ?? []).length + (d.requiredEquipmentIds ?? []).length} requirements</span>
              <button className="icon-btn danger" aria-label={`Remove ${t.name}`} onClick={() => change((x) => ({ ...x, workTypes: x.workTypes.filter((w) => w.id !== t.id), missions: x.missions.map((m) => (m.workTypeId === t.id ? { ...m, workTypeId: null } : m)) }), `Removed ${t.name || "the line of business"}; its clients keep their colors and requirements`)}><Trash2 size={15} /></button>
            </div>
            {isOpen && (
              <div className="form-grid lob-defaults">
                <label className="check full">
                  <input type="checkbox" checked={!!d.ground} onChange={(e) => setDefaults(t, { ground: e.target.checked })} /> Ground duty (no aircraft): hangar on-call, standby
                </label>
                <RequirementPicks trainingIds={d.requiredTrainingIds ?? []} equipmentIds={d.requiredEquipmentIds ?? []} ground={d.ground}
                  onChange={(p) => setDefaults(t, { ...(p.trainingIds ? { requiredTrainingIds: p.trainingIds } : {}), ...(p.equipmentIds ? { requiredEquipmentIds: p.equipmentIds } : {}) })} />
                <ScheduleLimitsPick value={d.ruleSetId ?? null} onChange={(ruleSetId) => setDefaults(t, { ruleSetId })} inherit={null} />
                <div className="full">
                  <h4 className="form-section">A new job starts with</h4>
                  <JobDefaultsField value={d} ground={d.ground} onChange={(v) => setDefaults(t, v)} />
                </div>
                <p className="small muted full" style={{ margin: 0 }}>These load into a new client of this line. Open a client and pick its line of business again to load them into it.</p>
              </div>
            )}
          </div>
        );
      })}
      <div className="row gap-sm wrap" style={{ marginTop: 6 }}>
        <button className="btn sm" onClick={() => { const id = uid(); change((x) => ({ ...x, workTypes: [...x.workTypes, { id, name: "", color: SWATCHES[x.workTypes.length % 10], defaults: {} }] })); setOpen(id); }}><Plus size={14} /> Add a line of business</button>
        <button className="btn sm" onClick={() => setLibrary(!library)}><BookMarked size={14} /> Add from the library…</button>
      </div>
      {library && (
        <div className="panel inset" style={{ marginTop: 10 }}>
          <p className="small" style={{ marginTop: 0 }}>
            Common lines of business with the qualifications, equipment and schedule limitations they usually need, all added together and connected.
            They're starting points: check them against your operations specifications and contracts, and change anything.
          </p>
          <div className="picker-row">
            {LINES.map((l) => {
              const there = have.has(l.name.toLowerCase());
              return (
                <label key={l.key} className={`chip pick ${picked.has(l.key) || there ? "on" : ""}`} title={there ? "Already set up" : undefined}>
                  <input type="checkbox" disabled={there} checked={picked.has(l.key) || there} onChange={() => setPicked((s) => { const x = new Set(s); if (x.has(l.key)) x.delete(l.key); else x.add(l.key); return x; })} />
                  <span className="swatch" style={{ background: l.color, width: 10, height: 10 }} />{l.name}
                </label>
              );
            })}
          </div>
          <div className="row gap-sm" style={{ marginTop: 8 }}>
            <button className="btn sm primary" disabled={!picked.size} onClick={() => { const keys = [...picked]; change((x) => addLines(x, keys), `Added ${keys.length === 1 ? "1 line of business" : `${keys.length} lines of business`} with their requirements`); setPicked(new Set()); setLibrary(false); }}>
              Add {picked.size || ""} with their requirements
            </button>
            <button className="btn sm ghost" onClick={() => setLibrary(false)}>Close</button>
          </div>
        </div>
      )}
    </section>
  );
}

/** A number box that can be empty (not set). */
function Opt({ value, onChange, label, max = 365, step = 1 }: { value: number | null | undefined; onChange: (v: number | null) => void; label: string; max?: number; step?: number }) {
  return <input type="number" inputMode="decimal" min={0} max={max} step={step} aria-label={label} placeholder="–" value={value ?? ""} style={{ width: 64 }}
    onChange={(e) => onChange(e.target.value === "" ? null : Math.max(0, Number(e.target.value)))} />;
}

/**
 * Settings › Schedule limitations: named limits for kinds of contract, picked on a line of business, a
 * client or one job. Days on and off replace the ones above; the others, when set, replace Settings' too.
 */
export function ScheduleLimitations({ fallback }: { fallback: { maxDaysOn: number; minDaysOff: number } }) {
  const { data, change, updateSettings } = useStore();
  const sets = data.settings.ruleSets ?? [];
  const setRule = (id: string, patch: Partial<RuleSet>) => updateSettings({ ruleSets: sets.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  return (
    <section className="panel">
      <h3><ShieldCheck size={16} /> Schedule limitations</h3>
      <p className="small muted" style={{ marginTop: 0 }}>
        Limits for kinds of contract, such as EMS and fire, picked on a line of business, a client or one job. Days on and off replace the ones above;
        the rest replace Settings' when they're filled in. The checks and Fill the schedule follow the job's. A client's or job's own limits can still be stricter.
      </p>
      {sets.map((r) => {
        const used = data.missions.filter((m) => m.ruleSetId === r.id).length + data.seasons.filter((s) => s.ruleSetId === r.id).length;
        return (
          <div key={r.id} className="rule-set-card">
            <div className="row gap-sm wrap">
              <input aria-label="Name" value={r.name} placeholder="EMS" style={{ width: 200 }} onChange={(e) => setRule(r.id, { name: e.target.value })} />
              <span className="small muted grow">{fmtRuleSet(r)}{used ? ` · used ${used === 1 ? "once" : `${used} times`}` : " · not used yet"}</span>
              <button className="icon-btn" aria-label={`Remove ${r.name || "these limitations"}`} title={used ? "Its clients and jobs go back to Settings' limits" : undefined}
                onClick={() => change((d) => ({ ...d, settings: { ...d.settings, ruleSets: d.settings.ruleSets.filter((x) => x.id !== r.id) },
                  missions: d.missions.map((m) => (m.ruleSetId === r.id ? { ...m, ruleSetId: null } : m)), seasons: d.seasons.map((s) => (s.ruleSetId === r.id ? { ...s, ruleSetId: undefined } : s)),
                  workTypes: d.workTypes.map((w) => (w.defaults?.ruleSetId === r.id ? { ...w, defaults: { ...w.defaults, ruleSetId: null } } : w)) }), `Removed “${r.name}”`)}>
                <Trash2 size={15} />
              </button>
            </div>
            <div className="limits-grid">
              <span>Days on</span>
              <span className="rotation">at least <Opt label="Fewest days on" value={r.minDaysOn} onChange={(minDaysOn) => setRule(r.id, { minDaysOn })} />, at most <Opt label="Most days on" value={r.maxDaysOn} onChange={(v) => setRule(r.id, { maxDaysOn: v || 1 })} /></span>
              <span>Days off</span>
              <span className="rotation">at least <Opt label="Fewest days off" value={r.minDaysOff} onChange={(v) => setRule(r.id, { minDaysOff: v ?? 0 })} /> between hitches</span>
              <span>Duty</span>
              <span className="rotation">at most <Opt label="Most hours on duty" max={24} step={0.5} value={r.maxDutyHours} onChange={(maxDutyHours) => setRule(r.id, { maxDutyHours })} /> hours a day, at least <Opt label="Fewest hours of rest" max={24} step={0.5} value={r.minRestHours} onChange={(minRestHours) => setRule(r.id, { minRestHours })} /> hours of rest</span>
              <span>Flight time</span>
              <span className="rotation">at most <Opt label="Most flight hours a day" max={24} step={0.5} value={r.maxFlightHoursPerDay} onChange={(maxFlightHoursPerDay) => setRule(r.id, { maxFlightHoursPerDay })} /> hours a day</span>
              <span />
              <FlightLimitsEditor value={r.flightLimits ?? []} onChange={(flightLimits) => setRule(r.id, { flightLimits })} />
            </div>
          </div>
        );
      })}
      <button className="btn sm" onClick={() => updateSettings({ ruleSets: [...sets, { id: uid(), name: sets.length ? "" : "EMS", ...fallback }] })}><Plus size={14} /> Add schedule limitations</button>
    </section>
  );
}
