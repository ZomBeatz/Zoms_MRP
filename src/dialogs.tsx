import { useMemo, useState } from "react";
import { CopyPlus, Plus, Trash2, Wand2 } from "lucide-react";
import { useStore } from "./store";
import { findIssues, missionCoverage, neededTraining, requiredTraining, trainingStatus, whoCanCover } from "./coverage";
import { canSupport } from "./fleet";
import { DAY, addDays, dateToEnd, dateToStart, dayAt, endToDate, fmtDates, ms, plural, startToDate, toWhen, today, uid } from "./time";
import { addMonths, format } from "date-fns";
import { SWATCHES, missionLook, slotStyle } from "./look";
import { Dialog, Field, LookPicker, StatusPill } from "./components/ui";
import { seasonsOf } from "./bookings";
import { IssueList } from "./pages/Overview";
import type { Aircraft, AppData, MaintenanceJob, Mission, Person, Season, Shift, TimeOff, Training, TrainingRecord, When } from "./types";

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

/** First and last day of something stored as [start midnight, end midnight). */
function DateFields({ start, end, onChange, labels = ["First day", "Last day"] }: { start: When; end: When; onChange: (start: When, end: When) => void; labels?: [string, string] }) {
  const bad = !(ms(end) > ms(start));
  return (
    <>
      <Field label={labels[0]}>
        <input type="date" value={startToDate(start)} onChange={(e) => e.target.value && onChange(dateToStart(e.target.value), end)} />
      </Field>
      <Field label={labels[1]} error={bad ? "The last day can't be before the first day." : null} hint={bad ? undefined : fmtDates(start, end)}>
        <input type="date" value={endToDate(end)} onChange={(e) => e.target.value && onChange(start, dateToEnd(e.target.value))} />
      </Field>
    </>
  );
}

function Foot({ isNew, onDelete, onSave, label, disabled }: { isNew: boolean; onDelete: () => void; onSave: () => void; label: string; disabled?: boolean }) {
  const close = useStore((s) => s.close);
  return (
    <>
      {!isNew && <button className="btn danger left" onClick={onDelete}><Trash2 size={14} /> Delete</button>}
      <button className="btn" onClick={close}>Cancel</button>
      <button className="btn primary" onClick={onSave} disabled={disabled}>{isNew ? `Add ${label}` : "Save"}</button>
    </>
  );
}

/** Known aircraft types, for suggestions as you type. */
const typesOf = (d: AppData) => [...new Set([...d.aircraft.map((a) => a.type), ...d.people.flatMap((p) => p.quals)])].sort();

// ---------------------------------------------------------------- mission (the customer's work)

