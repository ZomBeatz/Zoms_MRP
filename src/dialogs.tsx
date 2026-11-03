import { useMemo, useState, type ReactNode } from "react";
import { Check, CopyPlus, Plus, Trash2, Wand2 } from "lucide-react";
import { fillSeason } from "./fill";
import { fmtRotation, seasonTails, seasonTypes } from "./rotation";
import { useStore } from "./store";
import { findIssues, missionCoverage, neededTraining, requiredTraining, trainingStatus, whoCanCover } from "./coverage";
import { canSupport } from "./fleet";
import { DAY, addDays, dateToEnd, dateToStart, dayAt, endToDate, fmtDates, fmtSpan, ms, plural, startToDate, toWhen, today, uid } from "./time";
import { addMonths, format } from "date-fns";
import { SWATCHES, missionLook, slotStyle } from "./look";
import { Avatar, Dialog, Field, LookPicker, StatusPill, Stepper, initials } from "./components/ui";
import { seasonsOf } from "./bookings";
import { IssueList } from "./pages/Overview";
import type { Aircraft, AppData, MaintenanceJob, Mission, Person, PersonRotation, Rotation, Season, Shift, TimeOff, Training, TrainingRecord, When } from "./types";

/** Opens the right dialog for whatever `editing` points at. */
export function Dialogs() {
  const editing = useStore((s) => s.editing)!;
  const props = { id: editing.id, defaults: editing.defaults ?? {} };
  switch (editing.kind) {
    case "mission": return <MissionDialog key={editing.id} {...props} />;
    case "season": return <SeasonDialog key={editing.id} {...props} />;
    case "aircraft": return <AircraftDialog key={editing.id} {...props} />;
    case "person": return <PersonDialog key={editing.id} {...props} />;
    case "job": return <JobDialog key={editing.id} {...props} />;
    case "timeOff": return <TimeOffDialog key={editing.id} {...props} />;
    case "training": return <TrainingDialog key={editing.id} {...props} />;
    case "support": return <SupportDialog key={editing.id} {...props} />;
  }
}

type Props = { id: string; defaults: Record<string, unknown> };

const tomorrow = () => dayAt(Date.now(), 1);

