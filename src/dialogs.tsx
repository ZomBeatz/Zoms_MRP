import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, CopyPlus, Plus, Trash2, Wand2 } from "lucide-react";
import { fillSeason } from "./fill";
import { fmtRotation, seasonTails, seasonTypes } from "./rotation";
import { keepForm, keptForm, useStore } from "./store";
import { dutyOf, findIssues, missionCoverage, neededTraining, requiredTraining, trainingStatus, whoCanCover } from "./coverage";
import { canSupport } from "./fleet";
import { DAY, addDays, dateToEnd, dateToStart, dayAt, endToDate, fmtDates, fmtSpan, ms, plural, startToDate, toWhen, today, uid } from "./time";
import { addMonths, format } from "date-fns";
import { SWATCHES, missionLook, slotStyle } from "./look";
import { Avatar, Dialog, Field, autoFocusBox, LookPicker, NumberInput, StatusPill, Stepper, initials, useDirty, useGuardedClose, useSpot } from "./components/ui";
import { bookings, seasonsOf } from "./bookings";
import { DateInput, DateRange } from "./components/dates";
import { rulesFor, seasonRules, stricter } from "./limits";
import { flightHours } from "./program";
import { daysSince } from "./currency";
import { ConfirmButton, IssueList } from "./pages/Overview";
import type { Fix } from "./fixes";
import { validUntil } from "./types";
import type { Aircraft, AppData, Limits, MaintainerNeed, MaintenanceJob, Mission, Rules, Person, PersonRotation, Rotation, Season, Shift, TimeOff, Training, TrainingRecord, When } from "./types";

/** Opens the right dialog for whatever `editing` points at. */
export function Dialogs() {
  const editing = useStore((s) => s.editing)!;
  const props = { id: editing.id, defaults: editing.defaults ?? {}, fix: editing.fix ?? {} };
  switch (editing.kind) {
    case "mission": return <MissionDialog key={editing.id} {...props} />;
    case "season": return <SeasonDialog key={editing.id} {...props} />;
    case "aircraft": return <AircraftDialog key={editing.id} {...props} />;
    case "person": return <PersonDialog key={editing.id} {...props} />;
    case "job": return <JobDialog key={editing.id} {...props} />;
    case "timeOff": return <TimeOffDialog key={editing.id} {...props} />;
    case "training": return <TrainingDialog key={editing.id} {...props} />;
    case "support": return <SupportDialog key={editing.id} {...props} />;
    case "swap": return <SwapDialog key={editing.id} {...props} />;
  }
}

/** `fix`: open on this tab and point at this spot (see src/fixes.ts). */
type Props = { id: string; defaults: Record<string, unknown>; fix?: { tab?: string; spot?: string } };

/** Leaves this form's unsaved state behind when it opens another form, so it comes back as it was. */
function useKeep(state: object) {
  useEffect(() => {
    keepForm(() => state);
    return () => keepForm(null);
  });
}

const tomorrow = () => dayAt(Date.now(), 1);

/** First and last day of something stored as [start midnight, end midnight), with a calendar. `min`/`max` limit it (a shift to its season). */
function DateFields({ start, end, onChange, labels = ["First day", "Last day"], spot, min, max, note }: {
  start: When; end: When; onChange: (start: When, end: When) => void; labels?: [string, string]; spot?: string; min?: When; max?: When; note?: string;
}) {
  return (
    <DateRange spot={spot} labels={labels} note={note} first={startToDate(start)} last={endToDate(end)}
      min={min ? startToDate(min) : undefined} max={max ? endToDate(max) : undefined}
      onChange={(f, l) => onChange(dateToStart(f), dateToEnd(l))} />
  );
}

/**
 * Delete, Cancel and Save. Save stays clickable: if something's missing, it says what instead of
 * going grey, so nobody is left wondering why nothing happens.
 */