function MissionDialog({ id, defaults }: Props) {
  const { data, change, remove, close, open } = useStore();
  const existing = data.missions.find((m) => m.id === id);
  const isNew = !existing;
  const [m, setM] = useState<Mission>(() => existing ?? {
    id: uid(), name: "", contact: "", location: "", notes: "",
    requiredTrainingIds: (defaults.requiredTrainingIds as string[] | undefined) ?? [],
    // A new mission takes the next color nobody is using yet.
    color: SWATCHES.find((c) => !data.missions.some((x) => x.color === c)) ?? SWATCHES[0], pattern: "solid",
  });
  // A new mission starts with its first season (dates and aircraft), so it shows up right away.
  const [first, setFirst] = useState<Season>(() => ({
    id: uid(), missionId: m.id, start: toWhen(tomorrow()), end: toWhen(dayAt(tomorrow(), 30)), aircraftId: null,
    pilotsNeeded: 1, maintainersNeeded: 0, status: "Planned", notes: "", ...(defaults as Partial<Season>),
  }));
  const [pool, setPool] = useState<Set<string>>(() => new Set(data.people.filter((p) => p.missionIds.includes(id)).map((p) => p.id)));
  const set = (patch: Partial<Mission>) => setM((x) => ({ ...x, ...patch }));
  const seasons = seasonsOf(data, m.id);
  const firstBad = isNew && !(ms(first.end) > ms(first.start));
  // Aircraft types this mission flies, for the "not on type" hint in its crew list.
  const types = new Set((isNew ? [first] : seasons).map((x) => data.aircraft.find((a) => a.id === x.aircraftId)?.type).filter((t): t is string => !!t));
  const now = Date.now();

  const save = () => {
    if (!m.name.trim() || firstBad) return;
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

  return (
    <Dialog wide title={isNew ? "New mission" : m.name || "Mission"} onClose={close}
      foot={<Foot isNew={isNew} label="mission" disabled={!m.name.trim() || firstBad} onSave={save}
        onDelete={() => { remove("missions", m.id, `Deleted “${m.name}”${seasons.length ? ` and its ${plural(seasons.length, "season")}` : ""}`); close(); }} />}>
      <div className="form-grid">
        <Field label="Mission (customer)" full hint="One customer's kind of work. Its dates are its seasons.">
          <input autoFocus value={m.name} placeholder="Interior Fire Service" onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label="Contact" hint="Who to call at the customer.">
          <input value={m.contact} onChange={(e) => set({ contact: e.target.value })} />
        </Field>
        <Field label="Location">
          <input value={m.location} onChange={(e) => set({ location: e.target.value })} />
        </Field>
      </div>

      {isNew ? (
        <>
          <h4 className="form-section">First season</h4>
          <div className="form-grid">
            <DateFields start={first.start} end={first.end} onChange={(start, end) => setFirst((x) => ({ ...x, start, end }))} />
            <AircraftField value={first.aircraftId} onChange={(aircraftId) => setFirst((x) => ({ ...x, aircraftId }))} />
            <Field label="Pilots on board">
              <input type="number" min={0} max={4} value={first.pilotsNeeded} onChange={(e) => setFirst((x) => ({ ...x, pilotsNeeded: Math.max(0, Number(e.target.value)) }))} />
            </Field>
          </div>
          <span className="small muted">Crew it after saving: open the season from the schedule or this mission.</span>
        </>
      ) : (
        <>
          <h4 className="form-section">Seasons</h4>
          <div className="issues">
            {seasons.map((x) => {
              const ac = data.aircraft.find((a) => a.id === x.aircraftId);
              const pct = Math.round(missionCoverage(data, x).covered * 100);
              const past = ms(x.end) <= now;
              return (
                <button key={x.id} className="issue" style={past ? { opacity: 0.7 } : undefined} onClick={() => open("season", x.id)}>
                  <span className="grow">
                    <b>{fmtDates(x.start, x.end)}</b>
                    <div className="small muted">{ac ? `${ac.tail} · ${ac.type}` : "No aircraft yet"} · {plural(x.pilotsNeeded, "pilot")} on board</div>
                  </span>
                  {x.status !== "Done" && x.status !== "Cancelled" && <span className={`pill ${pct === 100 ? "ok" : "danger"}`}>{pct === 100 ? "Crewed" : `${pct}% crewed`}</span>}
                  <StatusPill status={x.status} />
                </button>
              );
            })}
            {seasons.length === 0 && <div className="small muted">No seasons yet.</div>}
          </div>
          <div className="row gap-sm wrap" style={{ marginTop: 8 }}>
            <button className="btn sm" onClick={() => open("season", "new", { missionId: m.id })}><Plus size={14} /> Add season…</button>
            {seasons.length > 0 && <button className="btn sm" onClick={copyToNext}><CopyPlus size={14} /> Copy to next season</button>}
          </div>
        </>
      )}

      <h4 className="form-section">Training this mission needs</h4>
      <div className="picker-row">
        {data.trainings.map((t) => (
          <label key={t.id} className="chip" style={{ cursor: "pointer", padding: "3px 10px" }}>
            <input type="checkbox" checked={m.requiredTrainingIds.includes(t.id)}
              onChange={() => set({ requiredTrainingIds: m.requiredTrainingIds.includes(t.id) ? m.requiredTrainingIds.filter((x) => x !== t.id) : [...m.requiredTrainingIds, t.id] })} />
            {t.name}
          </label>
        ))}
        {data.trainings.length === 0 && <span className="small muted">No training set up yet. Add courses under Training.</span>}
      </div>
      <span className="small muted">Everyone on this mission needs these, current for their whole hitch. Nobody else does.</span>

      <h4 className="form-section">Crew who work this mission</h4>
      <div className="picker-row">
        {[...data.people]
          // The mission's own crew (as saved) first, then pilots before maintainers, by name.
          .sort((x, y) => Number(y.missionIds.includes(m.id)) - Number(x.missionIds.includes(m.id)) || (x.role === y.role ? x.name.localeCompare(y.name) : x.role === "Pilot" ? -1 : 1))
          .map((p) => {
          const missing = requiredTraining(data, m, p.role).filter((tid) => trainingStatus(p, tid, now, now + 1).state !== "ok");
          const unqualified = types.size > 0 && ![...types].some((t) => p.quals.includes(t));
          return (
            <label key={p.id} className="chip" style={{ cursor: "pointer", padding: "3px 10px" }}
              title={[unqualified ? `Not qualified on ${[...types].join(" or ")}` : "", missing.length ? `Needs ${missing.map((tid) => data.trainings.find((t) => t.id === tid)?.name).join(", ")}` : ""].filter(Boolean).join(". ") || undefined}>
              <input type="checkbox" checked={pool.has(p.id)} onChange={() => setPool((x) => { const n = new Set(x); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })} />
              {p.name}
              <span className="muted">{p.role === "Pilot" ? "pilot" : "maint."}</span>
              {(unqualified || missing.length > 0) && <span className="pill warn">{unqualified ? "Not on type" : `Needs ${missing.length}`}</span>}
            </label>
          );
        })}
      </div>
      <span className="small muted">The people you rotate through this mission. They're suggested first when you crew a season, and only they need its training.</span>

      <h4 className="form-section">Look on the schedule</h4>
      <LookPicker color={m.color} pattern={m.pattern} onChange={(color, pattern) => set({ color, pattern })} />

      <div className="form-grid" style={{ marginTop: 12 }}>
        <Field label="Notes" full><textarea rows={2} value={m.notes} onChange={(e) => set({ notes: e.target.value })} /></Field>
      </div>
    </Dialog>
  );
}

function AircraftField({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
  const aircraft = useStore((s) => s.data.aircraft);
  const ac = aircraft.find((a) => a.id === value);
  return (
    <Field label="Aircraft (tail number)" hint={ac ? `${ac.tail} has ${plural(ac.seats, "pilot seat")}.` : undefined}>
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">Not picked yet</option>
        {[...aircraft].sort((a, b) => a.tail.localeCompare(b.tail)).map((a) => (
          <option key={a.id} value={a.id}>{a.tail} · {a.type}{a.status !== "Ready" ? ` (${a.status.toLowerCase()})` : ""}</option>
        ))}
      </select>
    </Field>
  );
}

// ---------------------------------------------------------------- season (dates, aircraft and crew)

function SeasonDialog({ id, defaults }: Props) {
  const { data, change, remove, close, open } = useStore();
  const existing = data.seasons.find((x) => x.id === id);
  const isNew = !existing;
  const [season, setSeason] = useState<Season>(() => existing ?? {
    id: uid(), missionId: data.missions[0]?.id ?? "", start: toWhen(tomorrow()), end: toWhen(dayAt(tomorrow(), 30)), aircraftId: null,
    pilotsNeeded: 1, maintainersNeeded: 0, status: "Planned", notes: "", ...(defaults as Partial<Season>),
  });
  const [shifts, setShifts] = useState<Shift[]>(() => data.shifts.filter((s) => s.seasonId === id));
  const set = (patch: Partial<Season>) => setSeason((x) => ({ ...x, ...patch }));
  const mission = data.missions.find((x) => x.id === season.missionId);
  const ac = data.aircraft.find((a) => a.id === season.aircraftId);

  // Check the draft as if it were saved, so coverage and conflicts update while editing.
  const draft: AppData = useMemo(() => ({
    ...data,
    seasons: [...data.seasons.filter((x) => x.id !== season.id), season],
    shifts: [...data.shifts.filter((s) => s.seasonId !== season.id), ...shifts],
  }), [data, season, shifts]);
  const cov = missionCoverage(draft, season);
  const issues = useMemo(() => findIssues(draft).filter((i) => i.seasonId === season.id), [draft, season.id]);
  const from = ms(season.start), to = ms(season.end);
  const timeError = !(to > from) ? "The last day can't be before the first day." : null;
  const required = mission ? requiredTraining(draft, mission) : [];
  const days = Math.round((to - from) / DAY);
  const [rotDays, setRotDays] = useState(14);
  const pct = (t: number) => ((t - from) / (to - from)) * 100;
  const who = (d: AppData, role: Person["role"], a: number, b: number, except: string[] = []) =>
    whoCanCover(d, role, a, b, ac?.type ?? null, except, required, season.missionId);
  const shiftFor = (personId: string, a: number, b: number): Shift => ({ id: uid(), seasonId: season.id, personId, start: toWhen(a), end: toWhen(b) });

  if (!data.missions.length)
    return (
      <Dialog title="New season" onClose={close} foot={<><button className="btn" onClick={close}>Cancel</button><button className="btn primary" onClick={() => open("mission", "new", defaults)}>New mission…</button></>}>
        <p>A season is a stretch of dates for a mission. Add the mission first; its first season comes with it.</p>
      </Dialog>
    );

  const addShift = (role: Person["role"], a = from, b = to) => {
    const free = who(draft, role, a, b).find((c) => c.ok && !shifts.some((s) => s.personId === c.person.id && ms(s.start) < b && ms(s.end) > a));
    const personId = free?.person.id ?? data.people.find((p) => p.role === role)?.id;
    if (personId) setShifts((s) => [...s, shiftFor(personId, a, b)]);
  };

  /** Fill every open seat with the best free, qualified pilots. */
  const fillGaps = () => {
    let current = draft;
    const added: Shift[] = [];
    for (const g of missionCoverage(current, season).pilotGaps)
      for (let k = 0; k < g.short; k++) {
        const pick = who(current, "Pilot", g.a, g.b).find((c) => c.ok);
        if (!pick) break;
        const s = shiftFor(pick.person.id, g.a, g.b);
        added.push(s);
        current = { ...current, shifts: [...current.shifts, s] };
      }
    if (added.length) setShifts((s) => [...s, ...added]);
    else useStore.getState().showToast("Nobody free and qualified for the open seats.");
  };

  /** Split the season into hitches of `every` days so pilots rotate, picking free, current pilots for each. */
  const splitRotation = (every: number) => {
    const legs = Math.ceil(days / every);
    const others = shifts.filter((s) => data.people.find((p) => p.id === s.personId)?.role !== "Pilot");
    let current: AppData = { ...draft, shifts: [...data.shifts.filter((s) => s.seasonId !== season.id), ...others] };
    const added: Shift[] = [];
    for (let i = 0; i < legs; i++) {
      const a = dayAt(from, i * every), b = Math.min(to, dayAt(from, (i + 1) * every));
      for (let seat = 0; seat < season.pilotsNeeded; seat++) {
        const pick = who(current, "Pilot", a, b).find((c) => c.ok);
        if (!pick) continue;
        const s = shiftFor(pick.person.id, a, b);
        added.push(s);
        current = { ...current, shifts: [...current.shifts, s] };
      }
    }
    setShifts([...others, ...added]);
  };

  const save = () => {
    if (!mission || timeError) return;
    change((d) => ({
      ...d,
      seasons: isNew ? [...d.seasons, season] : d.seasons.map((x) => (x.id === season.id ? season : x)),
      shifts: [...d.shifts.filter((s) => s.seasonId !== season.id), ...shifts],
      // Anyone with a shift works this mission.
      people: d.people.map((p) => (shifts.some((s) => s.personId === p.id) && !p.missionIds.includes(season.missionId) ? { ...p, missionIds: [...p.missionIds, season.missionId] } : p)),
    }), isNew ? `Added a season to “${mission.name}”` : undefined);
    close();
  };

  // Who could take a shift, judged on that shift's own dates (not the whole season).
  const people = (role: Person["role"], shift: Shift) => who(draft, role, ms(shift.start), ms(shift.end), [shift.id]);

  const shiftRows = (role: Person["role"]) => {
    const list = shifts.filter((s) => data.people.find((p) => p.id === s.personId)?.role === role).sort((a, b) => ms(a.start) - ms(b.start));
    return (
      <div className="shifts">
        {list.map((s) => (
          <div key={s.id} className="shift-row">
            <select aria-label="Person" value={s.personId} onChange={(e) => setShifts((all) => all.map((x) => (x.id === s.id ? { ...x, personId: e.target.value } : x)))}>
              {people(role, s).map((c) => (
                <option key={c.person.id} value={c.person.id}>
                  {c.person.name}{!c.qualified ? " (not qualified)" : !c.trained ? " (training not current)" : c.off ? " (time off)" : c.busy ? " (busy)" : c.regular ? "" : " (not on this mission's crew)"}
                </option>
              ))}
            </select>
            <input type="date" aria-label="First day" value={startToDate(s.start)} onChange={(e) => e.target.value && setShifts((all) => all.map((x) => (x.id === s.id ? { ...x, start: dateToStart(e.target.value) } : x)))} />
            <input type="date" aria-label="Last day" value={endToDate(s.end)} onChange={(e) => e.target.value && setShifts((all) => all.map((x) => (x.id === s.id ? { ...x, end: dateToEnd(e.target.value) } : x)))} />
            <button className="icon-btn danger" aria-label="Remove shift" onClick={() => setShifts((all) => all.filter((x) => x.id !== s.id))}><Trash2 size={15} /></button>
          </div>
        ))}
        {list.length === 0 && <div className="small muted">No {role === "Pilot" ? "pilots" : "maintainers"} yet.</div>}
      </div>
    );
  };

  return (
    <Dialog wide title={isNew ? "New season" : `${mission?.name ?? "Season"}, ${fmtDates(season.start, season.end)}`} onClose={close}
      foot={<Foot isNew={isNew} label="season" disabled={!mission || !!timeError} onSave={save}
        onDelete={() => { remove("seasons", season.id, `Deleted the season ${fmtDates(season.start, season.end)}`); close(); }} />}>
      <div className="form-grid">
        <Field label="Mission">
          <span className="row gap-sm">
            <select className="grow" value={season.missionId} onChange={(e) => set({ missionId: e.target.value })} disabled={!isNew}>
              {data.missions.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
            {mission && <button type="button" className="btn sm" onClick={() => open("mission", mission.id)} title="Name, training, crew and look are on the mission">Open mission…</button>}
          </span>
        </Field>
        <Field label="Status">
          <select value={season.status} onChange={(e) => set({ status: e.target.value as Season["status"] })}>
            {(["Planned", "Confirmed", "Flying", "Done", "Cancelled"] as const).map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <DateFields start={season.start} end={season.end} onChange={(start, end) => set({ start, end })} />
        <AircraftField value={season.aircraftId} onChange={(aircraftId) => set({ aircraftId })} />
        <span />
        <Field label="Pilots on board">
          <input type="number" min={0} max={4} value={season.pilotsNeeded} onChange={(e) => set({ pilotsNeeded: Math.max(0, Number(e.target.value)) })} />
        </Field>
        <Field label="Maintainers on call">
          <input type="number" min={0} max={6} value={season.maintainersNeeded} onChange={(e) => set({ maintainersNeeded: Math.max(0, Number(e.target.value)) })} />
        </Field>
      </div>
      {required.length > 0 && (
        <p className="small muted" style={{ margin: "8px 0 0" }}>
          “{mission?.name}” needs {required.map((tid) => data.trainings.find((t) => t.id === tid)?.name).filter(Boolean).join(", ")}.
        </p>
      )}

      <h4 className="form-section">Pilots</h4>
      {!timeError && season.pilotsNeeded > 0 && (
        <>
          <div className="cov-bar" aria-label={`${Math.round(cov.covered * 100)}% crewed`}>
            {cov.pilotGaps.map((g) => <div key={g.a} className="gap" style={{ left: `${pct(g.a)}%`, width: `${pct(g.b) - pct(g.a)}%` }} title={`${g.short} open, ${fmtDates(toWhen(g.a), toWhen(g.b))}`} />)}
          </div>
          <div className="small muted" style={{ marginBottom: 8 }}>
            {cov.pilotGaps.length
              ? `Every seat is filled on ${Math.round(cov.covered * 100)}% of days. The striped parts have ${season.pilotsNeeded > 1 ? "at least one" : "an"} open seat.`
              : "Every seat is filled for the whole season."}
          </div>
        </>
      )}
      {shiftRows("Pilot")}
      <div className="row gap-sm wrap" style={{ marginTop: 8 }}>
        <button className="btn sm" onClick={() => addShift("Pilot")}><Plus size={14} /> Add pilot</button>
        {cov.pilotGaps.length > 0 && <button className="btn sm" onClick={fillGaps}><Wand2 size={14} /> Fill open seats</button>}
        {!timeError && days > 1 && (
          <span className="row gap-sm" title="Replace the pilot shifts with hitches of this many days, and pick free, qualified, current pilots for each">
            <button className="btn sm" onClick={() => splitRotation(Math.max(1, rotDays))}>Rotate pilots every</button>
            <input type="number" min={1} max={days} value={rotDays} aria-label="Days per hitch" style={{ width: 64 }} onChange={(e) => setRotDays(Math.max(1, Number(e.target.value)))} />
            <span className="small muted">days</span>
          </span>
        )}
      </div>

      <h4 className="form-section">Maintainers on call</h4>
      {shiftRows("Maintainer")}
      <div style={{ marginTop: 8 }}>
        <button className="btn sm" onClick={() => addShift("Maintainer")}><Plus size={14} /> Add maintainer</button>
      </div>

      {issues.length > 0 && (
        <>
          <h4 className="form-section">Problems with this season</h4>
          <IssueList issues={issues} />
        </>
      )}

      <div className="form-grid" style={{ marginTop: 12 }}>
        <Field label="Notes" full><textarea rows={2} value={season.notes} onChange={(e) => set({ notes: e.target.value })} /></Field>
      </div>
    </Dialog>
  );
}

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
    <Dialog title={existing ? a.tail : "Add aircraft"} onClose={close}
      foot={<Foot isNew={!existing} label="aircraft" disabled={!tail || !a.type.trim() || taken}
        onSave={() => { upsert("aircraft", { ...a, tail }); if (!existing) showToast(`Added ${tail}`); close(); }}
        onDelete={() => { remove("aircraft", a.id, `Deleted ${a.tail}`); close(); }} />}>
      <div className="form-grid">
        <Field label="Tail number" error={error} hint="How MRP identifies this aircraft everywhere.">
          <input autoFocus value={a.tail} placeholder="N412ZM" style={{ fontFamily: "var(--zb-font-mono)", textTransform: "uppercase" }} onChange={(e) => set({ tail: e.target.value })} />
        </Field>
        <Field label="Type" hint="Crew qualifications match this.">
          <input list="mrp-types" value={a.type} placeholder="Bell 412" onChange={(e) => set({ type: e.target.value })} />
          <datalist id="mrp-types">{typesOf(data).map((t) => <option key={t} value={t} />)}</datalist>
        </Field>
        <Field label="Status">
          <select value={a.status} onChange={(e) => set({ status: e.target.value as Aircraft["status"] })}>
            {(["Ready", "In maintenance", "Grounded", "Retired"] as const).map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Pilot seats">
          <select value={a.seats} onChange={(e) => set({ seats: Number(e.target.value) })}>
            <option value={1}>1</option><option value={2}>2</option>
          </select>
        </Field>
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
  const [p, setP] = useState<Person>(() => existing ?? { id: uid(), name: "", role: "Pilot", quals: [], training: [], missionIds: [], base: "", phone: "", notes: "", ...(defaults as Partial<Person>) });
  const set = (patch: Partial<Person>) => setP((x) => ({ ...x, ...patch }));
  const [newQual, setNewQual] = useState("");
  const types = [...new Set([...typesOf(data), ...p.quals])].sort();
  const toggle = (t: string) => set({ quals: p.quals.includes(t) ? p.quals.filter((q) => q !== t) : [...p.quals, t] });
  return (
    <Dialog title={existing ? p.name : `Add ${p.role === "Pilot" ? "pilot" : "maintainer"}`} onClose={close}
      foot={<Foot isNew={!existing} label={p.role === "Pilot" ? "pilot" : "maintainer"} disabled={!p.name.trim()}
        onSave={() => { upsert("people", p); if (!existing) showToast(`Added ${p.name}`); close(); }}
        onDelete={() => { remove("people", p.id, `Deleted ${p.name} and their shifts`); close(); }} />}>
      <div className="form-grid">
        <Field label="Name"><input autoFocus value={p.name} onChange={(e) => set({ name: e.target.value })} /></Field>
        <Field label="Role">
          <select value={p.role} onChange={(e) => set({ role: e.target.value as Person["role"] })}>
            <option>Pilot</option><option>Maintainer</option>
          </select>
        </Field>
        <div className="field full">
          <span>Qualified on</span>
          <div className="picker-row">
            {types.map((t) => (
              <label key={t} className="chip" style={{ cursor: "pointer", padding: "3px 10px" }}>
                <input type="checkbox" checked={p.quals.includes(t)} onChange={() => toggle(t)} /> {t}
              </label>
            ))}
            <input placeholder="Another type" value={newQual} style={{ width: 140 }} onChange={(e) => setNewQual(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && newQual.trim()) { e.preventDefault(); set({ quals: [...new Set([...p.quals, newQual.trim()])] }); setNewQual(""); } }} />
          </div>
          <span className="hint">Aircraft types this person can fly or work on.</span>
        </div>
        <div className="field full">
          <span>Works on</span>
          <div className="picker-row">
            {data.missions.map((m) => {
              const on = p.missionIds.includes(m.id);
              return (
                <label key={m.id} className="chip" style={{ cursor: "pointer", padding: "3px 10px" }}>
                  <input type="checkbox" checked={on} onChange={() => set({ missionIds: on ? p.missionIds.filter((x) => x !== m.id) : [...p.missionIds, m.id] })} />
                  <span className="swatch" style={{ ...slotStyle(missionLook(m)), width: 10, height: 10 }} />{m.name}
                </label>
              );
            })}
          </div>
          <NeedsLine person={p} />
        </div>
        <TrainingRecords person={p} onChange={(training) => set({ training })} />
        <Field label="Base"><input value={p.base} onChange={(e) => set({ base: e.target.value })} /></Field>
        <Field label="Phone"><input value={p.phone} onChange={(e) => set({ phone: e.target.value })} /></Field>
        <Field label="Notes" full><textarea rows={2} value={p.notes} onChange={(e) => set({ notes: e.target.value })} /></Field>
      </div>
      {existing && (
        <button className="btn sm" style={{ marginTop: 12 }} onClick={() => open("timeOff", "new", { personId: p.id })}>Add time off…</button>
      )}
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
  const timeError = ms(j.end) > ms(j.start) ? null : "The last day can't be before the first day.";
  const crew = whoCanCover(data, "Maintainer", ms(j.start), ms(j.end), ac?.type ?? null, []);
  return (
    <Dialog title={existing ? j.title : "New maintenance job"} onClose={close}
      foot={<Foot isNew={!existing} label="job" disabled={!j.title.trim() || !j.aircraftId || !!timeError}
        onSave={() => { upsert("jobs", j); if (!existing) showToast(`Added “${j.title}”`); close(); }}
        onDelete={() => { remove("jobs", j.id, `Deleted “${j.title}”`); close(); }} />}>
      <div className="form-grid">
        <Field label="Job" full><input autoFocus value={j.title} placeholder="100 hour inspection" onChange={(e) => set({ title: e.target.value })} /></Field>
        <Field label="Aircraft (tail number)">
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
        <DateFields start={j.start} end={j.end} onChange={(start, end) => set({ start, end })} />
        <div className="field full">
          <span>Maintainers</span>
          <div className="picker-row">
            {crew.map((c) => (
              <label key={c.person.id} className="chip" style={{ cursor: "pointer", padding: "3px 10px" }} title={!c.qualified ? `Not qualified on the ${ac?.type}` : c.off ? "Time off" : c.busy ? "Booked elsewhere" : "Free"}>
                <input type="checkbox" checked={j.maintainerIds.includes(c.person.id)}
                  onChange={() => set({ maintainerIds: j.maintainerIds.includes(c.person.id) ? j.maintainerIds.filter((x) => x !== c.person.id) : [...j.maintainerIds, c.person.id] })} />
                {c.person.name}{!c.qualified ? " (not qualified)" : c.off ? " (off)" : c.busy && !j.maintainerIds.includes(c.person.id) ? " (busy)" : ""}
              </label>
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
  const timeError = ms(t.end) > ms(t.start) ? null : "The last day can't be before the first day.";
  return (
    <Dialog title={existing ? "Time off" : "Add time off"} onClose={close}
      foot={<Foot isNew={!existing} label="time off" disabled={!t.personId || !!timeError}
        onSave={() => { upsert("timeOff", t); if (!existing) showToast("Added time off"); close(); }}
        onDelete={() => { remove("timeOff", t.id, "Deleted time off"); close(); }} />}>
      <div className="form-grid">
        <Field label="Person" full>
          <select value={t.personId} onChange={(e) => set({ personId: e.target.value })}>
            {data.people.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.role.toLowerCase()})</option>)}
          </select>
        </Field>
        <DateFields start={t.start} end={t.end} onChange={(start, end) => set({ start, end })} />
        <Field label="Reason" full hint="Vacation, training, sick…"><input value={t.reason} onChange={(e) => set({ reason: e.target.value })} /></Field>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------- training records on a person

const addMonthsTo = (date: string, months: number) => format(addMonths(new Date(`${date}T00:00`), months), "yyyy-MM-dd");

function TrainingRecords({ person, onChange }: { person: Person; onChange: (records: TrainingRecord[]) => void }) {
  const trainings = useStore((s) => s.data.trainings);
  const forRole = trainings.filter((t) => t.appliesTo === "Both" || t.appliesTo === person.role);
  const todayStr = format(today(), "yyyy-MM-dd");
  const setAt = (i: number, patch: Partial<TrainingRecord>) => onChange(person.training.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  return (
    <div className="field full">
      <span>Training</span>
      <div className="shifts">
        {person.training.map((r, i) => {
          const t = trainings.find((x) => x.id === r.trainingId);
          const expired = r.expires && r.expires <= todayStr;
          return (
            <div key={i} className="shift-row">
              <select aria-label="Training" value={r.trainingId} onChange={(e) => {
                const nt = trainings.find((x) => x.id === e.target.value);
                setAt(i, { trainingId: e.target.value, expires: nt?.validMonths ? addMonthsTo(r.completed, nt.validMonths) : null });
              }}>
                {trainings.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
              <input type="date" aria-label="Completed" title="Completed" value={r.completed} onChange={(e) => e.target.value && setAt(i, { completed: e.target.value, expires: t?.validMonths ? addMonthsTo(e.target.value, t.validMonths) : r.expires })} />
              <input type="date" aria-label="Runs out" title={expired ? "Has run out" : "Runs out"} value={r.expires ?? ""} style={expired ? { borderColor: "var(--zb-danger)" } : undefined}
                onChange={(e) => setAt(i, { expires: e.target.value || null })} />
              <button type="button" className="icon-btn danger" aria-label="Remove training" onClick={() => onChange(person.training.filter((_, k) => k !== i))}><Trash2 size={15} /></button>
            </div>
          );
        })}
      </div>
      {forRole.length > 0 ? (
        <div>
          <button type="button" className="btn sm" style={{ marginTop: 6 }} onClick={() => {
            const t = forRole.find((x) => !person.training.some((r) => r.trainingId === x.id)) ?? forRole[0];
            onChange([...person.training, { trainingId: t.id, completed: todayStr, expires: t.validMonths ? addMonthsTo(todayStr, t.validMonths) : null }]);
          }}><Plus size={14} /> Add training</button>
        </div>
      ) : (
        <span className="hint">Set up training courses under Training first.</span>
      )}
      <span className="hint">Completed, then the day it runs out. Leave the second date empty if it never runs out.</span>
    </div>
  );
}

// ---------------------------------------------------------------- training course

function TrainingDialog({ id }: Props) {
  const { data, upsert, remove, close, showToast } = useStore();
  const existing = data.trainings.find((t) => t.id === id);
  const [t, setT] = useState<Training>(() => existing ?? { id: uid(), name: "", validMonths: 12, appliesTo: "Pilot", notes: "" });
  const set = (patch: Partial<Training>) => setT((x) => ({ ...x, ...patch }));
  const holders = data.people.filter((p) => p.training.some((r) => r.trainingId === id)).length;
  return (
    <Dialog title={existing ? t.name || "Training" : "Add training"} onClose={close}
      foot={<Foot isNew={!existing} label="training" disabled={!t.name.trim()}
        onSave={() => { upsert("trainings", t); if (!existing) showToast(`Added “${t.name}”`); close(); }}
        onDelete={() => { remove("trainings", t.id, `Deleted “${t.name}”${holders ? ` and ${plural(holders, "record")}` : ""}`); close(); }} />}>
      <div className="form-grid">
        <Field label="Name" full><input autoFocus value={t.name} placeholder="Night vision goggles (NVG)" onChange={(e) => set({ name: e.target.value })} /></Field>
        <Field label="Renew every" hint="Months. 0 if it never runs out.">
          <input type="number" min={0} max={120} value={t.validMonths} onChange={(e) => set({ validMonths: Math.max(0, Number(e.target.value)) })} />
        </Field>
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
    open("mission", "new", { start, end, aircraftId, pilotsNeeded: pilots, requiredTrainingIds: training });

  return (
    <Dialog wide title="Can we take a job?" onClose={close} foot={<button className="btn" onClick={close}>Close</button>}>
      <div className="form-grid">
        <DateFields start={start} end={end} onChange={(a, b) => { setStart(a); setEnd(b); }} />
        <Field label="Aircraft type">
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Any type</option>
            {types.map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Pilots on board">
          <input type="number" min={1} max={4} value={pilots} onChange={(e) => setPilots(Math.max(1, Number(e.target.value)))} />
        </Field>
        <div className="field full">
          <span>Training the crew need</span>
          <div className="picker-row">
            {data.trainings.filter((t) => t.appliesTo !== "Maintainer").map((t) => (
              <label key={t.id} className="chip" style={{ cursor: "pointer", padding: "3px 10px" }}>
                <input type="checkbox" checked={training.includes(t.id)} onChange={() => setTraining((x) => (x.includes(t.id) ? x.filter((y) => y !== t.id) : [...x, t.id]))} />
                {t.name}
              </label>
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
          <p className="small muted">Crew is checked day by day (pilots can rotate through the job), counting pilots who are qualified on the type, current on the training it needs, and not booked or off. Hitch lengths aren't counted here; the mission checks them once it's booked.</p>
        </>
      )}
    </Dialog>
  );
}

/** What a person needs from the missions they work, and where they stand on each. */
function NeedsLine({ person }: { person: Person }) {
  const data = useStore((s) => s.data);
  const needs = neededTraining({ ...data, people: data.people.map((p) => (p.id === person.id ? person : p)) }, person);
  if (!needs.size) return <span className="hint">They don't need any training for these missions.</span>;
  const now = Date.now();
  return (
    <span className="hint">
      Needs:{" "}
      {[...needs.keys()].map((id, i) => {
        const t = data.trainings.find((x) => x.id === id);
        const ok = trainingStatus(person, id, now, now + 1).state === "ok";
        return <span key={id}>{i > 0 && ", "}{t?.name}{ok ? "" : <b style={{ color: "var(--zb-danger)" }}> (not current)</b>}</span>;
      })}
    </span>
  );
}