/** First and last day of something stored as [start midnight, end midnight), side by side. */
function DateFields({ start, end, onChange, labels = ["First day", "Last day"] }: { start: When; end: When; onChange: (start: When, end: When) => void; labels?: [string, string] }) {
  const bad = !(ms(end) > ms(start));
  return (
    <div className="full">
      <div className="pair">
        <Field label={labels[0]}>
          <input type="date" value={startToDate(start)} onChange={(e) => e.target.value && onChange(dateToStart(e.target.value), end)} />
        </Field>
        <Field label={labels[1]}>
          <input type="date" value={endToDate(end)} onChange={(e) => e.target.value && onChange(start, dateToEnd(e.target.value))} />
        </Field>
      </div>
      {bad && <div className="field"><span className="err" style={{ marginTop: 4 }}>The last day can't be before the first day.</span></div>}
    </div>
  );
}

function Foot({ isNew, onDelete, onSave, label, disabled }: { isNew: boolean; onDelete: () => void; onSave: () => void; label: string; disabled?: boolean }) {
  const close = useStore((s) => s.close);
  return (
    <>
      {!isNew && <button className="btn danger left" onClick={onDelete} aria-label="Delete"><Trash2 size={14} /> <span className="label">Delete</span></button>}
      <button className="btn" onClick={close}>Cancel</button>
      <button className="btn primary" onClick={onSave} disabled={disabled}>{isNew ? `Add ${label}` : "Save"}</button>
    </>
  );
}

/** A chip that's on or off (training a mission needs, its crew, a person's aircraft types). */
function Pick({ on, onToggle, children, title }: { on: boolean; onToggle: () => void; children: ReactNode; title?: string }) {
  return (
    <label className={`chip pick ${on ? "on" : ""}`} title={title}>
      <input type="checkbox" checked={on} onChange={onToggle} />
      {on && <Check size={13} />}
      {children}
    </label>
  );
}

const toggled = <T,>(list: T[], x: T) => (list.includes(x) ? list.filter((y) => y !== x) : [...list, x]);

/** Known aircraft types, for suggestions as you type. */
const typesOf = (d: AppData) => [...new Set([...d.aircraft.map((a) => a.type), ...d.people.flatMap((p) => p.quals)])].sort();

// ---------------------------------------------------------------- mission (the customer's work)

function MissionDialog({ id, defaults }: Props) {
  const { data, change, remove, close, open } = useStore();
  const existing = data.missions.find((m) => m.id === id);
  const isNew = !existing;
  const [tab, setTab] = useState("details");
  const [m, setM] = useState<Mission>(() => existing ?? {
    id: uid(), name: "", contact: "", location: "", notes: "",
    requiredTrainingIds: (defaults.requiredTrainingIds as string[] | undefined) ?? [],
    // A new mission takes the next color nobody is using yet.
    color: SWATCHES.find((c) => !data.missions.some((x) => x.color === c)) ?? SWATCHES[0], pattern: "solid",
  });
  // A new mission starts with its first season (dates and aircraft), so it shows up right away.
  const [first, setFirst] = useState<Season>(() => ({
    id: uid(), missionId: m.id, start: toWhen(tomorrow()), end: toWhen(dayAt(tomorrow(), 30)), aircraftIds: [],
    pilotsNeeded: 1, maintainersNeeded: 0, pilotRotation: null, maintainerRotation: null, status: "Planned", notes: "",
    ...(defaults as Partial<Season>),
  }));
  const [pool, setPool] = useState<Set<string>>(() => new Set(data.people.filter((p) => p.missionIds.includes(id)).map((p) => p.id)));
  const set = (patch: Partial<Mission>) => setM((x) => ({ ...x, ...patch }));
  const setF = (patch: Partial<Season>) => setFirst((x) => ({ ...x, ...patch }));
  const seasons = seasonsOf(data, m.id);
  const firstBad = isNew && !(ms(first.end) > ms(first.start));
  // Aircraft types this mission flies, for the "not on type" hint in its crew list.
  const types = new Set((isNew ? [first] : seasons).flatMap((x) => seasonTypes(data, x)));
  const now = Date.now();
  const current = seasons.find((x) => ms(x.start) <= now && ms(x.end) > now && x.status !== "Cancelled")
    ?? seasons.find((x) => ms(x.start) > now && x.status !== "Cancelled");

  const save = () => {
    if (!m.name.trim()) { setTab("details"); return; }
    if (firstBad) { setTab("seasons"); return; }
    change((d) => ({
      ...d,
      missions: isNew ? [...d.missions, m] : d.missions.map((x) => (x.id === m.id ? m : x)),
      seasons: isNew ? [...d.seasons, { ...first, missionId: m.id }] : d.seasons,
      people: d.people.map((p) => {
        const works = pool.has(p.id);
        const has = p.missionIds.includes(m.id);
        return works === has ? p : { ...p, missionIds: works ? [...p.missionIds, m.id] : p.missionIds.filter((x) => x !== m.id) };
      }),
    }), isNew ? `Added “${m.name}”` : undefined);
    close();
  };

  /** The last season again, a year later, with the same aircraft and crew sizes (no shifts yet). */
  const copyToNext = () => {
    const last = seasons[seasons.length - 1];
    if (!last) return;
    const next: Season = {
      ...last, id: uid(), status: "Planned", notes: "",
      start: toWhen(addMonths(ms(last.start), 12)), end: toWhen(addMonths(ms(last.end), 12)),
    };
    change((d) => ({ ...d, missions: d.missions.map((x) => (x.id === m.id ? m : x)), seasons: [...d.seasons, next] }), `Added the season ${fmtDates(next.start, next.end)}`);
    open("season", next.id);
  };

  const crewOf = (role: Person["role"]) => data.people
    .filter((p) => p.role === role)
    // The mission's own crew (as saved) first, then by name.
    .sort((x, y) => Number(y.missionIds.includes(m.id)) - Number(x.missionIds.includes(m.id)) || x.name.localeCompare(y.name));
  const crewChips = (role: Person["role"]) => crewOf(role).map((p) => {
    const missing = requiredTraining(data, m, p.role).filter((tid) => trainingStatus(p, tid, now, now + 1).state !== "ok");
    const unqualified = types.size > 0 && ![...types].some((t) => p.quals.includes(t));
    return (
      <Pick key={p.id} on={pool.has(p.id)} onToggle={() => setPool((x) => { const n = new Set(x); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })}
        title={[unqualified ? `Not rated on ${[...types].join(" or ")}` : "", missing.length ? `Needs ${missing.map((tid) => data.trainings.find((t) => t.id === tid)?.name).join(", ")}` : ""].filter(Boolean).join(". ") || undefined}>
        {p.name}
        {(unqualified || missing.length > 0) && <span className="pill warn">{unqualified ? "Not on type" : `Needs ${missing.length}`}</span>}
      </Pick>
    );
  });

  return (
    <Dialog wide title={isNew ? m.name || "New mission" : m.name || "Mission"} onClose={close}
      icon={<span className="swatch" style={slotStyle(missionLook(m))} />}
      meta={isNew ? <span>A mission is one customer's work. Its dates are its seasons.</span> : (
        <>
          <span>{plural(seasons.length, "season")}</span>·<span>{plural(pool.size, "person", "people")} on the crew</span>
          {current && <>·<span>{ms(current.start) <= now ? "Now" : "Next"}: {fmtSpan(current.start, current.end)}</span></>}
        </>
      )}
      tabs={[
        { key: "details", label: "Details", alert: !m.name.trim() && tab !== "details" },
        { key: "seasons", label: isNew ? "First season" : <>Seasons <span className="chip">{seasons.length}</span></>, alert: firstBad },
        { key: "training", label: <>Training <span className="chip">{m.requiredTrainingIds.length}</span></> },
        { key: "crew", label: <>Crew <span className="chip">{pool.size}</span></> },
      ]}
      tab={tab} onTab={setTab}
      foot={<Foot isNew={isNew} label="mission" disabled={!m.name.trim() || firstBad} onSave={save}
        onDelete={() => { remove("missions", m.id, `Deleted “${m.name}”${seasons.length ? ` and its ${plural(seasons.length, "season")}` : ""}`); close(); }} />}>
      {tab === "details" && (
        <div className="form-grid">
          <Field label="Mission (customer)" full>
            <input autoFocus value={m.name} placeholder="Interior Fire Service" onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <Field label="Contact"><input value={m.contact} placeholder="Who to call" onChange={(e) => set({ contact: e.target.value })} /></Field>
          <Field label="Location"><input value={m.location} onChange={(e) => set({ location: e.target.value })} /></Field>
          <div className="full">
            <h4 className="form-section">Look on the schedule</h4>
            <LookPicker color={m.color} pattern={m.pattern} onChange={(color, pattern) => set({ color, pattern })} />
          </div>
          <Field label="Notes" full><textarea rows={2} value={m.notes} onChange={(e) => set({ notes: e.target.value })} /></Field>
        </div>
      )}

      {tab === "seasons" && (isNew ? (
        <>
          <div className="form-grid">
            <DateFields start={first.start} end={first.end} onChange={(start, end) => setF({ start, end })} />
            <AircraftPicker value={first.aircraftIds} onChange={(aircraftIds) => setF({ aircraftIds })} />
            <CrewSize season={first} onChange={setF} />
            <RotationField label="Pilot rotation" value={first.pilotRotation} onChange={(pilotRotation) => setF({ pilotRotation })} />
            <RotationField label="Maintainer rotation" value={first.maintainerRotation} onChange={(maintainerRotation) => setF({ maintainerRotation })} />
          </div>
          <p className="form-note">Crew it after saving: open the season and use <b>Fill the schedule</b>.</p>
        </>
      ) : (
        <>
          <div className="toolbar" style={{ marginTop: 0 }}>
            <button className="btn sm primary" onClick={() => open("season", "new", { missionId: m.id })}><Plus size={14} /> Add season…</button>
            {seasons.length > 0 && <button className="btn sm" onClick={copyToNext}><CopyPlus size={14} /> Copy to next season</button>}
          </div>
          {seasons.length > 0 ? (
            <div className="lines">
              {[...seasons].reverse().map((x) => {
                const pct = Math.round(missionCoverage(data, x).covered * 100);
                const live = x.status !== "Done" && x.status !== "Cancelled";
                return (
                  <button key={x.id} className="line" style={ms(x.end) <= now ? { opacity: 0.65 } : undefined} onClick={() => open("season", x.id)}>
                    <span className="grow">
                      <span className="name" style={{ display: "block" }}>{fmtSpan(x.start, x.end)}</span>
                      <span className="small muted">{seasonTails(data, x)} · {x.pilotsNeeded}P{x.maintainersNeeded ? ` + ${x.maintainersNeeded}M` : ""}{x.pilotRotation ? ` · ${fmtRotation(x.pilotRotation)}` : ""}</span>
                    </span>
                    {live && <span className={`pill ${pct === 100 ? "ok" : "danger"}`}>{pct}%</span>}
                    <StatusPill status={x.status} />
                  </button>
                );
              })}
            </div>
          ) : <p className="muted">No seasons yet.</p>}
        </>
      ))}

      {tab === "training" && (
        <>
          <p className="form-note" style={{ marginTop: 0, marginBottom: 12 }}>Everyone on this mission needs these, current for their whole hitch. Nobody else does.</p>
          <div className="picker-row">
            {data.trainings.map((t) => (
              <Pick key={t.id} on={m.requiredTrainingIds.includes(t.id)} onToggle={() => set({ requiredTrainingIds: toggled(m.requiredTrainingIds, t.id) })}>{t.name}</Pick>
            ))}
            {data.trainings.length === 0 && <span className="muted">No training set up yet. Add courses under Training.</span>}
          </div>
        </>
      )}

      {tab === "crew" && (
        <>
          <p className="form-note" style={{ marginTop: 0 }}>The people who rotate through this mission. They're picked first when a season is filled, and only they need its training.</p>
          <h4 className="form-section" style={{ marginTop: 14 }}>Pilots</h4>
          <div className="picker-row">{crewChips("Pilot")}</div>
          <h4 className="form-section">Maintainers</h4>
          <div className="picker-row">{crewChips("Maintainer")}</div>
        </>
      )}
    </Dialog>
  );
}