function Foot({ isNew, onDelete, onSave, label, problem }: { isNew: boolean; onDelete: () => void; onSave: () => void; label: string; problem?: string | false | null }) {
  const close = useGuardedClose() ?? useStore.getState().close;
  const showToast = useStore((s) => s.showToast);
  const [sure, setSure] = useState(false);
  return (
    <>
      {!isNew && (sure
        ? <button className="btn danger left" onClick={onDelete} onBlur={() => setSure(false)} autoFocus><Trash2 size={14} /> Delete for good?</button>
        : <button className="btn danger left" onClick={() => setSure(true)} aria-label={`Delete this ${label}`}><Trash2 size={14} /> <span className="label">Delete</span></button>)}
      <button className="btn" onClick={close}>Cancel</button>
      <button className="btn primary" onClick={() => (problem ? showToast(problem) : onSave())}>{isNew ? `Add ${label}` : "Save"}</button>
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
  const [kept] = useState(() => keptForm<{ tab: string; m: Mission; pool: Set<string> }>());
  const [tab, setTab] = useState(kept.tab ?? "details");
  const [m, setM] = useState<Mission>(() => kept.m ?? existing ?? {
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
  const [pool, setPool] = useState<Set<string>>(() => kept.pool ?? new Set(data.people.filter((p) => p.missionIds.includes(id)).map((p) => p.id)));
  const dirty = useDirty({ m, first, pool });
  useKeep({ tab, m, pool });
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
  const chip = (p: Person) => {
    const missing = requiredTraining(data, m, p.role).filter((tid) => trainingStatus(p, tid, now, now + 1).state !== "ok");
    return (
      <Pick key={p.id} on={pool.has(p.id)} onToggle={() => setPool((x) => { const n = new Set(x); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })}
        title={missing.length ? `Needs ${missing.map((tid) => data.trainings.find((t) => t.id === tid)?.name).join(", ")}` : undefined}>
        {p.name}
        {missing.length > 0 && <span className="pill warn">Needs {plural(missing.length, "course")}</span>}
      </Pick>
    );
  };
  /** One role: who's on the crew, who could join, and (folded away) who isn't rated on these aircraft. */
  const crewGroup = (role: Person["role"]) => {
    const all = crewOf(role);
    const rated = (p: Person) => types.size === 0 || [...types].some((t) => p.quals.includes(t));
    const on = all.filter((p) => pool.has(p.id));
    const could = all.filter((p) => !pool.has(p.id) && rated(p));
    const other = all.filter((p) => !pool.has(p.id) && !rated(p));
    const word = role === "Pilot" ? "pilots" : "maintainers";
    return (
      <>
        <h4 className="form-section">{role === "Pilot" ? "Pilots" : "Maintainers"} on the crew <span className="chip">{on.length}</span></h4>
        <div className="picker-row">{on.length ? on.map(chip) : <span className="muted small">None yet. Tap people below to add them.</span>}</div>
        {could.length > 0 && (
          <>
            <p className="form-note" style={{ margin: "10px 0 6px" }}>Could join (rated on {types.size ? [...types].join(" or ") : "any type"}):</p>
            <div className="picker-row">{could.map(chip)}</div>
          </>
        )}
        {other.length > 0 && (
          <details className="fold-more">
            <summary>{plural(other.length, role === "Pilot" ? "other pilot" : "other maintainer")}, not rated on these aircraft</summary>
            <div className="picker-row">{other.map(chip)}</div>
          </details>
        )}
        {all.length === 0 && <span className="muted small">No {word} yet. Add them under Crew.</span>}
      </>
    );
  };

  return (
    <Dialog wide title={isNew ? m.name || "New mission" : m.name || "Mission"} onClose={close} dirty={dirty}
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
        ...(isNew ? [] : [{ key: "rotations", label: "Rotations" }]),
      ]}
      tab={tab} onTab={setTab}
      foot={<Foot isNew={isNew} label="mission" problem={!m.name.trim() ? "Give the mission a name first (Details tab)." : firstBad && "The first season's last day is before its first day."} onSave={save}
        onDelete={() => { remove("missions", m.id, `Deleted “${m.name}”${seasons.length ? ` and its ${plural(seasons.length, "season")}` : ""}`); close(); }} />}>
      {tab === "details" && (
        <div className="form-grid">
          <Field label="Mission (customer)" full>
            <input autoFocus={autoFocusBox} value={m.name} placeholder="Interior Fire Service" onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <Field label="Contact"><input value={m.contact} placeholder="Who to call" onChange={(e) => set({ contact: e.target.value })} /></Field>
          <Field label="Location"><input value={m.location} onChange={(e) => set({ location: e.target.value })} /></Field>
          <LimitsField value={m.limits} onChange={(limits) => set({ limits })} who="this mission" applies={stricter(data.settings.rules, m.limits)} />
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
            <AircraftPicker value={first.aircraftIds} onChange={(aircraftIds) => setF({ aircraftIds })} when={{ start: first.start, end: first.end, seasonId: first.id }} />
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
                  <div key={x.id} className="line with-action" style={ms(x.end) <= now ? { opacity: 0.65 } : undefined}>
                    <button className="line-main" onClick={() => open("season", x.id)}>
                      <span className="grow">
                        <span className="name" style={{ display: "block" }}>{fmtSpan(x.start, x.end)}</span>
                        <span className="small muted">{seasonTails(data, x)} · {x.pilotsNeeded}P{x.maintainersNeeded ? ` + ${x.maintainersNeeded}M` : ""}{x.pilotRotation ? ` · ${fmtRotation(x.pilotRotation)}` : ""}</span>
                      </span>
                      {live && <span className={`pill ${pct === 100 ? "ok" : "danger"}`}>{pct}%</span>}
                      <StatusPill status={x.status} />
                    </button>
                    <ConfirmButton season={{ ...x, name: m.name }} />
                  </div>
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

      {tab === "rotations" && !isNew && <RotationsTab missionId={m.id} pool={pool} />}

      {tab === "crew" && (
        <>
          <p className="form-note" style={{ marginTop: 0 }}>The people who rotate through this mission. They're picked first when a season is filled, and only they need its training.</p>
          {crewGroup("Pilot")}
          {crewGroup("Maintainer")}
        </>
      )}
    </Dialog>
  );
}

/**
 * A mission's seasons as rotations: each running or coming season's hitches in order (who, when, handovers
 * and open seats), Fill from the crew (only the people on the Crew tab), and Sub in someone else for an open
 * seat: people outside the crew who are rated, current, free and rested for those days.
 */
function RotationsTab({ missionId, pool }: { missionId: string; pool: Set<string> }) {
  const { data, change, open } = useStore();
  const [sub, setSub] = useState<{ seasonId: string; role: Person["role"]; a: number; b: number } | null>(null);
  const now = Date.now();
  const seasons = seasonsOf(data, missionId).filter((x) => ms(x.end) > now && x.status !== "Cancelled" && x.status !== "Done");
  const people = new Map(data.people.map((p) => [p.id, p]));
  const outside = new Set(data.people.filter((p) => !pool.has(p.id)).map((p) => p.id));

  const fillFromCrew = (season: Season) => {
    let d = data;
    let n = 0;
    for (const role of ["Pilot", "Maintainer"] as const) {
      const added = fillSeason(d, season, role, role === "Pilot" ? season.pilotRotation : season.maintainerRotation, { ...d.settings.rules, skip: outside });
      d = { ...d, shifts: [...d.shifts, ...added] };
      n += added.length;
    }
    if (!n) return useStore.getState().showToast(pool.size ? "Nobody on the crew is free, rated and current for the open days. Sub in someone else." : "Pick the crew first, on the Crew tab.");
    change(() => d, `Filled ${plural(n, "shift")} from the crew`);
  };
  /** People outside the crew for an open seat, as much of it as they can legally cover (maybe two splitting it). */
  const subsFor = (season: Season, role: Person["role"], a: number, b: number) =>
    fillSeason(data, season, role, role === "Pilot" ? season.pilotRotation : season.maintainerRotation,
      { ...data.settings.rules, window: [a, b], skip: new Set([...pool]) });
  const subIn = (shifts: Shift[]) => {
    if (!shifts.length) return;
    const list = [...new Set(shifts.map((x) => people.get(x.personId)?.name ?? "Someone"))];
    const names = list.length > 1 ? `${list.slice(0, -1).join(", ")} and ${list.at(-1)}` : list[0];
    change((d) => ({ ...d, shifts: [...d.shifts, ...shifts] }), `${names} sub${list.length === 1 ? "s" : ""} in`);
    setSub(null);
  };

  if (!seasons.length) return <p className="muted" style={{ margin: 0 }}>No seasons running or coming up. Add one on the Seasons tab.</p>;
  return (
    <>
      <p className="form-note" style={{ marginTop: 0 }}>
        Each season's rotation, in order. <b>Fill from the crew</b> uses only the people on the Crew tab; where they can't cover, <b>Sub in someone else</b> finds who can.
      </p>
      {seasons.map((season) => {
        const cov = missionCoverage(data, season);
        return (
          <section key={season.id} className="rotation-block">
            <div className="row gap-sm wrap rotation-head">
              <button className="link" onClick={() => open("season", season.id)}><b>{fmtSpan(season.start, season.end)}</b></button>
              <StatusPill status={season.status} />
              <span className={`pill ${cov.covered >= 1 ? "ok" : "danger"}`}>{Math.round(cov.covered * 100)}% crewed</span>
              <span className="small muted grow">{seasonTails(data, season)}{season.pilotRotation ? ` · ${fmtRotation(season.pilotRotation)}` : ""}</span>
              <button className="btn sm primary" onClick={() => fillFromCrew(season)}><Wand2 size={14} /> Fill from the crew</button>
            </div>
            {(["Pilot", "Maintainer"] as const).map((role) => {
              const need = role === "Pilot" ? season.pilotsNeeded : season.maintainersNeeded;
              if (!need) return null;
              const gaps = role === "Pilot" ? cov.pilotGaps : cov.maintainerGaps;
              type Row = { at: number; shift?: Shift; gap?: (typeof gaps)[number] };
              const rows: Row[] = [
                ...data.shifts.filter((x) => x.seasonId === season.id && people.get(x.personId)?.role === role && ms(x.end) > now).map((x): Row => ({ at: ms(x.start), shift: x })),
                ...gaps.filter((g) => g.b > now).map((g): Row => ({ at: g.a, gap: g })),
              ].sort((a, b) => a.at - b.at || Number(!!a.gap) - Number(!!b.gap));
              return (
                <div key={role}>
                  <h4 className="form-section">{role === "Pilot" ? "Pilots" : "Maintainers"} · {need} at a time</h4>
                  <div className="lines">
                    {rows.map((r) => {
                      if (r.gap) {
                        const g = r.gap;
                        const isOpen = !!sub && sub.seasonId === season.id && sub.role === role && sub.a === g.a;
                        const proposal = isOpen ? subsFor(season, role, g.a, g.b) : [];
                        const covered = proposal.reduce((t, x) => t + (ms(x.end) - ms(x.start)), 0) / DAY;
                        return (
                          <div key={`g${g.a}`} className="line-edit sub-in">
                            <div className="row gap-sm wrap">
                              <span className="avatar open">!</span>
                              <span className="grow danger-text"><b>{g.short > 1 ? `${g.short} open seats` : "Open seat"}</b> · {fmtSpan(toWhen(g.a), toWhen(g.b), true)}</span>
                              <button className="btn sm" onClick={() => setSub(isOpen ? null : { seasonId: season.id, role, a: g.a, b: g.b })}>{isOpen ? "Close" : "Sub in someone else…"}</button>
                            </div>
                            {isOpen && (
                              proposal.length ? (
                                <>
                                  <span className="small muted">From outside the crew, rated, current, free and rested{Math.round(covered) < Math.round((g.b - g.a) / DAY) ? `; covers ${plural(Math.round(covered), "day")} of ${Math.round((g.b - g.a) / DAY)}` : ""}:</span>
                                  {proposal.map((x) => (
                                    <div key={x.id} className="row gap-sm">
                                      <Plus size={13} /><b>{people.get(x.personId)?.name}</b>
                                      <span className="small muted grow">{fmtSpan(x.start, x.end, true)}</span>
                                    </div>
                                  ))}
                                  <div><button className="btn sm primary" onClick={() => subIn(proposal)}>Sub {proposal.length === 1 ? "them" : "these"} in</button></div>
                                </>
                              ) : <span className="small muted">Nobody outside the crew is rated, current, free and rested for any of these days.</span>
                            )}
                          </div>
                        );
                      }
                      const x = r.shift!;
                      const p = people.get(x.personId);
                      const fromOutside = !!p && !pool.has(p.id);
                      return (
                        <button key={x.id} className="line" onClick={() => open("season", season.id, undefined, { tab: role === "Pilot" ? "pilots" : "maintainers", spot: `shift:${x.id}` })}>
                          {p ? <Avatar person={p} /> : <span className="avatar">?</span>}
                          <span className="name">{p?.name ?? "Someone deleted"}{x.after ? <span className="small muted"> ⇄</span> : null}</span>
                          {fromOutside && <span className="pill accent">Sub</span>}
                          <span className="when">{fmtSpan(x.start, x.end, true)}</span>
                        </button>
                      );
                    })}
                    {rows.length === 0 && <div className="line"><span className="muted">Nothing booked yet.</span></div>}
                  </div>
                </div>
              );
            })}
          </section>
        );
      })}
    </>
  );
}

/**
 * The job's aircraft (any number, added whenever they're known): the chosen ones as tags, then every other
 * tail to tap, grouped by type, saying whether it's free for these dates or what it's busy with.
 */
function AircraftPicker({ value, onChange, spot, when }: { value: string[]; onChange: (ids: string[]) => void; spot?: string; when?: { start: When; end: When; seasonId: string } }) {
  const data = useStore((s) => s.data);
  const aircraft = data.aircraft;
  const seats = value.reduce((t, id) => t + (aircraft.find((a) => a.id === id)?.seats ?? 0), 0);
  const chosen = value.map((id) => aircraft.find((a) => a.id === id)).filter((a) => !!a);
  const rest = aircraft.filter((a) => !value.includes(a.id) && a.status !== "Retired").sort((a, b) => a.type.localeCompare(b.type) || a.tail.localeCompare(b.tail));
  const byType = [...new Set(rest.map((a) => a.type))];
  /** What keeps a tail from this job's dates, if anything. */
  const busyWith = (a: Aircraft): string | null => {
    if (a.status === "Grounded") return "Grounded";
    if (!when || !(ms(when.end) > ms(when.start))) return null;
    const from = ms(when.start), to = ms(when.end);
    const job = data.jobs.find((j) => j.aircraftId === a.id && j.grounds && !j.done && ms(j.start) < to && ms(j.end) > from);
    if (job) return `In maintenance: ${job.title}`;
    const other = bookings(data).find((b) => b.id !== when.seasonId && b.status !== "Cancelled" && b.aircraftIds.includes(a.id) && ms(b.start) < to && ms(b.end) > from);
    return other ? `On ${other.name}` : null;
  };
  return (
    <div className="field full" data-spot={spot}>
      <span>Aircraft</span>
      {chosen.length > 0 && (
        <div className="tags">
          {chosen.map((a) => {
            const busy = busyWith(a);
            return (
              <span key={a.id} className="tag" title={`${a.type}, ${plural(a.seats, "pilot seat")}`}>
                <b>{a.tail}</b> <span className="muted small">{a.type}</span>
                {busy ? <span className="pill warn">{busy}</span> : a.status !== "Ready" && <span className="pill warn">{a.status}</span>}
                <button type="button" className="icon-btn" aria-label={`Take ${a.tail} off this job`} onClick={() => onChange(value.filter((x) => x !== a.id))}>✕</button>
              </span>
            );
          })}
        </div>
      )}
      {rest.length > 0 && (
        <div className="ac-choices">
          <span className="small muted">{chosen.length ? "Add another:" : "Tap to add:"}</span>
          {byType.map((t) => (
            <div key={t} className="ac-type">
              <span className="ac-type-name">{t}</span>
              <div className="picker-row">
                {rest.filter((a) => a.type === t).map((a) => {
                  const busy = busyWith(a);
                  return (
                    <button key={a.id} type="button" className={`chip pick ac-pick ${busy ? "busy" : "free"}`} onClick={() => onChange([...value, a.id])}
                      title={busy ? `${a.tail}: ${busy}. You can still add it; it will show as a problem.` : `${a.tail} is free${when ? " for these dates" : ""}`}>
                      <Plus size={13} /><b>{a.tail}</b>
                      <span className="small">{busy ?? (when ? "Free" : a.status === "Ready" ? "" : a.status)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      {aircraft.length === 0 && <span className="small muted">No aircraft yet. Add them on the Fleet page.</span>}
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
      {season.maintainersNeeded > 0 && <MaintainerNeedField value={season.maintainerNeed} onChange={(maintainerNeed) => onChange({ maintainerNeed })} />}
    </div>
  );
}

/** "2 days a week", "3 days at each end", "on call". */
const needWords = (n: MaintainerNeed) => (n.mode === "weekly" ? `${plural(n.days, "day")} a week` : n.mode === "ends" ? `${plural(n.days, "day")} at each end` : n.mode === "oncall" ? "on call" : "all the time");

const NEED_MODES: { mode: MaintainerNeed["mode"]; label: string; hint: (n: number) => string }[] = [
  { mode: "always", label: "All the time", hint: () => "Every day of the season needs a maintainer on; a day without one is a gap." },
  { mode: "weekly", label: "Days a week", hint: (n) => `Each week needs a maintainer on ${plural(n, "day")}. A week with fewer is a gap.` },
  { mode: "ends", label: "Start and end", hint: (n) => `Set-up and tear-down: the first and last ${plural(n, "day")} need a maintainer.` },
  { mode: "oncall", label: "On call", hint: () => "Book maintainers when they're needed. Days without one are never a gap." },
];

/** When a season needs its maintainers. */
function MaintainerNeedField({ value, onChange }: { value?: MaintainerNeed; onChange: (v: MaintainerNeed) => void }) {
  const v = value ?? { mode: "always", days: 2 };
  const days = Math.max(1, v.days || 2);
  const info = NEED_MODES.find((x) => x.mode === v.mode)!;
  return (
    <div className="field" style={{ marginTop: 10 }}>
      <span>Maintainers needed</span>
      <div className="seg status-seg" role="radiogroup" aria-label="Maintainers needed">
        {NEED_MODES.map((x) => (
          <button key={x.mode} type="button" role="radio" aria-checked={v.mode === x.mode} className={v.mode === x.mode ? "active" : ""} onClick={() => onChange({ mode: x.mode, days })}>{x.label}</button>
        ))}
      </div>
      {(v.mode === "weekly" || v.mode === "ends") && (
        <span className="rotation" style={{ marginTop: 6 }}>
          <Stepper label={v.mode === "weekly" ? "days a week" : "days at each end"} min={1} max={v.mode === "weekly" ? 7 : 30} value={days} onChange={(n) => onChange({ mode: v.mode, days: n })} />
          {v.mode === "weekly" ? "days a week" : "days at each end"}
        </span>
      )}
      <span className="hint">{info.hint(days)}</span>
    </div>
  );
}

/**
 * Work limits of its own (stricter than Settings), for a person, a mission or a season. A season can
 * also override: use its numbers instead of the mission's and Settings'.
 */
function LimitsField({ value, onChange, who, canOverride, applies }: { value?: Limits; onChange: (l: Limits | undefined) => void; who: string; canOverride?: boolean; applies: Rules }) {
  const settings = useStore((s) => s.data.settings.rules);
  const on = !!value && (value.maxDaysOn != null || value.minDaysOff != null || !!value.override);
  const v = { maxDaysOn: value?.maxDaysOn ?? settings.maxDaysOn, minDaysOff: value?.minDaysOff ?? settings.minDaysOff, override: !!value?.override };
  return (
    <div className="field full" data-spot="limits">
      <span>Work limits</span>
      <label className="check">
        <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked ? { maxDaysOn: v.maxDaysOn, minDaysOff: v.minDaysOff } : undefined)} />
        Own limits for {who}
      </label>
      {on && (
        <>
          <span className="rotation" style={{ marginTop: 6 }}>
            At most <NumberInput min={1} max={365} aria-label="Most days on in a row" value={v.maxDaysOn} onChange={(maxDaysOn) => onChange({ ...value, maxDaysOn })} /> days on in a row,
            at least <NumberInput min={0} max={90} aria-label="Fewest days off between" value={v.minDaysOff} onChange={(minDaysOff) => onChange({ ...value, minDaysOff })} /> days off between
          </span>
          {canOverride && (
            <label className="check" style={{ marginTop: 6 }}>
              <input type="checkbox" checked={v.override} onChange={(e) => onChange({ ...value, override: e.target.checked })} />
              Override the mission and Settings (people's own limits still apply)
            </label>
          )}
        </>
      )}
      <span className="hint">
        {on ? (v.override ? "These replace the mission's and Settings' limits for this season." : "The safest wins: these only count where they're stricter than Settings and the mission.") : `Following ${canOverride ? "the mission and Settings" : "Settings"}.`}
        {" "}Applies: at most {plural(applies.maxDaysOn, "day")} on, {plural(applies.minDaysOff, "day")} off.
      </span>
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

function SeasonDialog({ id, defaults, fix = {} }: Props) {
  const { data, change, remove, close, open } = useStore();
  const existing = data.seasons.find((x) => x.id === id);
  const isNew = !existing;
  const [kept] = useState(() => keptForm<{ tab: string; season: Season; shifts: Shift[] }>());
  const [season, setSeason] = useState<Season>(() => {
    if (kept.season) return kept.season;
    if (existing) return existing;
    const missionId = (defaults.missionId as string) ?? data.missions[0]?.id ?? "";
    // A new season starts from the mission's latest one: same aircraft, crew numbers and rotations.
    const last = seasonsOf(data, missionId).at(-1);
    return {
      id: uid(), missionId, start: toWhen(tomorrow()), end: toWhen(dayAt(tomorrow(), 30)),
      aircraftIds: last?.aircraftIds ?? [], pilotsNeeded: last?.pilotsNeeded ?? 1, maintainersNeeded: last?.maintainersNeeded ?? 0, maintainerNeed: last?.maintainerNeed,
      pilotRotation: last?.pilotRotation ?? null, maintainerRotation: last?.maintainerRotation ?? null,
      status: "Planned", notes: "", ...(defaults as Partial<Season>),
    };
  });
  // Open on the crew, where most of the work is, unless the season is new.
  const [tab, setTab] = useState(() => kept.tab ?? fix.tab ?? (isNew ? "details" : existing!.pilotsNeeded > 0 ? "pilots" : existing!.maintainersNeeded > 0 ? "maintainers" : "details"));
  const [shifts, setShifts] = useState<Shift[]>(() => kept.shifts ?? data.shifts.filter((s) => s.seasonId === id));
  useKeep({ tab, season, shifts });
  const dirty = useDirty({ season, shifts });
  // A problem about a shift opens that shift, ready to swap someone in or fix its dates.
  const shiftSpot = (spot?: string) => (spot?.startsWith("shift:") ? spot.slice(6) : null);
  const [editingShift, setEditingShift] = useState<string | null>(() => (kept.tab ? null : shiftSpot(fix.spot)));
  const [showAll, setShowAll] = useState(false);
  const [spot, setSpot] = useState({ key: kept.tab ? undefined : fix.spot, n: 0 });
  useSpot(spot.key, spot.n, tab, editingShift);
  /** This season's own problems are fixed here: switch tab and point, instead of opening it again. */
  const fixHere = (f: Fix) => {
    if (f.kind !== "season" || f.id !== season.id) return false;
    setTab(f.tab ?? "details");
    setEditingShift(shiftSpot(f.spot));
    setSpot((x) => ({ key: f.spot, n: x.n + 1 }));
    return true;
  };
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
    if (!free) useStore.getState().showToast("Nobody rated, current and free can take all of those days. Shorten the dates, or turn on Show everyone to pick someone anyway.");
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
    !c.qualified ? " (not rated on this aircraft)" : !c.trained ? " (training not current)" : !c.current ? " (not flown the type lately)" : c.off ? " (time off)" : !c.onRotation ? " (off rotation)" : c.busy ? " (booked elsewhere)" : c.regular ? "" : " (not on this mission's crew)";
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
              <span className="muted">{plural(need, word)} at a time{role === "Maintainer" && season.maintainerNeed && season.maintainerNeed.mode !== "always" ? `, ${needWords(season.maintainerNeed)}` : ""} · {rotation ? fmtRotation(rotation) : "hitch rules from Settings"}</span>
            </div>
            <div className="cov-bar" aria-label={`${Math.round(share * 100)}% covered`}>
              {gaps.map((g) => <div key={g.a} className="gap" style={{ left: `${pct(g.a)}%`, width: `${pct(g.b) - pct(g.a)}%` }} title={`${plural(g.short, "seat")} open, ${fmtSpan(toWhen(g.a), toWhen(g.b))}`} />)}
            </div>
          </>
        )}
        <div className="toolbar">
          {need > 0 && !timeError && !(role === "Maintainer" && season.maintainerNeed?.mode === "oncall") && (
            <button className="btn sm primary" onClick={() => fill(role, false)} title="Rotate free, qualified, current people through the open days on this job's rotation">
              <Wand2 size={14} /> Fill the schedule
            </button>
          )}
          <button className="btn sm" onClick={() => addShift(role)}><Plus size={14} /> Add a {word}</button>
          {rows.some((r) => r.shift) && need > 0 && <button className="btn sm ghost" onClick={() => fill(role, true)} title={`Remove the ${word} shifts and fill again from scratch`}>Start over</button>}
          <label className="check"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Show everyone</label>
        </div>
        {need > 0 && gaps.length > 0 && <WhyNobody data={draft} role={role} gap={gaps[0]} types={types} required={mission ? requiredTraining(draft, mission, role) : []} missionId={season.missionId} />}
        {rows.length > 0 ? (
          <div className="lines" data-spot={role === "Pilot" ? "pilots" : "maintainers"}>
            {rows.map((r) => {
              if (r.gap) {
                const g = r.gap;
                return (
                  <button key={`gap-${g.a}`} className="line open-seat" data-spot={`gap:${g.a}`} onClick={() => addShift(role, g.a, g.b)} title="Add someone for these days">
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
                  <div key={s.id} className="line-edit" data-spot={`shift:${s.id}`}>
                    <Field label={role === "Pilot" ? "Pilot" : "Maintainer"}>
                      <select value={s.personId} onChange={(e) => updateShift(s.id, { personId: e.target.value })}>
                        {choices(role, s).map((c) => <option key={c.person.id} value={c.person.id}>{c.person.name}{why(c)}</option>)}
                      </select>
                    </Field>
                    <Field label="Note"><input value={s.note ?? ""} placeholder="Bring the cold-weather kit" onChange={(e) => updateShift(s.id, { note: e.target.value || undefined })} /></Field>
                    {/* Pilots fly inside the season; maintainers may come early or stay late for pre-flight. */}
                    <DateFields start={s.start} end={s.end} onChange={(start, end) => updateShift(s.id, { start, end })}
                      min={role === "Pilot" ? season.start : undefined} max={role === "Pilot" ? season.end : undefined}
                      note={role === "Pilot" ? `season ${fmtSpan(season.start, season.end, true)}` : undefined} />
                    <div className="row gap-sm">
                      <button className="btn sm danger" onClick={() => { setShifts((all) => all.filter((x) => x.id !== s.id)); setEditingShift(null); }}><Trash2 size={14} /> Remove</button>
                      <span className="grow" />
                      <button className="btn sm primary" onClick={() => setEditingShift(null)}>Done</button>
                    </div>
                  </div>
                );
              return (
                <button key={s.id} className={`line ${flagged.has(s.id) ? "flag" : ""}`} data-spot={`shift:${s.id}`} onClick={() => setEditingShift(s.id)} title={flagged.has(s.id) ? "There's a problem with this shift. See Problems." : "Change or remove"}>
                  {p ? <Avatar person={p} /> : <span className="avatar">?</span>}
                  <span className="name">{p?.name ?? "Someone deleted"}{s.note && <span className="small muted" style={{ display: "block", fontWeight: 400 }}>{s.note}</span>}</span>
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
    <Dialog wide title={isNew ? `New season${mission ? `: ${mission.name}` : ""}` : mission?.name ?? "Season"} onClose={close} dirty={dirty}
      icon={mission && <span className="swatch" style={slotStyle(missionLook(mission))} />}
      meta={<>
        <StatusPill status={season.status} />
        {season.status === "Planned" && !isNew && (
          <button type="button" className="btn sm confirm" onClick={() => set({ status: "Confirmed" })} title="Mark it confirmed (then Save)"><Check size={13} /> Confirm</button>
        )}
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
      foot={<Foot isNew={isNew} label="season" problem={!mission ? "Pick a mission first." : timeError && "The last day is before the first day (Details tab)."} onSave={save}
        onDelete={() => { remove("seasons", season.id, `Deleted the season ${fmtDates(season.start, season.end)}`); close(); }} />}>
      {(tab === "details" || (tab === "problems" && !issues.length)) && (
        <div className="form-grid">
          <Field label="Mission" full>
            <select value={season.missionId} onChange={(e) => set({ missionId: e.target.value })} disabled={!isNew}>
              {data.missions.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </Field>
          <StatusPicker value={season.status} onChange={(status) => set({ status })} />
          <DateFields spot="dates" start={season.start} end={season.end} onChange={(start, end) => set({ start, end })} />
          <AircraftPicker spot="aircraft" value={season.aircraftIds} onChange={(aircraftIds) => set({ aircraftIds })} when={{ start: season.start, end: season.end, seasonId: season.id }} />
          <CrewSize season={season} onChange={set} />
          <RotationField label="Pilot rotation" value={season.pilotRotation} onChange={(pilotRotation) => set({ pilotRotation })} />
          <RotationField label="Maintainer rotation" value={season.maintainerRotation} onChange={(maintainerRotation) => set({ maintainerRotation })} />
          <LimitsField value={season.limits} onChange={(limits) => set({ limits })} who="this season" canOverride applies={seasonRules(data, season)} />
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
      {tab === "problems" && issues.length > 0 && <IssueList issues={issues} onFix={fixHere} />}
    </Dialog>
  );
}

/**
 * When nobody can take an open seat, say why for the people closest to it, each with a button to
 * the fix (rate them on the type, record the training, change their rotation) or to add someone.
 */
function WhyNobody({ data, role, gap, types, required, missionId }: { data: AppData; role: Person["role"]; gap: { a: number; b: number }; types: string[]; required: string[]; missionId: string }) {
  const open = useStore((s) => s.open);
  const people = whoCanCover(data, role, gap.a, gap.b, types, [], required, missionId);
  if (people.some((c) => c.ok)) return null;
  const word = role === "Pilot" ? "pilot" : "maintainer";
  const when = fmtSpan(toWhen(gap.a), toWhen(gap.b), true);
  if (!people.length)
    return (
      <div className="fix-callout">
        <span className="grow"><b>No {word}s yet.</b> Add one to fill this job.</span>
        <button className="btn sm primary" onClick={() => open("person", "new", { role })}><Plus size={14} /> Add a {word}…</button>
      </div>
    );
  // Fewest things in the way first.
  const blockers = (c: (typeof people)[number]) => [!c.qualified, !c.trained, !c.current, !c.onRotation, c.off, c.busy].filter(Boolean).length;
  const rows = [...people].sort((x, y) => blockers(x) - blockers(y)).slice(0, 5);
  return (
    <div className="fix-callout why-nobody" data-spot="why">
      <div style={{ width: "100%" }}>
        <b>Nobody can take {when}.</b> <span className="muted">Here's what's in the way for the closest {plural(rows.length, word)}:</span>
      </div>
      <div className="why-rows">
        {rows.map((c) => {
          const missing = required.find((id) => trainingStatus(c.person, id, gap.a, gap.b).state !== "ok");
          const course = data.trainings.find((t) => t.id === missing);
          const reasons: string[] = [];
          if (!c.qualified) reasons.push(`not rated on the ${types.join(" or ")}`);
          if (!c.trained && course) reasons.push(`${course.name} isn't current`);
          if (!c.current) reasons.push(`hasn't flown the ${types.join(" or ")} in over ${data.settings.currencyDays} days`);
          if (!c.onRotation) reasons.push("off rotation then");
          if (c.off) reasons.push("has time off then");
          if (c.busy) reasons.push("booked elsewhere then");
          const fix = !c.qualified ? { label: "Add the rating", tab: "work", spot: "quals" }
            : !c.trained && course ? { label: `Record ${course.name}`, tab: "training", spot: `training:${course.id}` }
            : !c.current ? { label: "Record when they last flew", tab: "work", spot: "flew" }
            : !c.onRotation ? { label: "Change rotation", tab: "details", spot: "rotation" } : null;
          return (
            <div key={c.person.id} className="why-row">
              <Avatar person={c.person} />
              <span className="grow"><b>{c.person.name}</b> <span className="small muted">{reasons.join(", ")}</span></span>
              {fix && <button className="btn sm" onClick={() => open("person", c.person.id, undefined, { tab: fix.tab, spot: fix.spot })}>{fix.label}</button>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** A season's status as buttons, so confirming is one tap. */
function StatusPicker({ value, onChange }: { value: Season["status"]; onChange: (s: Season["status"]) => void }) {
  return (
    <div className="field full" data-spot="status">
      <span>Status</span>
      <div className="seg status-seg" role="radiogroup" aria-label="Status">
        {(["Planned", "Confirmed", "Flying", "Done", "Cancelled"] as const).map((x) => (
          <button key={x} type="button" role="radio" aria-checked={value === x} className={value === x ? "active" : ""} onClick={() => onChange(x)}>
            {x === "Confirmed" && value !== x ? <><Check size={13} /> Confirm</> : x}
          </button>
        ))}
      </div>
    </div>
  );
}

const overlapsShift = (s: Shift, a: number, b: number) => ms(s.start) < b && ms(s.end) > a;

// ---------------------------------------------------------------- aircraft

function AircraftDialog({ id, fix = {} }: Props) {
  const { data, change, remove, close, showToast } = useStore();
  useSpot(fix.spot);
  const existing = data.aircraft.find((a) => a.id === id);
  const [a, setA] = useState<Aircraft>(() => existing ?? { id: uid(), tail: "", type: "", base: "", status: "Ready", seats: 2, notes: "" });
  const set = (p: Partial<Aircraft>) => setA((x) => ({ ...x, ...p }));
  const tail = a.tail.trim().toUpperCase();
  const taken = data.aircraft.some((x) => x.id !== a.id && x.tail.trim().toUpperCase() === tail);
  const error = taken ? `${tail} is already in your fleet.` : null;
  // Who's rated on this type, changed right here: a tap instead of opening each person.
  const type = a.type.trim();
  const [ratings, setRatings] = useState<Record<string, boolean>>({});
  const dirty = useDirty({ a, ratings });
  const isRated = (p: Person) => ratings[p.id] ?? p.quals.includes(type);
  const save = () => {
    change((d) => ({
      ...d,
      aircraft: existing ? d.aircraft.map((x) => (x.id === a.id ? { ...a, tail } : x)) : [...d.aircraft, { ...a, tail }],
      people: d.people.map((p) => {
        const want = ratings[p.id];
        if (want === undefined || want === p.quals.includes(type)) return p;
        return { ...p, quals: want ? [...p.quals, type] : p.quals.filter((q) => q !== type) };
      }),
    }));
    if (!existing) showToast(`Added ${tail}`);
    close();
  };
  return (
    <Dialog title={existing ? <span style={{ fontFamily: "var(--zb-font-mono)" }}>{a.tail}</span> : "Add aircraft"} onClose={close} dirty={dirty}
      meta={existing && <><StatusPill status={a.status} /><span>{a.type}</span>{a.base && <>·<span>{a.base}</span></>}</>}
      foot={<Foot isNew={!existing} label="aircraft" problem={!tail ? "Type the tail number first." : !a.type.trim() ? "Type the aircraft type, like Bell 412." : taken && `${tail} is already in your fleet.`}
        onSave={save}
        onDelete={() => { remove("aircraft", a.id, `Deleted ${a.tail}`); close(); }} />}>
      <div className="form-grid">
        <Field label="Tail number" error={error}>
          <input autoFocus={autoFocusBox} value={a.tail} placeholder="N412ZM" style={{ fontFamily: "var(--zb-font-mono)", textTransform: "uppercase" }} onChange={(e) => set({ tail: e.target.value })} />
        </Field>
        <Field label="Type" hint="Crew ratings match this.">
          <input list="mrp-types" value={a.type} placeholder="Bell 412" onChange={(e) => set({ type: e.target.value })} />
          <datalist id="mrp-types">{typesOf(data).map((t) => <option key={t} value={t} />)}</datalist>
        </Field>
        <div className="full pair">
          <Field label="Status" spot="status">
            <select value={a.status} onChange={(e) => set({ status: e.target.value as Aircraft["status"] })}>
              {(["Ready", "In maintenance", "Grounded", "Retired"] as const).map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <div className="field"><span>Pilot seats</span><Stepper label="pilot seats" min={1} max={2} value={a.seats} onChange={(seats) => set({ seats })} /></div>
        </div>
        <Field label="Base" full><input value={a.base} onChange={(e) => set({ base: e.target.value })} /></Field>
        {data.settings.maintenance.enabled && (
          <div className="field full" data-spot="hours">
            <span>Flight hours</span>
            <div className="pair">
              <Field label="Hours on the airframe">
                <input type="number" inputMode="decimal" step="0.1" min={0} value={a.hours?.hours ?? ""} placeholder="4812.5"
                  onChange={(e) => set({ hours: e.target.value === "" ? null : { hours: Number(e.target.value), on: a.hours?.on ?? format(today(), "yyyy-MM-dd") } })} />
              </Field>
              <DateInput label="As of" today value={a.hours?.on ?? format(today(), "yyyy-MM-dd")} onChange={(on) => set({ hours: { hours: a.hours?.hours ?? 0, on } })} />
            </div>
            <Field label="Hours on a mission day" hint={`Empty: ${data.settings.maintenance.hoursPerDay} from Settings.`}>
              <input type="number" inputMode="decimal" step="0.1" min={0} value={a.hoursPerDay ?? ""} placeholder={String(data.settings.maintenance.hoursPerDay)}
                onChange={(e) => set({ hoursPerDay: e.target.value === "" ? null : Number(e.target.value) })} />
            </Field>
            {existing && a.hours && <span className="hint">About {flightHours({ ...data, aircraft: data.aircraft.map((x) => (x.id === a.id ? a : x)) }, a, today().getTime())} hours now, counting its mission days since then.</span>}
          </div>
        )}
        <div className="field full" data-spot="rated">
          <span>Crew rated on {type ? `the ${type}` : "this type"}</span>
          {!type ? <span className="small muted">Type the aircraft type first.</span>
            : data.people.length === 0 ? <span className="small muted">No crew yet. Add pilots and maintainers under Crew.</span>
            : (["Pilot", "Maintainer"] as const).map((role) => {
              const people = data.people.filter((p) => p.role === role).sort((x, y) => x.name.localeCompare(y.name));
              return people.length > 0 && (
                <div key={role} className="ac-type">
                  <span className="ac-type-name">{role === "Pilot" ? "Pilots" : "Maintainers"} · {people.filter(isRated).length} rated</span>
                  <div className="picker-row">
                    {people.map((p) => <Pick key={p.id} on={isRated(p)} onToggle={() => setRatings((r) => ({ ...r, [p.id]: !isRated(p) }))}>{p.name}</Pick>)}
                  </div>
                </div>
              );
            })}
          <span className="hint">Only people rated on the type are offered for its jobs. Tap to rate or unrate them; it's saved with the aircraft.</span>
        </div>
        <Field label="Notes" full><textarea rows={2} value={a.notes} onChange={(e) => set({ notes: e.target.value })} /></Field>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------- person

function PersonDialog({ id, defaults, fix = {} }: Props) {
  const { data, upsert, remove, close, showToast, open } = useStore();
  const existing = data.people.find((p) => p.id === id);
  const [kept] = useState(() => keptForm<{ tab: string; p: Person }>());
  const [tab, setTab] = useState(kept.tab ?? fix.tab ?? "details");
  const spot = kept.tab ? undefined : fix.spot;
  useSpot(spot, tab);
  const [p, setP] = useState<Person>(() => kept.p ?? existing ?? { id: uid(), name: "", role: "Pilot", quals: [], training: [], missionIds: [], rotation: null, base: "", phone: "", notes: "", ...(defaults as Partial<Person>) });
  const set = (patch: Partial<Person>) => setP((x) => ({ ...x, ...patch }));
  useKeep({ tab, p });
  const dirty = useDirty(p);
  const [newQual, setNewQual] = useState("");
  const types = [...new Set([...typesOf(data), ...p.quals])].sort();
  const word = p.role === "Pilot" ? "pilot" : "maintainer";
  const now = Date.now();
  const needs = neededTraining({ ...data, people: data.people.map((x) => (x.id === p.id ? p : x)) }, p);
  const notCurrent = [...needs.keys()].filter((tid) => trainingStatus(p, tid, now, now + 1).state !== "ok").length;
  const off = data.timeOff.filter((t) => t.personId === p.id && ms(t.end) > now).sort((a, b) => ms(a.start) - ms(b.start));

  return (
    <Dialog title={p.name || `Add ${word}`} onClose={close} dirty={dirty}
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
      foot={<Foot isNew={!existing} label={word} problem={!p.name.trim() && "Type their name first (Details tab)."}
        onSave={() => { if (!p.name.trim()) { setTab("details"); return; } upsert("people", p); if (!existing) showToast(`Added ${p.name}`); close(); }}
        onDelete={() => { remove("people", p.id, `Deleted ${p.name} and their shifts`); close(); }} />}>
      {tab === "details" && (
        <div className="form-grid">
          <Field label="Name"><input autoFocus={autoFocusBox} value={p.name} onChange={(e) => set({ name: e.target.value })} /></Field>
          <Field label="Role">
            <select value={p.role} onChange={(e) => set({ role: e.target.value as Person["role"] })}>
              <option>Pilot</option><option>Maintainer</option>
            </select>
          </Field>
          <Field label="Base"><input value={p.base} onChange={(e) => set({ base: e.target.value })} /></Field>
          <Field label="Phone"><input type="tel" value={p.phone} onChange={(e) => set({ phone: e.target.value })} /></Field>
          <PersonRotationField value={p.rotation} onChange={(rotation) => set({ rotation })} />
          <LimitsField value={p.limits} onChange={(limits) => set({ limits })} who="them" applies={rulesFor(data, p)} />
          <Field label="Notes" full><textarea rows={2} value={p.notes} onChange={(e) => set({ notes: e.target.value })} /></Field>
          {existing && <NextBookings personId={p.id} />}
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
          <div className="picker-row" data-spot="quals">
            {types.map((t) => <Pick key={t} on={p.quals.includes(t)} onToggle={() => set({ quals: toggled(p.quals, t) })}>{t}</Pick>)}
            <input placeholder="Another type" value={newQual} style={{ width: 140 }} onChange={(e) => setNewQual(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && newQual.trim()) { e.preventDefault(); set({ quals: [...new Set([...p.quals, newQual.trim()])] }); setNewQual(""); } }} />
          </div>
          <p className="form-note">Aircraft types this person can fly or work on. They're only offered for jobs on these.</p>
          {p.role === "Pilot" && p.quals.length > 0 && data.settings.currencyDays > 0 && (
            <div className="field" data-spot="flew">
              <h4 className="form-section">Last flew</h4>
              {p.quals.map((type) => {
                const since = daysSince({ ...data, people: data.people.map((x) => (x.id === p.id ? p : x)) }, p, type, Date.now());
                return (
                  <div key={type} className="flew-row">
                    <span className="grow"><b>{type}</b> <span className={`small ${since !== null && since > data.settings.currencyDays ? "danger-text" : "muted"}`}>
                      {since === null ? "No record" : since <= 0 ? "Flying it now" : `${since} days ago`}
                    </span></span>
                    <DateInput ariaLabel={`Last flew the ${type} outside this plan`} today clearable="Clear" value={p.flew?.[type] ?? ""}
                      onChange={(v) => { const flew = { ...p.flew }; if (v) flew[type] = v; else delete flew[type]; set({ flew }); }} />
                  </div>
                );
              })}
              <span className="hint">From the schedule, or a date typed here for flying done elsewhere (whichever is later). Current means within {data.settings.currencyDays} days (Settings).</span>
            </div>
          )}
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
      {tab === "training" && <TrainingRecords person={p} onChange={(training) => set({ training })} spot={spot} />}
    </Dialog>
  );
}

/** Where someone is booked next: shifts and maintenance, soonest first, each opening where it is. */
function NextBookings({ personId }: { personId: string }) {
  const { data, open } = useStore();
  const now = Date.now();
  const next = dutyOf(data, personId).filter((d) => d.b > now).slice(0, 5);
  return (
    <div className="field full">
      <span>Booked next</span>
      {next.length ? (
        <div className="lines">
          {next.map((d) => (
            <div key={`${d.seasonId ?? d.jobId}-${d.a}`} className="line with-action">
              <button className="line-main" onClick={() => (d.seasonId ? open("season", d.seasonId, undefined, d.shiftId ? { spot: `shift:${d.shiftId}`, tab: data.people.find((x) => x.id === personId)?.role === "Maintainer" ? "maintainers" : "pilots" } : undefined) : d.jobId && open("job", d.jobId))}>
                <span className="name">{d.label}</span>
                <span className="when">{d.a <= now ? `Now, until ${format(d.b - 1, "MMM d")}` : fmtSpan(toWhen(d.a), toWhen(d.b))}</span>
              </button>
              {d.shiftId && <button className="btn sm" onClick={() => open("swap", d.shiftId!)}>Trade…</button>}
            </div>
          ))}
        </div>
      ) : <span className="small muted">Nothing booked.</span>}
    </div>
  );
}

// ---------------------------------------------------------------- swapping a shift

/**
 * Give a shift to someone else, or trade it for one of theirs. Only legal moves are offered: the other
 * person is rated, current on training and on the type, free and on rotation for these days, and for a
 * trade the first person can take theirs too. The checks show anything left over; Undo is in the message.
 */
function SwapDialog({ id }: Props) {
  const { data, change, close } = useStore();
  const shift = data.shifts.find((s) => s.id === id);
  const all = bookings(data);
  const season = shift && all.find((b) => b.id === shift.seasonId);
  const person = shift && data.people.find((p) => p.id === shift.personId);
  if (!shift || !season || !person)
    return <Dialog title="Swap" onClose={close} foot={<button className="btn" onClick={close}>Close</button>}><p className="muted">That shift isn't there any more.</p></Dialog>;
  const name = (pid: string) => data.people.find((p) => p.id === pid)?.name ?? "Someone";
  const mission = data.missions.find((m) => m.id === season.missionId);
  const can = (role: Person["role"], who: string, s: Shift, except: string[]) => {
    const b = all.find((x) => x.id === s.seasonId);
    const m = b && data.missions.find((x) => x.id === b.missionId);
    if (!b) return false;
    return whoCanCover(data, role, ms(s.start), ms(s.end), seasonTypes(data, b), except, m ? requiredTraining(data, m, role) : [], b.missionId)
      .some((c) => c.person.id === who && c.ok);
  };
  const givers = whoCanCover(data, person.role, ms(shift.start), ms(shift.end), seasonTypes(data, season), [shift.id], mission ? requiredTraining(data, mission, person.role) : [], season.missionId)
    .filter((c) => c.ok && c.person.id !== person.id);
  const near = 120 * DAY, now = Date.now();
  const trades = data.shifts
    .filter((s) => s.id !== shift.id && s.personId !== person.id && ms(s.end) > now && Math.abs(ms(s.start) - ms(shift.start)) <= near
      && data.people.find((p) => p.id === s.personId)?.role === person.role && all.some((b) => b.id === s.seasonId && b.status !== "Cancelled" && b.status !== "Done"))
    .filter((s) => can(person.role, s.personId, shift, [s.id, shift.id]) && can(person.role, person.id, s, [shift.id, s.id]))
    .sort((a, b) => Math.abs(ms(a.start) - ms(shift.start)) - Math.abs(ms(b.start) - ms(shift.start)))
    .slice(0, 12);

  const give = (to: string) => {
    change((d) => ({ ...d, shifts: d.shifts.map((s) => (s.id === shift.id ? { ...s, personId: to } : s)) }), `${name(to)} takes ${person.name}'s ${fmtSpan(shift.start, shift.end)} on ${season.name}`);
    close();
  };
  const trade = (other: Shift) => {
    change((d) => ({ ...d, shifts: d.shifts.map((s) => (s.id === shift.id ? { ...s, personId: other.personId } : s.id === other.id ? { ...s, personId: person.id } : s)) }),
      `Traded: ${name(other.personId)} takes ${fmtSpan(shift.start, shift.end)}, ${person.name} takes ${fmtSpan(other.start, other.end)}`);
    close();
  };

  return (
    <Dialog title={`Swap ${person.name}'s shift`} onClose={close}
      meta={<><span>{season.name}</span>·<span>{fmtSpan(shift.start, shift.end)}</span></>}
      foot={<button className="btn" onClick={close}>Cancel</button>}>
      <h4 className="form-section" style={{ marginTop: 0 }}>Hand it to someone</h4>
      {givers.length ? (
        <div className="picker-row">
          {givers.map((c) => <button key={c.person.id} className="chip pick" onClick={() => give(c.person.id)}>{c.person.name}{c.regular ? <span className="pill ok">Crew</span> : null}</button>)}
        </div>
      ) : <p className="small muted">Nobody else of the same role is rated, current, free and on rotation for all of these days.</p>}
      <h4 className="form-section">Trade with someone</h4>
      {trades.length ? (
        <div className="lines">
          {trades.map((s) => {
            const b = all.find((x) => x.id === s.seasonId)!;
            return (
              <button key={s.id} className="line" onClick={() => trade(s)}>
                <span className="grow">
                  <span className="name" style={{ display: "block" }}>{name(s.personId)} takes this</span>
                  <span className="small muted">{person.name} takes {name(s.personId).split(" ")[0]}'s {b.name}, {fmtSpan(s.start, s.end, true)}</span>
                </span>
                <span className="btn sm">Trade</span>
              </button>
            );
          })}
        </div>
      ) : <p className="small muted">No trades within four months where both people can legally take the other's shift.</p>}
      <p className="hint">Only moves the rules allow are offered (ratings, training, currency, time off, rotations). The problem list shows anything left, like rest between hitches.</p>
    </Dialog>
  );
}

// ---------------------------------------------------------------- maintenance job

function JobDialog({ id, defaults, fix = {} }: Props) {
  const { data, upsert, remove, close, showToast, open } = useStore();
  useSpot(fix.spot);
  const existing = data.jobs.find((j) => j.id === id);
  const [j, setJ] = useState<MaintenanceJob>(() => existing ?? {
    id: uid(), aircraftId: data.aircraft[0]?.id ?? "", title: "", kind: "Inspection",
    start: toWhen(tomorrow()), end: toWhen(dayAt(tomorrow(), 1)), maintainerIds: [], grounds: true, done: false, notes: "",
    ...(defaults as Partial<MaintenanceJob>),
  });
  const set = (patch: Partial<MaintenanceJob>) => setJ((x) => ({ ...x, ...patch }));
  const dirty = useDirty(j);
  const ac = data.aircraft.find((a) => a.id === j.aircraftId);
  const timeError = !(ms(j.end) > ms(j.start));
  const crew = whoCanCover(data, "Maintainer", ms(j.start), ms(j.end), ac?.type ?? null, []);
  const templates = existing ? [] : jobTemplates(data);
  /** Fill in a template: its name, kind, length (from the first day) and whether it grounds the aircraft. */
  const applyTemplate = (t: JobTemplate) => set({ title: t.title, kind: t.kind, grounds: t.grounds, end: toWhen(dayAt(ms(j.start), t.days)) });
  return (
    <Dialog title={existing ? j.title : "New maintenance job"} onClose={close} dirty={dirty}
      meta={existing && <>{ac && <b style={{ fontFamily: "var(--zb-font-mono)" }}>{ac.tail}</b>}<span>{j.kind}</span>·<span>{timeError ? "Check the dates" : fmtDates(j.start, j.end)}</span>{j.done && <span className="pill ok">Finished</span>}</>}
      foot={<Foot isNew={!existing} label="job" problem={!j.title.trim() ? "Name the job first, like 100 hour inspection." : !j.aircraftId ? "Pick the aircraft." : timeError && "The last day is before the first day."}
        onSave={() => { upsert("jobs", j); if (!existing) showToast(`Added “${j.title}”`); close(); }}
        onDelete={() => { remove("jobs", j.id, `Deleted “${j.title}”`); close(); }} />}>
      <div className="form-grid">
        {templates.length > 0 && (
          <div className="field full">
            <span>Start from</span>
            <div className="picker-row">
              {templates.map((t) => (
                <button key={t.title} type="button" className={`chip pick ${j.title === t.title ? "on" : ""}`} onClick={() => applyTemplate(t)}
                  title={`${t.kind}, ${plural(t.days, "day")}${t.grounds ? ", grounds the aircraft" : ""}`}>
                  {t.title} <span className="small muted">{plural(t.days, "day")}</span>
                </button>
              ))}
            </div>
            <span className="hint">Fills in the name, kind, length and grounding. {data.jobs.length ? "These are the jobs you've planned before." : "Your own jobs show here once you've planned some."}</span>
          </div>
        )}
        <Field label="Job" full><input autoFocus={autoFocusBox} value={j.title} placeholder="100 hour inspection" onChange={(e) => set({ title: e.target.value })} /></Field>
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
        <DateFields spot="dates" start={j.start} end={j.end} onChange={(start, end) => set({ start, end })} />
        <div className="field full" data-spot="maintainers">
          <span>Who's doing it</span>
          {crew.length > 0 ? (
            <>
              <span className="small muted" style={{ marginBottom: 4 }}>
                {j.maintainerIds.length ? `${plural(j.maintainerIds.length, "maintainer")} on this job. Tap a name to add or take them off.` : "Tap the maintainers who'll do it. Free ones rated on this aircraft are first."}
              </span>
              <div className="picker-row">
                {crew.map((c) => {
                  const on = j.maintainerIds.includes(c.person.id);
                  return (
                    <Pick key={c.person.id} on={on} onToggle={() => set({ maintainerIds: toggled(j.maintainerIds, c.person.id) })}
                      title={!c.qualified ? `Not rated on the ${ac?.type}` : c.off ? "Time off" : c.busy ? "Booked elsewhere" : "Free"}>
                      {c.person.name}
                      {!c.qualified ? <span className="pill warn">Not rated</span> : c.off ? <span className="pill warn">Off</span> : c.busy && !on ? <span className="pill">Busy</span> : !on ? <span className="pill ok">Free</span> : null}
                    </Pick>
                  );
                })}
              </div>
              {ac && crew.every((c) => !c.qualified) && (
                <span className="hint">Nobody is rated on the {ac.type} yet. Open the aircraft and tap who's rated, or add the rating on a person's Ratings tab.</span>
              )}
            </>
          ) : (
            <div className="row gap-sm wrap">
              <span className="small muted">No maintainers yet.</span>
              <button type="button" className="btn sm" onClick={() => open("person", "new", { role: "Maintainer" })}><Plus size={14} /> Add a maintainer…</button>
            </div>
          )}
        </div>
        <label className="check full"><input type="checkbox" checked={j.grounds} onChange={(e) => set({ grounds: e.target.checked })} /> The aircraft can't fly during this job</label>
        <label className="check full"><input type="checkbox" checked={j.done} onChange={(e) => set({ done: e.target.checked })} /> Finished</label>
        <Field label="Notes" full><textarea rows={2} value={j.notes} onChange={(e) => set({ notes: e.target.value })} /></Field>
      </div>
    </Dialog>
  );
}

interface JobTemplate { title: string; kind: MaintenanceJob["kind"]; days: number; grounds: boolean }

/** Common jobs to start from before there's any history. */
const STARTER_JOBS: JobTemplate[] = [
  { title: "100 hour inspection", kind: "Inspection", days: 1, grounds: true },
  { title: "Annual inspection", kind: "Inspection", days: 5, grounds: true },
  { title: "Phase inspection", kind: "Inspection", days: 3, grounds: true },
  { title: "Engine change", kind: "Repair", days: 5, grounds: true },
  { title: "Pre-flight", kind: "Pre-flight", days: 1, grounds: false },
];

/**
 * Jobs to start a new one from: the ones planned before (most used first, with their usual length,
 * kind and grounding), topped up with common starters.
 */
function jobTemplates(data: AppData): JobTemplate[] {
  const seen = new Map<string, { t: JobTemplate; n: number; lengths: number[] }>();
  for (const j of data.jobs) {
    const key = j.title.trim();
    if (!key) continue;
    const days = Math.max(1, Math.round((ms(j.end) - ms(j.start)) / DAY));
    const x = seen.get(key.toLowerCase()) ?? { t: { title: key, kind: j.kind, days, grounds: j.grounds }, n: 0, lengths: [] };
    x.n++;
    x.lengths.push(days);
    seen.set(key.toLowerCase(), x);
  }
  // The usual length: the one used most often.
  const usual = (xs: number[]) => [...xs].sort((a, b) => xs.filter((v) => v === b).length - xs.filter((v) => v === a).length || a - b)[0];
  const own = [...seen.values()].sort((a, b) => b.n - a.n || a.t.title.localeCompare(b.t.title)).map((x) => ({ ...x.t, days: usual(x.lengths) }));
  const starters = STARTER_JOBS.filter((s) => !seen.has(s.title.toLowerCase()));
  return [...own, ...starters].slice(0, 8);
}

// ---------------------------------------------------------------- time off

function TimeOffDialog({ id, defaults, fix = {} }: Props) {
  const { data, upsert, remove, close, showToast } = useStore();
  useSpot(fix.spot);
  const existing = data.timeOff.find((t) => t.id === id);
  const d0 = today();
  const [t, setT] = useState<TimeOff>(() => existing ?? {
    id: uid(), personId: data.people[0]?.id ?? "", start: toWhen(addDays(d0, 1)), end: toWhen(addDays(d0, 2)), reason: "", ...(defaults as Partial<TimeOff>),
  });
  const dirty = useDirty(t);
  const set = (patch: Partial<TimeOff>) => setT((x) => ({ ...x, ...patch }));
  const timeError = !(ms(t.end) > ms(t.start));
  const person = data.people.find((p) => p.id === t.personId);
  return (
    <Dialog title={existing ? "Time off" : "Add time off"} onClose={close} dirty={dirty}
      meta={person && <><span>{person.name}</span>{!timeError && <>·<span>{fmtDates(t.start, t.end)}</span></>}</>}
      foot={<Foot isNew={!existing} label="time off" problem={!t.personId ? "Pick who's off." : timeError && "The last day is before the first day."}
        onSave={() => { upsert("timeOff", t); if (!existing) showToast("Added time off"); close(); }}
        onDelete={() => { remove("timeOff", t.id, "Deleted time off"); close(); }} />}>
      <div className="form-grid">
        <Field label="Person" full>
          <select value={t.personId} onChange={(e) => set({ personId: e.target.value })}>
            {data.people.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.role.toLowerCase()})</option>)}
          </select>
        </Field>
        <DateFields spot="dates" start={t.start} end={t.end} onChange={(start, end) => set({ start, end })} />
        <label className="check full">
          <input type="checkbox" checked={!!t.soft} onChange={(e) => set({ soft: e.target.checked })} />
          Only a preference: they'd rather not work these days, but can be booked
        </label>
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
    <div className="field full" data-spot="rotation">
      <span>Rotation</span>
      <label className="check">
        <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked ? r : null)} />
        Works a fixed rotation
      </label>
      {value && (
        <span className="rotation" style={{ marginTop: 4 }}>
          <NumberInput min={1} max={365} aria-label="Days on" value={value.on} onChange={(on) => set({ on })} />
          on
          <NumberInput min={0} max={365} aria-label="Days off" value={value.off} onChange={(off) => set({ off })} />
          off, from
          <DateInput ariaLabel="First day of an on stretch" value={value.start} onChange={(start) => set({ start })} />
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
function TrainingRecords({ person, onChange, spot }: { person: Person; onChange: (records: TrainingRecord[]) => void; spot?: string }) {
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
  // The course a problem is about: where it stands, and one tap to record the new date.
  const focusId = spot?.startsWith("training:") ? spot.slice(9) : null;
  const focus = focusId ? trainings.find((t) => t.id === focusId) : undefined;
  const focusState = focus ? trainingStatus(person, focus.id, Date.now(), Date.now() + 1) : null;
  const focusLatest = focus ? person.training.filter((r) => r.trainingId === focus.id).map((r) => validUntil(r)).sort().at(-1) : undefined;
  /** Extend the newest record of the course the problem is about, and open it to set the date and why. */
  const extend = (tid: string) => {
    const k = order.find(({ r }) => r.trainingId === tid)?.i;
    if (k === undefined || !person.training[k].expires) return;
    const r = person.training[k];
    setAt(k, { extendedTo: r.extendedTo ?? addMonthsTo(format(today(), "yyyy-MM-dd") > r.expires! ? format(today(), "yyyy-MM-dd") : r.expires!, 3), extensionNote: r.extensionNote ?? "" });
    setEditing(k);
  };
  return (
    <>
      {focus && focusState && (
        <div className="fix-callout" data-spot={spot}>
          <span className="grow">
            <b>{focus.name}</b>{" "}
            {focusState.state === "missing" ? "isn't on record yet." : focusState.state === "expired" ? `ran out ${fmtDay(focusState.expires!)}.` : focusLatest ? `runs out ${fmtDay(focusLatest)}.` : "is current."}
            <span className="small muted" style={{ display: "block" }}>Add the date they did it (or will do it). The old record stays as history.</span>
          </span>
          <span className="row gap-sm wrap">
            <button className="btn sm primary" onClick={() => add(focus.id)}><Plus size={14} /> Add the new date</button>
            {person.training.some((r) => r.trainingId === focus.id && r.expires) && <button className="btn sm" onClick={() => extend(focus.id)}>Extend it…</button>}
          </span>
        </div>
      )}
      {person.training.length > 0 && (
        <div className="lines">
          {order.map(({ r, i }) => {
            const t = trainings.find((x) => x.id === r.trainingId);
            const until = validUntil(r);
            const expired = !!until && until <= todayStr;
            const due = !expired && !!until && until <= soon;
            const extended = !!r.expires && until !== r.expires;
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
                    <DateInput label="Completed" today value={r.completed} onChange={(v) => setAt(i, { completed: v, expires: t?.validMonths ? addMonthsTo(v, t.validMonths) : r.expires })} />
                    <DateInput label="Runs out" hint="Empty if it never does." value={r.expires ?? ""} min={r.completed} clearable="Never runs out" onChange={(v) => setAt(i, { expires: v || null })} />
                  </div>
                  {r.expires && (
                    <div className="field">
                      <label className="check">
                        <input type="checkbox" checked={!!r.extendedTo} onChange={(e) => setAt(i, e.target.checked ? { extendedTo: addMonthsTo(r.expires!, 3), extensionNote: r.extensionNote ?? "" } : { extendedTo: null, extensionNote: "" })} />
                        Extend it (they can't get back for the renewal yet)
                      </label>
                      {r.extendedTo && (
                        <div className="pair" style={{ marginTop: 6 }}>
                          <DateInput label="Counted as current until" value={r.extendedTo} min={r.expires} onChange={(v) => setAt(i, { extendedTo: v })} />
                          <Field label="Why"><input value={r.extensionNote ?? ""} placeholder="On the North Slope job until June" onChange={(e) => setAt(i, { extensionNote: e.target.value })} /></Field>
                        </div>
                      )}
                      <span className="hint">Only for a real reason your operation allows; the reason shows wherever the extension does.</span>
                    </div>
                  )}
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
                {renewed.has(i) ? null : expired ? <span className="pill danger">Ran out {fmtDay(until!)}</span>
                  : due ? <span className="pill warn">Runs out {fmtDay(until!)}</span>
                  : <span className="when">{until ? `To ${fmtDay(until)}` : "Never runs out"}</span>}
                {!renewed.has(i) && extended && <span className="pill accent" title={r.extensionNote || "Extended"}>Extended{r.extensionNote ? `: ${r.extensionNote}` : ""}</span>}
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
  const dirty = useDirty(t);
  const set = (patch: Partial<Training>) => setT((x) => ({ ...x, ...patch }));
  const holders = data.people.filter((p) => p.training.some((r) => r.trainingId === id)).length;
  const missions = data.missions.filter((m) => m.requiredTrainingIds.includes(id)).length;
  return (
    <Dialog title={existing ? t.name || "Training" : "Add training"} onClose={close} dirty={dirty}
      meta={existing && <><span>{plural(holders, "person", "people")} on record</span>·<span>Needed by {plural(missions, "mission")}</span></>}
      foot={<Foot isNew={!existing} label="training" problem={!t.name.trim() && "Name the course first."}
        onSave={() => { upsert("trainings", t); if (!existing) showToast(`Added “${t.name}”`); close(); }}
        onDelete={() => { remove("trainings", t.id, `Deleted “${t.name}”${holders ? ` and ${plural(holders, "record")}` : ""}`); close(); }} />}>
      <div className="form-grid">
        <Field label="Name" full><input autoFocus={autoFocusBox} value={t.name} placeholder="Night vision goggles (NVG)" onChange={(e) => set({ name: e.target.value })} /></Field>
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