/** The job's aircraft as tags (any number, added whenever they're known). */
function AircraftPicker({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const aircraft = useStore((s) => s.data.aircraft);
  const seats = value.reduce((t, id) => t + (aircraft.find((a) => a.id === id)?.seats ?? 0), 0);
  const chosen = value.map((id) => aircraft.find((a) => a.id === id)).filter((a) => !!a);
  const rest = aircraft.filter((a) => !value.includes(a.id) && a.status !== "Retired").sort((a, b) => a.type.localeCompare(b.type) || a.tail.localeCompare(b.tail));
  const byType = [...new Set(rest.map((a) => a.type))];
  return (
    <div className="field full">
      <span>Aircraft</span>
      <div className="tags">
        {chosen.map((a) => (
          <span key={a.id} className="tag" title={`${a.type}, ${plural(a.seats, "pilot seat")}`}>
            <b>{a.tail}</b> <span className="muted small">{a.type}</span>
            {a.status !== "Ready" && <span className="pill warn">{a.status}</span>}
            <button type="button" className="icon-btn" aria-label={`Take ${a.tail} off this job`} onClick={() => onChange(value.filter((x) => x !== a.id))}>✕</button>
          </span>
        ))}
        {rest.length > 0 && (
          <select className="add-tag" aria-label="Add an aircraft" value="" onChange={(e) => e.target.value && onChange([...value, e.target.value])}>
            <option value="">+ Add aircraft</option>
            {byType.map((t) => (
              <optgroup key={t} label={t}>
                {rest.filter((a) => a.type === t).map((a) => <option key={a.id} value={a.id}>{a.tail}{a.status !== "Ready" ? ` (${a.status.toLowerCase()})` : ""}</option>)}
              </optgroup>
            ))}
          </select>
        )}
        {aircraft.length === 0 && <span className="small muted">No aircraft yet. Add them on the Fleet page.</span>}
      </div>
      <span className="hint">{value.length ? `${plural(seats, "pilot seat")} in all.` : "Add them when you know. The job can wait for its aircraft."}</span>
    </div>
  );
}

/** Pilots and maintainers the job needs at any time, across all its aircraft. */
function CrewSize({ season, onChange }: { season: Season; onChange: (patch: Partial<Season>) => void }) {
  return (
    <div className="full">
      <div className="pair">
        <div className="field"><span>Pilots at a time</span><Stepper label="pilots" value={season.pilotsNeeded} onChange={(pilotsNeeded) => onChange({ pilotsNeeded })} /></div>
        <div className="field"><span>Maintainers at a time</span><Stepper label="maintainers" value={season.maintainersNeeded} onChange={(maintainersNeeded) => onChange({ maintainersNeeded })} /></div>
      </div>
    </div>
  );
}

/** "21 on, 14 off", or empty for the hitch rules in Settings. */
function RotationField({ label, value, onChange }: { label: string; value: Rotation | null; onChange: (r: Rotation | null) => void }) {
  const num = (v: string) => (v === "" ? null : Math.max(0, Math.round(Number(v))));
  const set = (on: number | null, off: number | null) => onChange(on === null && off === null ? null : { on: Math.max(1, on ?? 14), off: off ?? 0 });
  return (
    <div className="field">
      <span>{label}</span>
      <span className="rotation">
        <input type="number" inputMode="numeric" min={1} max={365} aria-label={`${label}: days on`} placeholder="21" value={value?.on ?? ""} onChange={(e) => set(num(e.target.value), value?.off ?? null)} />
        on
        <input type="number" inputMode="numeric" min={0} max={365} aria-label={`${label}: days off`} placeholder="14" value={value?.off ?? ""} onChange={(e) => set(value?.on ?? null, num(e.target.value))} />
        off, in days
      </span>
      {!value && <span className="hint">Empty: the hitch rules in Settings.</span>}
    </div>
  );
}

// ---------------------------------------------------------------- season (dates, aircraft and crew)

function SeasonDialog({ id, defaults }: Props) {
  const { data, change, remove, close, open } = useStore();
  const existing = data.seasons.find((x) => x.id === id);
  const isNew = !existing;
  const [season, setSeason] = useState<Season>(() => {
    if (existing) return existing;
    const missionId = (defaults.missionId as string) ?? data.missions[0]?.id ?? "";
    // A new season starts from the mission's latest one: same aircraft, crew numbers and rotations.
    const last = seasonsOf(data, missionId).at(-1);
    return {
      id: uid(), missionId, start: toWhen(tomorrow()), end: toWhen(dayAt(tomorrow(), 30)),
      aircraftIds: last?.aircraftIds ?? [], pilotsNeeded: last?.pilotsNeeded ?? 1, maintainersNeeded: last?.maintainersNeeded ?? 0,
      pilotRotation: last?.pilotRotation ?? null, maintainerRotation: last?.maintainerRotation ?? null,
      status: "Planned", notes: "", ...(defaults as Partial<Season>),
    };
  });
  // Open on the crew, where most of the work is, unless the season is new.
  const [tab, setTab] = useState(() => (isNew ? "details" : existing!.pilotsNeeded > 0 ? "pilots" : existing!.maintainersNeeded > 0 ? "maintainers" : "details"));
  const [shifts, setShifts] = useState<Shift[]>(() => data.shifts.filter((s) => s.seasonId === id));
  const [editingShift, setEditingShift] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const set = (patch: Partial<Season>) => setSeason((x) => ({ ...x, ...patch }));
  const mission = data.missions.find((x) => x.id === season.missionId);
  const types = seasonTypes(data, season);

  // Check the draft as if it were saved, so coverage and conflicts update while editing.
  const draft: AppData = useMemo(() => ({
    ...data,
    seasons: [...data.seasons.filter((x) => x.id !== season.id), season],
    shifts: [...data.shifts.filter((s) => s.seasonId !== season.id), ...shifts],
  }), [data, season, shifts]);
  const cov = missionCoverage(draft, season);
  const issues = useMemo(() => findIssues(draft).filter((i) => i.seasonId === season.id), [draft, season.id]);
  const from = ms(season.start), to = ms(season.end);
  const timeError = !(to > from);
  const required = mission ? requiredTraining(draft, mission) : [];
  const pct = (t: number) => ((t - from) / (to - from)) * 100;
  const roleOf = (s: Shift) => data.people.find((p) => p.id === s.personId)?.role;
  const live = season.status !== "Done" && season.status !== "Cancelled";

  if (!data.missions.length)
    return (
      <Dialog title="New season" onClose={close} foot={<><button className="btn" onClick={close}>Cancel</button><button className="btn primary" onClick={() => open("mission", "new", defaults)}>New mission…</button></>}>
        <p style={{ margin: 0 }}>A season is a stretch of dates for a mission. Add the mission first; its first season comes with it.</p>
      </Dialog>
    );

  /** A new shift for whoever can take the given days, opened so it can be changed. */
  const addShift = (role: Person["role"], a = from, b = to) => {
    const free = whoCanCover(draft, role, a, b, types, [], required, season.missionId).find((c) => c.ok && !shifts.some((s) => s.personId === c.person.id && overlapsShift(s, a, b)));
    const personId = free?.person.id ?? data.people.find((p) => p.role === role)?.id;
    if (!personId) return;
    const shift = { id: uid(), seasonId: season.id, personId, start: toWhen(a), end: toWhen(b) };
    setShifts((s) => [...s, shift]);
    setEditingShift(shift.id);
    if (!free) useStore.getState().showToast("Nobody can take all of those days. Pick someone, or shorten the dates.");
  };

  /** Fill the open seats for one role on the job's rotation (see src/fill.ts). */
  const fill = (role: Person["role"], fresh: boolean) => {
    const keep = fresh ? shifts.filter((s) => roleOf(s) !== role) : shifts;
    const base: AppData = { ...draft, shifts: [...data.shifts.filter((s) => s.seasonId !== season.id), ...keep] };
    const added = fillSeason(base, season, role, role === "Pilot" ? season.pilotRotation : season.maintainerRotation, data.settings.rules);
    setShifts([...keep, ...added]);
    setEditingShift(null);
    const after = missionCoverage({ ...base, shifts: [...base.shifts, ...added] }, season);
    const gaps = role === "Pilot" ? after.pilotGaps : after.maintainerGaps;
    useStore.getState().showToast(
      added.length === 0 ? "Nobody free, qualified and current to add." : gaps.length ? `Added ${plural(added.length, "shift")}. Some days are still open: nobody else was free.` : `Added ${plural(added.length, "shift")}. Every seat is filled.`,
    );
  };

  const save = () => {
    if (!mission) return;
    if (timeError) { setTab("details"); return; }
    change((d) => ({
      ...d,
      seasons: isNew ? [...d.seasons, season] : d.seasons.map((x) => (x.id === season.id ? season : x)),
      shifts: [...d.shifts.filter((s) => s.seasonId !== season.id), ...shifts],
      // Anyone with a shift works this mission.
      people: d.people.map((p) => (shifts.some((s) => s.personId === p.id) && !p.missionIds.includes(season.missionId) ? { ...p, missionIds: [...p.missionIds, season.missionId] } : p)),
    }), isNew ? `Added a season to “${mission.name}”` : undefined);
    close();
  };

  /** Who could take this shift, judged on its own dates. Only those who can, unless "Show everyone". */
  const choices = (role: Person["role"], shift: Shift) => {
    const all = whoCanCover(draft, role, ms(shift.start), ms(shift.end), types, [shift.id], required, season.missionId);
    return showAll ? all : all.filter((c) => c.ok || c.person.id === shift.personId);
  };
  const why = (c: ReturnType<typeof whoCanCover>[number]) =>
    !c.qualified ? " (not rated on this aircraft)" : !c.trained ? " (training not current)" : c.off ? " (time off)" : !c.onRotation ? " (off rotation)" : c.busy ? " (booked elsewhere)" : c.regular ? "" : " (not on this mission's crew)";
  // Shifts with a problem: named in the issue, or the issue is about that person during the shift.
  const flagged = new Set(shifts.filter((s) => issues.some((i) => i.id.includes(s.id) || (i.personId === s.personId && i.at >= ms(s.start) && i.at < ms(s.end)))).map((s) => s.id));
  const covered = (role: Person["role"]) => {
    const gaps = role === "Pilot" ? cov.pilotGaps : cov.maintainerGaps;
    return to > from ? 1 - gaps.reduce((t, g) => t + (g.b - g.a), 0) / (to - from) : 1;
  };
  const updateShift = (sid: string, patch: Partial<Shift>) => setShifts((all) => all.map((x) => (x.id === sid ? { ...x, ...patch } : x)));

  const crewTab = (role: Person["role"]) => {
    const need = role === "Pilot" ? season.pilotsNeeded : season.maintainersNeeded;
    const gaps = role === "Pilot" ? cov.pilotGaps : cov.maintainerGaps;
    const share = covered(role);
    const rotation = role === "Pilot" ? season.pilotRotation : season.maintainerRotation;
    const word = role === "Pilot" ? "pilot" : "maintainer";
    // Shifts and open seats together, in date order.
    type Row = { at: number; shift?: Shift; gap?: (typeof gaps)[number] };
    const rows = [
      ...shifts.filter((s) => roleOf(s) === role).map((s): Row => ({ at: ms(s.start), shift: s })),
      ...(timeError ? [] : gaps.map((g): Row => ({ at: g.a, gap: g }))),
    ].sort((a, b) => a.at - b.at || Number(!!a.gap) - Number(!!b.gap));
    if (need === 0 && rows.length === 0)
      return <p className="muted" style={{ margin: 0 }}>This job doesn't need {word}s. Change that under Details.</p>;
    return (
      <>
        {!timeError && need > 0 && (
          <>
            <div className="cov-head">
              <b>{gaps.length ? `${Math.round(share * 100)}% crewed` : "Fully crewed"}</b>
              <span className="muted">{plural(need, word)} at a time · {rotation ? fmtRotation(rotation) : "hitch rules from Settings"}</span>
            </div>
            <div className="cov-bar" aria-label={`${Math.round(share * 100)}% covered`}>
              {gaps.map((g) => <div key={g.a} className="gap" style={{ left: `${pct(g.a)}%`, width: `${pct(g.b) - pct(g.a)}%` }} title={`${plural(g.short, "seat")} open, ${fmtSpan(toWhen(g.a), toWhen(g.b))}`} />)}
            </div>
          </>
        )}
        <div className="toolbar">
          {need > 0 && !timeError && (
            <button className="btn sm primary" onClick={() => fill(role, false)} title="Rotate free, qualified, current people through the open days on this job's rotation">
              <Wand2 size={14} /> Fill the schedule
            </button>
          )}
          <button className="btn sm" onClick={() => addShift(role)}><Plus size={14} /> Add a {word}</button>
          {rows.some((r) => r.shift) && need > 0 && <button className="btn sm ghost" onClick={() => fill(role, true)} title={`Remove the ${word} shifts and fill again from scratch`}>Start over</button>}
          <label className="check"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Show everyone</label>
        </div>
        {rows.length > 0 ? (
          <div className="lines">
            {rows.map((r) => {
              if (r.gap) {
                const g = r.gap;
                return (
                  <button key={`gap-${g.a}`} className="line open-seat" onClick={() => addShift(role, g.a, g.b)} title="Add someone for these days">
                    <span className="avatar">!</span>
                    <span className="name">{g.short > 1 ? `${g.short} open seats` : "Open seat"}</span>
                    <span className="when">{fmtSpan(toWhen(g.a), toWhen(g.b), true)}</span>
                    <Plus size={15} />
                  </button>
                );
              }
              const s = r.shift!;
              const p = data.people.find((x) => x.id === s.personId);
              if (editingShift === s.id)
                return (
                  <div key={s.id} className="line-edit">
                    <Field label={role === "Pilot" ? "Pilot" : "Maintainer"}>
                      <select value={s.personId} onChange={(e) => updateShift(s.id, { personId: e.target.value })}>
                        {choices(role, s).map((c) => <option key={c.person.id} value={c.person.id}>{c.person.name}{why(c)}</option>)}
                      </select>
                    </Field>
                    <div className="pair">
                      <Field label="First day"><input type="date" value={startToDate(s.start)} onChange={(e) => e.target.value && updateShift(s.id, { start: dateToStart(e.target.value) })} /></Field>
                      <Field label="Last day"><input type="date" value={endToDate(s.end)} onChange={(e) => e.target.value && updateShift(s.id, { end: dateToEnd(e.target.value) })} /></Field>
                    </div>
                    <div className="row gap-sm">
                      <button className="btn sm danger" onClick={() => { setShifts((all) => all.filter((x) => x.id !== s.id)); setEditingShift(null); }}><Trash2 size={14} /> Remove</button>
                      <span className="grow" />
                      <button className="btn sm primary" onClick={() => setEditingShift(null)}>Done</button>
                    </div>
                  </div>
                );
              return (
                <button key={s.id} className={`line ${flagged.has(s.id) ? "flag" : ""}`} onClick={() => setEditingShift(s.id)} title={flagged.has(s.id) ? "There's a problem with this shift. See Problems." : "Change or remove"}>
                  {p ? <Avatar person={p} /> : <span className="avatar">?</span>}
                  <span className="name">{p?.name ?? "Someone deleted"}</span>
                  <span className="when">{fmtSpan(s.start, s.end, true)}</span>
                </button>
              );
            })}
          </div>
        ) : <p className="muted">No {word}s yet.</p>}
      </>
    );
  };

  const gapsAlert = (role: Person["role"]) => live && !timeError && (role === "Pilot" ? cov.pilotGaps : cov.maintainerGaps).length > 0;
  const crewedPill = live && !timeError && (season.pilotsNeeded > 0 || season.maintainersNeeded > 0) && (
    cov.covered === 1 ? <span className="pill ok">Crewed</span> : <span className="pill danger">{Math.round(cov.covered * 100)}% crewed</span>
  );

  return (
    <Dialog wide title={isNew ? `New season${mission ? `: ${mission.name}` : ""}` : mission?.name ?? "Season"} onClose={close}
      icon={mission && <span className="swatch" style={slotStyle(missionLook(mission))} />}
      meta={<>
        <StatusPill status={season.status} />
        <span>{timeError ? "Check the dates" : fmtDates(season.start, season.end)}</span>
        {season.aircraftIds.length > 0 && <>·<span>{seasonTails(data, season)}</span></>}
        {crewedPill}
      </>}
      tabs={[
        { key: "details", label: "Details", alert: timeError },
        { key: "pilots", label: <>Pilots <span className="chip">{season.pilotsNeeded}</span></>, alert: gapsAlert("Pilot") },
        { key: "maintainers", label: <>Maintainers <span className="chip">{season.maintainersNeeded}</span></>, alert: gapsAlert("Maintainer") },
        ...(issues.length ? [{ key: "problems", label: <>Problems <span className="chip">{issues.length}</span></>, alert: issues.some((i) => i.severity === "danger") }] : []),
      ]}
      tab={tab === "problems" && !issues.length ? "details" : tab} onTab={(t) => { setTab(t); setEditingShift(null); }}
      foot={<Foot isNew={isNew} label="season" disabled={!mission || timeError} onSave={save}
        onDelete={() => { remove("seasons", season.id, `Deleted the season ${fmtDates(season.start, season.end)}`); close(); }} />}>
      {(tab === "details" || (tab === "problems" && !issues.length)) && (
        <div className="form-grid">
          <div className="full pair">
            <Field label="Mission">
              <select value={season.missionId} onChange={(e) => set({ missionId: e.target.value })} disabled={!isNew}>
                {data.missions.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select value={season.status} onChange={(e) => set({ status: e.target.value as Season["status"] })}>
                {(["Planned", "Confirmed", "Flying", "Done", "Cancelled"] as const).map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
          </div>
          <DateFields start={season.start} end={season.end} onChange={(start, end) => set({ start, end })} />
          <AircraftPicker value={season.aircraftIds} onChange={(aircraftIds) => set({ aircraftIds })} />
          <CrewSize season={season} onChange={set} />
          <RotationField label="Pilot rotation" value={season.pilotRotation} onChange={(pilotRotation) => set({ pilotRotation })} />
          <RotationField label="Maintainer rotation" value={season.maintainerRotation} onChange={(maintainerRotation) => set({ maintainerRotation })} />
          <Field label="Notes" full><textarea rows={2} value={season.notes} onChange={(e) => set({ notes: e.target.value })} /></Field>
          {mission && (
            <p className="form-note full" style={{ margin: 0 }}>
              {required.length ? <>Crew need {required.map((tid) => data.trainings.find((t) => t.id === tid)?.name).filter(Boolean).join(", ")}. </> : null}
              Training, crew and look are on the mission. <button className="link" onClick={() => open("mission", mission.id)}>Open {mission.name}…</button>
            </p>
          )}
        </div>
      )}
      {tab === "pilots" && crewTab("Pilot")}
      {tab === "maintainers" && crewTab("Maintainer")}
      {tab === "problems" && issues.length > 0 && <IssueList issues={issues} />}
    </Dialog>
  );
}

const overlapsShift = (s: Shift, a: number, b: number) => ms(s.start) < b && ms(s.end) > a;

// ---------------------------------------------------------------- aircraft

function AircraftDialog({ id }: Props) {
  const { data, upsert, remove, close, showToast } = useStore();
  const existing = data.aircraft.find((a) => a.id === id);
  const [a, setA] = useState<Aircraft>(() => existing ?? { id: uid(), tail: "", type: "", base: "", status: "Ready", seats: 2, notes: "" });
  const set = (p: Partial<Aircraft>) => setA((x) => ({ ...x, ...p }));
  const tail = a.tail.trim().toUpperCase();
  const taken = data.aircraft.some((x) => x.id !== a.id && x.tail.trim().toUpperCase() === tail);
  const error = taken ? `${tail} is already in your fleet.` : null;
  return (
    <Dialog title={existing ? <span style={{ fontFamily: "var(--zb-font-mono)" }}>{a.tail}</span> : "Add aircraft"} onClose={close}
      meta={existing && <><StatusPill status={a.status} /><span>{a.type}</span>{a.base && <>·<span>{a.base}</span></>}</>}
      foot={<Foot isNew={!existing} label="aircraft" disabled={!tail || !a.type.trim() || taken}
        onSave={() => { upsert("aircraft", { ...a, tail }); if (!existing) showToast(`Added ${tail}`); close(); }}
        onDelete={() => { remove("aircraft", a.id, `Deleted ${a.tail}`); close(); }} />}>
      <div className="form-grid">
        <Field label="Tail number" error={error}>
          <input autoFocus value={a.tail} placeholder="N412ZM" style={{ fontFamily: "var(--zb-font-mono)", textTransform: "uppercase" }} onChange={(e) => set({ tail: e.target.value })} />
        </Field>
        <Field label="Type" hint="Crew ratings match this.">
          <input list="mrp-types" value={a.type} placeholder="Bell 412" onChange={(e) => set({ type: e.target.value })} />
          <datalist id="mrp-types">{typesOf(data).map((t) => <option key={t} value={t} />)}</datalist>
        </Field>
        <div className="full pair">
          <Field label="Status">
            <select value={a.status} onChange={(e) => set({ status: e.target.value as Aircraft["status"] })}>
              {(["Ready", "In maintenance", "Grounded", "Retired"] as const).map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <div className="field"><span>Pilot seats</span><Stepper label="pilot seats" min={1} max={2} value={a.seats} onChange={(seats) => set({ seats })} /></div>
        </div>
        <Field label="Base" full><input value={a.base} onChange={(e) => set({ base: e.target.value })} /></Field>
        <Field label="Notes" full><textarea rows={2} value={a.notes} onChange={(e) => set({ notes: e.target.value })} /></Field>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------- person

function PersonDialog({ id, defaults }: Props) {
  const { data, upsert, remove, close, showToast, open } = useStore();
  const existing = data.people.find((p) => p.id === id);
  const [tab, setTab] = useState("details");
  const [p, setP] = useState<Person>(() => existing ?? { id: uid(), name: "", role: "Pilot", quals: [], training: [], missionIds: [], rotation: null, base: "", phone: "", notes: "", ...(defaults as Partial<Person>) });
  const set = (patch: Partial<Person>) => setP((x) => ({ ...x, ...patch }));
  const [newQual, setNewQual] = useState("");
  const types = [...new Set([...typesOf(data), ...p.quals])].sort();
  const word = p.role === "Pilot" ? "pilot" : "maintainer";
  const now = Date.now();
  const needs = neededTraining({ ...data, people: data.people.map((x) => (x.id === p.id ? p : x)) }, p);
  const notCurrent = [...needs.keys()].filter((tid) => trainingStatus(p, tid, now, now + 1).state !== "ok").length;
  const off = data.timeOff.filter((t) => t.personId === p.id && ms(t.end) > now).sort((a, b) => ms(a.start) - ms(b.start));

  return (
    <Dialog title={p.name || `Add ${word}`} onClose={close}
      icon={<span className={`avatar ${p.role.toLowerCase()}`} style={{ width: 30, height: 30, fontSize: 12 }}>{initials(p.name) || "?"}</span>}
      meta={<>
        <span>{p.role}</span>
        {p.quals.length > 0 && <>·<span>{p.quals.join(", ")}</span></>}
        {p.rotation && <>·<span>{fmtRotation(p.rotation)}</span></>}
        {notCurrent > 0 && <span className="pill danger">{plural(notCurrent, "course")} not current</span>}
      </>}
      tabs={[
        { key: "details", label: "Details", alert: !p.name.trim() && tab !== "details" },
        { key: "work", label: "Ratings and missions" },
        { key: "training", label: <>Training <span className="chip">{p.training.length}</span></>, alert: notCurrent > 0 },
      ]}
      tab={tab} onTab={setTab}
      foot={<Foot isNew={!existing} label={word} disabled={!p.name.trim()}
        onSave={() => { if (!p.name.trim()) { setTab("details"); return; } upsert("people", p); if (!existing) showToast(`Added ${p.name}`); close(); }}
        onDelete={() => { remove("people", p.id, `Deleted ${p.name} and their shifts`); close(); }} />}>
      {tab === "details" && (
        <div className="form-grid">
          <Field label="Name"><input autoFocus value={p.name} onChange={(e) => set({ name: e.target.value })} /></Field>
          <Field label="Role">
            <select value={p.role} onChange={(e) => set({ role: e.target.value as Person["role"] })}>
              <option>Pilot</option><option>Maintainer</option>
            </select>
          </Field>
          <Field label="Base"><input value={p.base} onChange={(e) => set({ base: e.target.value })} /></Field>
          <Field label="Phone"><input type="tel" value={p.phone} onChange={(e) => set({ phone: e.target.value })} /></Field>
          <PersonRotationField value={p.rotation} onChange={(rotation) => set({ rotation })} />
          <Field label="Notes" full><textarea rows={2} value={p.notes} onChange={(e) => set({ notes: e.target.value })} /></Field>
          {existing && (
            <div className="field full">
              <span>Time off coming up</span>
              {off.length > 0 && (
                <div className="lines">
                  {off.map((t) => (
                    <button key={t.id} className="line" onClick={() => open("timeOff", t.id)}>
                      <span className="name">{t.reason || "Time off"}</span><span className="when">{fmtSpan(t.start, t.end)}</span>
                    </button>
                  ))}
                </div>
              )}
              <div><button className="btn sm" onClick={() => open("timeOff", "new", { personId: p.id })}><Plus size={14} /> Add time off…</button></div>
            </div>
          )}
        </div>
      )}
      {tab === "work" && (
        <>
          <h4 className="form-section">Rated on</h4>
          <div className="picker-row">
            {types.map((t) => <Pick key={t} on={p.quals.includes(t)} onToggle={() => set({ quals: toggled(p.quals, t) })}>{t}</Pick>)}
            <input placeholder="Another type" value={newQual} style={{ width: 140 }} onChange={(e) => setNewQual(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && newQual.trim()) { e.preventDefault(); set({ quals: [...new Set([...p.quals, newQual.trim()])] }); setNewQual(""); } }} />
          </div>
          <p className="form-note">Aircraft types this person can fly or work on. They're only offered for jobs on these.</p>
          <h4 className="form-section">Works on</h4>
          <div className="picker-row">
            {data.missions.map((m) => (
              <Pick key={m.id} on={p.missionIds.includes(m.id)} onToggle={() => set({ missionIds: toggled(p.missionIds, m.id) })}>
                <span className="swatch" style={{ ...slotStyle(missionLook(m)), width: 10, height: 10 }} />{m.name}
              </Pick>
            ))}
            {data.missions.length === 0 && <span className="muted">No missions yet.</span>}
          </div>
          <p className="form-note"><NeedsLine person={p} /></p>
        </>
      )}
      {tab === "training" && <TrainingRecords person={p} onChange={(training) => set({ training })} />}
    </Dialog>
  );
}

// ---------------------------------------------------------------- maintenance job

function JobDialog({ id, defaults }: Props) {
  const { data, upsert, remove, close, showToast } = useStore();
  const existing = data.jobs.find((j) => j.id === id);
  const [j, setJ] = useState<MaintenanceJob>(() => existing ?? {
    id: uid(), aircraftId: data.aircraft[0]?.id ?? "", title: "", kind: "Inspection",
    start: toWhen(tomorrow()), end: toWhen(dayAt(tomorrow(), 1)), maintainerIds: [], grounds: true, done: false, notes: "",
    ...(defaults as Partial<MaintenanceJob>),
  });
  const set = (patch: Partial<MaintenanceJob>) => setJ((x) => ({ ...x, ...patch }));
  const ac = data.aircraft.find((a) => a.id === j.aircraftId);
  const timeError = !(ms(j.end) > ms(j.start));
  const crew = whoCanCover(data, "Maintainer", ms(j.start), ms(j.end), ac?.type ?? null, []);
  return (
    <Dialog title={existing ? j.title : "New maintenance job"} onClose={close}
      meta={existing && <>{ac && <b style={{ fontFamily: "var(--zb-font-mono)" }}>{ac.tail}</b>}<span>{j.kind}</span>·<span>{timeError ? "Check the dates" : fmtDates(j.start, j.end)}</span>{j.done && <span className="pill ok">Finished</span>}</>}
      foot={<Foot isNew={!existing} label="job" disabled={!j.title.trim() || !j.aircraftId || timeError}
        onSave={() => { upsert("jobs", j); if (!existing) showToast(`Added “${j.title}”`); close(); }}
        onDelete={() => { remove("jobs", j.id, `Deleted “${j.title}”`); close(); }} />}>
      <div className="form-grid">
        <Field label="Job" full><input autoFocus value={j.title} placeholder="100 hour inspection" onChange={(e) => set({ title: e.target.value })} /></Field>
        <div className="full pair">
          <Field label="Aircraft">
            <select value={j.aircraftId} onChange={(e) => set({ aircraftId: e.target.value })}>
              {data.aircraft.length === 0 && <option value="">Add an aircraft first</option>}
              {data.aircraft.map((a) => <option key={a.id} value={a.id}>{a.tail} · {a.type}</option>)}
            </select>
          </Field>
          <Field label="Kind">
            <select value={j.kind} onChange={(e) => set({ kind: e.target.value as MaintenanceJob["kind"] })}>
              {(["Inspection", "Repair", "Pre-flight", "Other"] as const).map((k) => <option key={k}>{k}</option>)}
            </select>
          </Field>
        </div>
        <DateFields start={j.start} end={j.end} onChange={(start, end) => set({ start, end })} />
        <div className="field full">
          <span>Maintainers</span>
          <div className="picker-row">
            {crew.map((c) => (
              <Pick key={c.person.id} on={j.maintainerIds.includes(c.person.id)} onToggle={() => set({ maintainerIds: toggled(j.maintainerIds, c.person.id) })}
                title={!c.qualified ? `Not rated on the ${ac?.type}` : c.off ? "Time off" : c.busy ? "Booked elsewhere" : "Free"}>
                {c.person.name}
                {!c.qualified ? <span className="pill warn">Not rated</span> : c.off ? <span className="pill warn">Off</span> : c.busy && !j.maintainerIds.includes(c.person.id) ? <span className="pill">Busy</span> : null}
              </Pick>
            ))}
            {crew.length === 0 && <span className="small muted">No maintainers yet. Add them under Crew.</span>}
          </div>
        </div>
        <label className="check full"><input type="checkbox" checked={j.grounds} onChange={(e) => set({ grounds: e.target.checked })} /> The aircraft can't fly during this job</label>
        <label className="check full"><input type="checkbox" checked={j.done} onChange={(e) => set({ done: e.target.checked })} /> Finished</label>
        <Field label="Notes" full><textarea rows={2} value={j.notes} onChange={(e) => set({ notes: e.target.value })} /></Field>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------- time off

function TimeOffDialog({ id, defaults }: Props) {
  const { data, upsert, remove, close, showToast } = useStore();
  const existing = data.timeOff.find((t) => t.id === id);
  const d0 = today();
  const [t, setT] = useState<TimeOff>(() => existing ?? {
    id: uid(), personId: data.people[0]?.id ?? "", start: toWhen(addDays(d0, 1)), end: toWhen(addDays(d0, 2)), reason: "", ...(defaults as Partial<TimeOff>),
  });
  const set = (patch: Partial<TimeOff>) => setT((x) => ({ ...x, ...patch }));
  const timeError = !(ms(t.end) > ms(t.start));
  const person = data.people.find((p) => p.id === t.personId);
  return (
    <Dialog title={existing ? "Time off" : "Add time off"} onClose={close}
      meta={person && <><span>{person.name}</span>{!timeError && <>·<span>{fmtDates(t.start, t.end)}</span></>}</>}
      foot={<Foot isNew={!existing} label="time off" disabled={!t.personId || timeError}
        onSave={() => { upsert("timeOff", t); if (!existing) showToast("Added time off"); close(); }}
        onDelete={() => { remove("timeOff", t.id, "Deleted time off"); close(); }} />}>
      <div className="form-grid">
        <Field label="Person" full>
          <select value={t.personId} onChange={(e) => set({ personId: e.target.value })}>
            {data.people.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.role.toLowerCase()})</option>)}
          </select>
        </Field>
        <DateFields start={t.start} end={t.end} onChange={(start, end) => set({ start, end })} />
        <Field label="Reason" full><input value={t.reason} placeholder="Vacation, training, sick…" onChange={(e) => set({ reason: e.target.value })} /></Field>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------- a person's own rotation

/** Someone's fixed rotation: on and off days from a first day. They're only offered on their on days. */
function PersonRotationField({ value, onChange }: { value: PersonRotation | null; onChange: (r: PersonRotation | null) => void }) {
  const today_ = format(today(), "yyyy-MM-dd");
  const r = value ?? { on: 21, off: 14, start: today_ };
  const set = (patch: Partial<PersonRotation>) => onChange({ ...r, ...patch });
  return (
    <div className="field full">
      <span>Rotation</span>
      <label className="check">
        <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked ? r : null)} />
        Works a fixed rotation
      </label>
      {value && (
        <span className="rotation" style={{ marginTop: 4 }}>
          <input type="number" inputMode="numeric" min={1} max={365} aria-label="Days on" value={value.on} onChange={(e) => set({ on: Math.max(1, Number(e.target.value) || 1) })} />
          on
          <input type="number" inputMode="numeric" min={0} max={365} aria-label="Days off" value={value.off} onChange={(e) => set({ off: Math.max(0, Number(e.target.value) || 0) })} />
          off, from
          <input type="date" aria-label="First day of an on stretch" value={value.start} style={{ width: "auto" }} onChange={(e) => e.target.value && set({ start: e.target.value })} />
        </span>
      )}
      <span className="hint">
        {value ? "Counted from the first day of an on stretch. They're only offered for shifts on their on days." : "Available any day, apart from time off."}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------- training records on a person

const addMonthsTo = (date: string, months: number) => format(addMonths(new Date(`${date}T00:00`), months), "yyyy-MM-dd");
const fmtDay = (date: string) => format(new Date(`${date}T00:00`), "MMM d, yyyy");

/** A person's courses, one line each; tap one to change it. */
function TrainingRecords({ person, onChange }: { person: Person; onChange: (records: TrainingRecord[]) => void }) {
  const data = useStore((s) => s.data);
  const trainings = data.trainings;
  const [editing, setEditing] = useState<number | null>(null);
  const forRole = trainings.filter((t) => t.appliesTo === "Both" || t.appliesTo === person.role);
  const todayStr = format(today(), "yyyy-MM-dd");
  const soon = format(addDays(today(), data.settings.expiryWarningDays), "yyyy-MM-dd");
  const needs = neededTraining({ ...data, people: data.people.map((p) => (p.id === person.id ? person : p)) }, person);
  const setAt = (i: number, patch: Partial<TrainingRecord>) => onChange(person.training.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  // By course, newest first. Only the newest record of a course counts; older ones were renewed.
  const order = person.training.map((r, i) => ({ r, i })).sort((x, y) =>
    (trainings.find((t) => t.id === x.r.trainingId)?.name ?? "").localeCompare(trainings.find((t) => t.id === y.r.trainingId)?.name ?? "") || y.r.completed.localeCompare(x.r.completed));
  const renewed = new Set(order.filter(({ r }, k) => k > 0 && order[k - 1].r.trainingId === r.trainingId).map(({ i }) => i));
  // Needed courses they have no record of at all.
  const missing = [...needs.keys()].filter((tid) => !person.training.some((r) => r.trainingId === tid));
  const add = (tid?: string) => {
    const t = trainings.find((x) => x.id === tid) ?? forRole.find((x) => !person.training.some((r) => r.trainingId === x.id)) ?? forRole[0] ?? trainings[0];
    if (!t) return;
    onChange([...person.training, { trainingId: t.id, completed: todayStr, expires: t.validMonths ? addMonthsTo(todayStr, t.validMonths) : null }]);
    setEditing(person.training.length);
  };
  return (
    <>
      {person.training.length > 0 && (
        <div className="lines">
          {order.map(({ r, i }) => {
            const t = trainings.find((x) => x.id === r.trainingId);
            const expired = !!r.expires && r.expires <= todayStr;
            const due = !expired && !!r.expires && r.expires <= soon;
            if (editing === i)
              return (
                <div key={i} className="line-edit">
                  <Field label="Course">
                    <select value={r.trainingId} onChange={(e) => {
                      const nt = trainings.find((x) => x.id === e.target.value);
                      setAt(i, { trainingId: e.target.value, expires: nt?.validMonths ? addMonthsTo(r.completed, nt.validMonths) : null });
                    }}>
                      {trainings.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                    </select>
                  </Field>
                  <div className="pair">
                    <Field label="Completed"><input type="date" value={r.completed} onChange={(e) => e.target.value && setAt(i, { completed: e.target.value, expires: t?.validMonths ? addMonthsTo(e.target.value, t.validMonths) : r.expires })} /></Field>
                    <Field label="Runs out" hint="Empty if it never does."><input type="date" value={r.expires ?? ""} onChange={(e) => setAt(i, { expires: e.target.value || null })} /></Field>
                  </div>
                  <div className="row gap-sm">
                    <button className="btn sm danger" onClick={() => { onChange(person.training.filter((_, k) => k !== i)); setEditing(null); }}><Trash2 size={14} /> Remove</button>
                    <span className="grow" />
                    <button className="btn sm primary" onClick={() => setEditing(null)}>Done</button>
                  </div>
                </div>
              );
            return (
              <button key={i} className={`line ${expired && needs.has(r.trainingId) && !renewed.has(i) ? "flag" : ""}`} style={renewed.has(i) ? { opacity: 0.55 } : undefined} onClick={() => setEditing(i)}>
                <span className="name">{t?.name ?? "Deleted course"}</span>
                {renewed.has(i) ? <span className="when">Renewed</span>
                  : !needs.has(r.trainingId) ? <span className="small muted">Not needed</span> : null}
                {renewed.has(i) ? null : expired ? <span className="pill danger">Ran out {fmtDay(r.expires!)}</span>
                  : due ? <span className="pill warn">Runs out {fmtDay(r.expires!)}</span>
                  : <span className="when">{r.expires ? `To ${fmtDay(r.expires)}` : "Never runs out"}</span>}
              </button>
            );
          })}
        </div>
      )}
      {person.training.length === 0 && <p className="muted" style={{ marginTop: 0 }}>No training on record.</p>}
      {missing.length > 0 && (
        <>
          <h4 className="form-section">Needed for their missions, with no record</h4>
          <div className="picker-row">
            {missing.map((tid) => <button key={tid} className="btn sm" onClick={() => add(tid)}><Plus size={14} /> {trainings.find((x) => x.id === tid)?.name}</button>)}
          </div>
        </>
      )}
      <div className="toolbar">
        {trainings.length > 0 ? <button className="btn sm" onClick={() => add()}><Plus size={14} /> Add training</button>
          : <span className="muted">Set up training courses under Training first.</span>}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- training course

function TrainingDialog({ id }: Props) {
  const { data, upsert, remove, close, showToast } = useStore();
  const existing = data.trainings.find((t) => t.id === id);
  const [t, setT] = useState<Training>(() => existing ?? { id: uid(), name: "", validMonths: 12, appliesTo: "Pilot", notes: "" });
  const set = (patch: Partial<Training>) => setT((x) => ({ ...x, ...patch }));
  const holders = data.people.filter((p) => p.training.some((r) => r.trainingId === id)).length;
  const missions = data.missions.filter((m) => m.requiredTrainingIds.includes(id)).length;
  return (
    <Dialog title={existing ? t.name || "Training" : "Add training"} onClose={close}
      meta={existing && <><span>{plural(holders, "person", "people")} on record</span>·<span>Needed by {plural(missions, "mission")}</span></>}
      foot={<Foot isNew={!existing} label="training" disabled={!t.name.trim()}
        onSave={() => { upsert("trainings", t); if (!existing) showToast(`Added “${t.name}”`); close(); }}
        onDelete={() => { remove("trainings", t.id, `Deleted “${t.name}”${holders ? ` and ${plural(holders, "record")}` : ""}`); close(); }} />}>
      <div className="form-grid">
        <Field label="Name" full><input autoFocus value={t.name} placeholder="Night vision goggles (NVG)" onChange={(e) => set({ name: e.target.value })} /></Field>
        <div className="field"><span>Renew every (months)</span><Stepper label="months" max={120} value={t.validMonths} onChange={(validMonths) => set({ validMonths })} /><span className="hint">0 if it never runs out.</span></div>
        <Field label="For">
          <select value={t.appliesTo} onChange={(e) => set({ appliesTo: e.target.value as Training["appliesTo"] })}>
            <option value="Pilot">Pilots</option><option value="Maintainer">Maintainers</option><option value="Both">Pilots and maintainers</option>
          </select>
        </Field>
        <Field label="Notes" full><textarea rows={2} value={t.notes} onChange={(e) => set({ notes: e.target.value })} /></Field>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------- can we take a job?

/** Pick dates and what the job needs; see which tails could fly it and whether there's crew. */
function SupportDialog(_: Props) {
  const { data, close, open } = useStore();
  const [start, setStart] = useState<When>(() => toWhen(tomorrow()));
  const [end, setEnd] = useState<When>(() => toWhen(dayAt(tomorrow(), 30)));
  const [type, setType] = useState<string>("");
  const [pilots, setPilots] = useState(2);
  const [training, setTraining] = useState<string[]>([]);
  const bad = !(ms(end) > ms(start));
  const answers = useMemo(
    () => (bad ? [] : canSupport(data, { start: ms(start), end: ms(end), type: type || null, pilotsNeeded: pilots, training })),
    [data, start, end, type, pilots, training, bad],
  );
  const types = [...new Set(data.aircraft.map((a) => a.type))].sort();
  const yes = answers.filter((a) => a.verdict === "yes").length;
  const book = (aircraftId: string) =>
    open("mission", "new", { start, end, aircraftIds: [aircraftId], pilotsNeeded: pilots, requiredTrainingIds: training });

  return (
    <Dialog wide title="Can we take a job?" onClose={close} foot={<button className="btn" onClick={close}>Close</button>}
      meta={bad ? <span>Check the dates</span> : <><span>{fmtDates(start, end)}</span>·<span className={yes ? "" : "muted"}>{yes ? `${plural(yes, "aircraft", "aircraft")} can take it` : "No aircraft can take it with crew"}</span></>}>
      <div className="form-grid">
        <DateFields start={start} end={end} onChange={(a, b) => { setStart(a); setEnd(b); }} />
        <div className="full pair">
          <Field label="Aircraft type">
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">Any type</option>
              {types.map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <div className="field"><span>Pilots on board</span><Stepper label="pilots" min={1} max={4} value={pilots} onChange={setPilots} /></div>
        </div>
        <div className="field full">
          <span>Training the crew need</span>
          <div className="picker-row">
            {data.trainings.filter((t) => t.appliesTo !== "Maintainer").map((t) => (
              <Pick key={t.id} on={training.includes(t.id)} onToggle={() => setTraining((x) => toggled(x, t.id))}>{t.name}</Pick>
            ))}
          </div>
        </div>
      </div>

      {!bad && (
        <>
          <h4 className="form-section">
            {yes ? `${plural(yes, "aircraft", "aircraft")} can take it, with crew` : answers.some((a) => a.verdict === "crew") ? "Aircraft are free, but crew is short" : "No aircraft can take it"}
          </h4>
          <div className="issues">
            {answers.map((a) => (
              <div key={a.aircraft.id} className={`issue ${a.verdict === "no" ? "danger" : a.verdict === "crew" ? "warn" : ""}`}>
                <span className={`pill ${a.verdict === "yes" ? "ok" : a.verdict === "crew" ? "warn" : "danger"}`} style={{ minWidth: 70, justifyContent: "center" }}>
                  {a.verdict === "yes" ? "Can do" : a.verdict === "crew" ? "Short crew" : "Can't"}
                </span>
                <span className="grow">
                  <b style={{ fontFamily: "var(--zb-font-mono)" }}>{a.aircraft.tail}</b> <span className="muted small">{a.aircraft.type}</span>
                  <div className="small muted">
                    {a.reasons.length ? a.reasons.join(" ") : `At least ${plural(a.fewestPilots, "pilot")} free every day.`}
                  </div>
                  {a.earliest !== undefined && (
                    <button className="link small" onClick={() => { const len = Math.round((ms(end) - ms(start)) / DAY); setStart(toWhen(a.earliest!)); setEnd(toWhen(dayAt(a.earliest!, len))); }}>
                      Free for the whole job from {format(a.earliest, "MMM d")}. Try those dates
                    </button>
                  )}
                </span>
                {a.verdict !== "no" && <button className={`btn sm ${a.verdict === "yes" ? "primary" : ""}`} onClick={() => book(a.aircraft.id)}>Book on {a.aircraft.tail}…</button>}
              </div>
            ))}
            {answers.length === 0 && <div className="muted">Add aircraft first.</div>}
          </div>
          <p className="form-note">Crew is checked day by day (pilots can rotate through the job), counting pilots who are rated on the type, current on the training it needs, and not booked or off. Hitch lengths aren't counted here; the season checks them once it's booked.</p>
        </>
      )}
    </Dialog>
  );
}

/** What a person needs from the missions they work, and where they stand on each. */
function NeedsLine({ person }: { person: Person }) {
  const data = useStore((s) => s.data);
  const needs = neededTraining({ ...data, people: data.people.map((p) => (p.id === person.id ? person : p)) }, person);
  if (!needs.size) return <>They don't need any training for these missions.</>;
  const now = Date.now();
  return (
    <>
      Needs:{" "}
      {[...needs.keys()].map((id, i) => {
        const t = data.trainings.find((x) => x.id === id);
        const ok = trainingStatus(person, id, now, now + 1).state === "ok";
        return <span key={id}>{i > 0 && ", "}{t?.name}{ok ? "" : <b style={{ color: "var(--zb-danger)" }}> (not current)</b>}</span>;
      })}
    </>
  );
}
