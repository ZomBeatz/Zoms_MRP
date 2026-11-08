import { useMemo, useState } from "react";
import { differenceInCalendarDays, format } from "date-fns";
import { CalendarCheck, Plus, Trash2, UserMinus, UserPlus } from "lucide-react";
import { useStore } from "../store";
import { bookings } from "../bookings";
import { planCrew, seatsFor, whatIfs, type CrewPlan, type GroupPlan, type PlanAircraft, type PlanInput } from "../crewPlan";
import { missionCoverage, requiredTraining, trainingStatus, whoCanCover } from "../coverage";
import { fillSeason } from "../fill";
import { seasonRules } from "../limits";
import { hoursPerDay } from "../program";
import { money } from "../cost";
import { dateToStart, dayAt, endToDate, fmtDates, ms, plural, startToDate, toWhen, today, uid } from "../time";
import { missionLook, slotStyle } from "../look";
import { DateRange } from "../components/dates";
import { Field, NumberInput, usePref } from "../components/ui";
import type { AppData, Booking, FlightLimit, Person, Shift } from "../types";

/**
 * The crew planner: how few pilots a job takes and the rotation that does it (see src/crewPlan.ts).
 * Start from a season or from your own numbers, change the rules to see what they cost, and book the
 * plan on a season with real pilots. "Several jobs" adds up what the coming jobs need at once against
 * the pilots rated for them.
 */

/** A season to start from, handed over by the season form's "Work out the crew". */
const HANDOFF = "mrp-planner-season";
export const planSeason = (id: string) => {
  try {
    sessionStorage.setItem(HANDOFF, id);
  } catch { /* the planner just starts from scratch */ }
};
const takeHandoff = () => {
  try {
    const id = sessionStorage.getItem(HANDOFF);
    sessionStorage.removeItem(HANDOFF);
    return id;
  } catch {
    return null;
  }
};

interface Form {
  seasonId: string;
  first: string;
  last: string;
  aircraft: PlanAircraft[];
  maxDaysOn: number;
  minDaysOff: number;
  maxDutyHours: number;
  minRestHours: number;
  travelDays: number;
  flightLimits: FlightLimit[];
  /** The course that makes a pilot night qualified (NVG), or "" to count every rated pilot. */
  nightTrainingId: string;
  /** What a pilot is paid per day away, and what the customer pays per day of the job. */
  dayRate: number;
  dayCharge: number;
}

const ymd = (t: number) => format(t, "yyyy-MM-dd");
const types = (data: AppData) => [...new Set(data.aircraft.map((a) => a.type).filter(Boolean))].sort();

function blank(data: AppData): Form {
  const s = data.settings;
  const first = dayAt(today(), 0);
  const rates = data.people.filter((p) => p.role === "Pilot" && p.dayRate).map((p) => p.dayRate!);
  return {
    seasonId: "", first: ymd(first), last: ymd(dayAt(first, 89)),
    aircraft: [{ label: "Aircraft 1", type: types(data)[0] ?? "", staffedHours: 12, flightHours: s.maintenance.hoursPerDay }],
    maxDaysOn: s.rules.maxDaysOn, minDaysOff: s.rules.minDaysOff, maxDutyHours: s.maxDutyHours || 14, minRestHours: s.minRestHours ?? 0, travelDays: 0,
    flightLimits: (s.flightLimits ?? []).map((l) => ({ ...l })),
    nightTrainingId: data.trainings.find((t) => /night|nvg/i.test(t.name))?.id ?? "",
    dayRate: rates.length ? Math.round(rates.reduce((t, x) => t + x, 0) / rates.length) : 0, dayCharge: 0,
  };
}

/** The planner filled in from a season: its dates, aircraft, rules, and how its pilots are split. */
function fromSeason(data: AppData, b: Booking, base: Form): Form {
  const rules = seasonRules(data, b);
  const duty = Math.min(base.maxDutyHours || 24, base.minRestHours ? 24 - base.minRestHours : 24);
  const aircraft = b.aircraftIds.map((id) => data.aircraft.find((a) => a.id === id)).filter((a) => !!a);
  // How many pilots each aircraft had, from the season's total: shared out, the first ones get any extra.
  const n = Math.max(1, aircraft.length);
  const each = (i: number) => Math.floor(b.pilotsNeeded / n) + (i < b.pilotsNeeded % n ? 1 : 0);
  const staffed = (pilots: number) => (pilots <= 1 ? Math.min(12, duty) : Math.min(24, pilots * duty));
  return {
    ...base, seasonId: b.id, first: startToDate(b.start), last: endToDate(b.end),
    aircraft: aircraft.length
      ? aircraft.map((a, i) => ({ label: a.tail, type: a.type, staffedHours: staffed(each(i)), flightHours: hoursPerDay(data, a), hourCost: a.hourCost ?? null }))
      : [{ label: "Aircraft 1", type: "", staffedHours: staffed(b.pilotsNeeded), flightHours: data.settings.maintenance.hoursPerDay }],
    maxDaysOn: rules.maxDaysOn, minDaysOff: rules.minDaysOff,
    dayCharge: data.missions.find((m) => m.id === b.missionId)?.dayCharge ?? 0,
  };
}

const inputOf = (form: Form, days: number): PlanInput => ({
  aircraft: form.aircraft, days, maxDaysOn: form.maxDaysOn, minDaysOff: form.minDaysOff, maxDutyHours: form.maxDutyHours,
  minRestHours: form.minRestHours, travelDays: form.travelDays, flightLimits: form.flightLimits,
});
const daysOf = (first: string, last: string) => (first && last ? differenceInCalendarDays(new Date(`${last}T00:00`), new Date(`${first}T00:00`)) + 1 : 0);

/** Pilots who can take a group's seats: rated on its type, and night qualified for night seats (when a course says so). */
function canFly(p: Person, g: Pick<GroupPlan, "type" | "night">, nightTrainingId: string, a: number, b: number) {
  if (p.role !== "Pilot") return false;
  if (g.type && !p.quals.includes(g.type)) return false;
  return !g.night || !nightTrainingId || trainingStatus(p, nightTrainingId, a, b).state === "ok";
}

export function Planner() {
  const [mode, setMode] = usePref<"one" | "several">("planner-mode", "one");
  return (
    <>
      <div className="page-head">
        <h1>Crew planner</h1>
        <div className="seg">
          <button className={mode === "one" ? "active" : ""} onClick={() => setMode("one")}>One job</button>
          <button className={mode === "several" ? "active" : ""} onClick={() => setMode("several")}>Several jobs</button>
        </div>
      </div>
      {mode === "one" ? <OneJob /> : <SeveralJobs />}
    </>
  );
}

function OneJob() {
  const { data } = useStore();
  // Seasons still to come or under way.
  const seasons = useMemo(() => bookings(data).filter((b) => b.status !== "Cancelled" && ms(b.end) > Date.now()).sort((a, b) => a.start.localeCompare(b.start)), [data]);
  const [form, setForm] = useState<Form>(() => {
    const id = takeHandoff();
    const b = id ? bookings(data).find((x) => x.id === id) : undefined;
    return b ? fromSeason(data, b, blank(data)) : blank(data);
  });
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));
  const setAircraft = (i: number, patch: Partial<PlanAircraft>) => set({ aircraft: form.aircraft.map((a, j) => (j === i ? { ...a, ...patch } : a)) });
  const season = seasons.find((b) => b.id === form.seasonId);
  const fleetTypes = types(data);

  const days = daysOf(form.first, form.last);
  const input = useMemo(() => inputOf(form, days), [form, days]);
  const result = useMemo(() => planCrew(input), [input]);
  const ifs = useMemo(() => (result.ok ? whatIfs(input, result.plan) : []), [input, result]);

  return (
    <>
      <p className="muted" style={{ marginTop: -8 }}>
        How few pilots a job takes, and the rotation that does it. Put in the aircraft, how long each is staffed a day and the rules; the answer and the rotation update as you go. Book it on a job when it looks right.
      </p>

      <div className="planner">
        <div className="planner-form">
          <section className="panel">
            <h3>The job</h3>
            <Field label="Start from a job" hint="Fills in its dates, aircraft, limits and charge. Or put in your own numbers.">
              <select value={form.seasonId} onChange={(e) => {
                const b = seasons.find((x) => x.id === e.target.value);
                setForm(b ? fromSeason(data, b, form) : { ...form, seasonId: "" });
              }}>
                <option value="">Your own numbers</option>
                {seasons.map((b) => <option key={b.id} value={b.id}>{b.name} · {fmtDates(b.start, b.end)}</option>)}
              </select>
            </Field>
            <div style={{ marginTop: 12 }}>
              <DateRange first={form.first} last={form.last} onChange={(first, last) => set({ first, last })} />
            </div>
          </section>

          <section className="panel">
            <h3>Aircraft</h3>
            <div className="planner-aircraft">
              {form.aircraft.map((a, i) => {
                const seats = seatsFor(a, form.maxDutyHours, form.minRestHours);
                return (
                  <div key={i} className="planner-ac">
                    <div className="planner-ac-head">
                      <input aria-label="Aircraft" value={a.label} onChange={(e) => setAircraft(i, { label: e.target.value })} />
                      <button className="icon-btn" aria-label={`Remove ${a.label || "this aircraft"}`} onClick={() => set({ aircraft: form.aircraft.filter((_, j) => j !== i) })}><Trash2 size={15} /></button>
                    </div>
                    <div className="planner-ac-fields">
                      <label className="small"><span className="muted">Type</span>
                        <select aria-label="Aircraft type" value={a.type ?? ""} onChange={(e) => setAircraft(i, { type: e.target.value })}>
                          <option value="">Any pilot</option>
                          {[...new Set([...fleetTypes, ...(a.type ? [a.type] : [])])].map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </label>
                      <label className="small"><span className="muted">Hours staffed a day</span>
                        <span className="row gap" style={{ alignItems: "center" }}>
                          <span className="seg">
                            {[12, 24].map((h) => <button key={h} className={a.staffedHours === h ? "active" : ""} onClick={() => setAircraft(i, { staffedHours: h })}>{h}</button>)}
                          </span>
                          <NumberInput aria-label="Hours staffed a day" min={0} max={24} value={a.staffedHours} onChange={(staffedHours) => setAircraft(i, { staffedHours })} />
                        </span>
                      </label>
                      <label className="small"><span className="muted">Flight hours a day</span>
                        <NumberInput aria-label="Flight hours a day" min={0} max={24} step={0.5} value={a.flightHours} onChange={(flightHours) => setAircraft(i, { flightHours })} />
                      </label>
                    </div>
                    {a.staffedHours > 12 && (
                      <label className="check small"><input type="checkbox" checked={!!a.night} onChange={(e) => setAircraft(i, { night: e.target.checked })} /> The night pilot needs to be night qualified</label>
                    )}
                    <span className="small planner-seats">{seats ? `${plural(seats, "pilot")} on duty a day${a.night ? ", one of them at night" : ""}` : "Not staffed"}</span>
                  </div>
                );
              })}
            </div>
            <button className="btn sm" style={{ marginTop: 8 }} onClick={() => set({ aircraft: [...form.aircraft, { label: `Aircraft ${form.aircraft.length + 1}`, type: form.aircraft[form.aircraft.length - 1]?.type ?? fleetTypes[0] ?? "", staffedHours: 12, flightHours: data.settings.maintenance.hoursPerDay }] })}>
              <Plus size={14} /> Add an aircraft
            </button>
            {form.aircraft.some((a) => a.night) && (
              <Field label="Night qualified means" hint="Only pilots with this qualification current count for night seats.">
                <select value={form.nightTrainingId} onChange={(e) => set({ nightTrainingId: e.target.value })}>
                  <option value="">Any rated pilot</option>
                  {data.trainings.filter((t) => t.appliesTo !== "Maintainer").map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </Field>
            )}
          </section>

          <section className="panel">
            <h3>Rules</h3>
            <div className="form-grid">
              <Field label="Most days in camp in a row"><NumberInput min={1} max={365} value={form.maxDaysOn} onChange={(maxDaysOn) => set({ maxDaysOn })} /></Field>
              <Field label="Fewest days off between"><NumberInput min={0} max={180} value={form.minDaysOff} onChange={(minDaysOff) => set({ minDaysOff })} /></Field>
              <Field label="Travel days each way" hint="Count as days on, not days off."><NumberInput min={0} max={10} value={form.travelDays} onChange={(travelDays) => set({ travelDays })} /></Field>
              <Field label="Longest duty day" hint="Hours."><NumberInput min={1} max={24} value={form.maxDutyHours} onChange={(maxDutyHours) => set({ maxDutyHours })} /></Field>
              <Field label="Rest between duty days" hint="Hours. 0 = no limit."><NumberInput min={0} max={23} value={form.minRestHours} onChange={(minRestHours) => set({ minRestHours })} /></Field>
              <Field label="Flight-hour limits" full hint="Per pilot, in any stretch of that many days.">
                <FlightLimitsEditor value={form.flightLimits} onChange={(flightLimits) => set({ flightLimits })} />
              </Field>
            </div>
          </section>

          {data.settings.costs && <section className="panel">
            <h3>Cost</h3>
            <div className="form-grid">
              <Field label="Pilot pay per day away" hint="Travel days included."><NumberInput min={0} max={100000} value={form.dayRate} onChange={(dayRate) => set({ dayRate })} /></Field>
              <Field label="Customer pays per day"><NumberInput min={0} max={1000000} value={form.dayCharge} onChange={(dayCharge) => set({ dayCharge })} /></Field>
            </div>
          </section>}
        </div>

        <div className="planner-result">
          {result.ok ? <Answer plan={result.plan} input={input} ifs={ifs} form={form} data={data} /> : <div className="panel muted">{result.reason}</div>}
        </div>
      </div>

      {result.ok && (
        <>
          <h2>The rotation</h2>
          <Board plan={result.plan} first={form.first} days={days} season={season} data={data} nightTrainingId={form.nightTrainingId} />
        </>
      )}
    </>
  );
}

/** A list of flight-hour limits ("100 hours in 30 days"), used here and in Settings. */
export function FlightLimitsEditor({ value, onChange }: { value: FlightLimit[]; onChange: (v: FlightLimit[]) => void }) {
  const next = [{ hours: 100, days: 30 }, { hours: 300, days: 90 }, { hours: 1000, days: 365 }].find((x) => !value.some((l) => l.days === x.days)) ?? { hours: 100, days: 30 };
  return (
    <div className="planner-limits">
      {value.map((l, i) => (
        <div key={i} className="row gap-sm" style={{ alignItems: "center" }}>
          <NumberInput aria-label="Most flight hours" min={1} max={5000} value={l.hours} onChange={(hours) => onChange(value.map((x, j) => (j === i ? { ...x, hours } : x)))} style={{ width: 76 }} />
          <span className="small muted">hours in</span>
          <NumberInput aria-label="Days" min={1} max={365} value={l.days} onChange={(days) => onChange(value.map((x, j) => (j === i ? { ...x, days } : x)))} style={{ width: 64 }} />
          <span className="small muted">days</span>
          <button className="icon-btn" aria-label={`Remove ${l.hours} hours in ${l.days} days`} onClick={() => onChange(value.filter((_, j) => j !== i))}><Trash2 size={15} /></button>
        </div>
      ))}
      <button className="btn sm" onClick={() => onChange([...value, next])}><Plus size={14} /> {value.length ? "Add another" : "Add a limit"}</button>
    </div>
  );
}

const one = (n: number) => (Math.round(n * 10) / 10).toString();
const ceil = (n: number) => Math.ceil(n - 1e-9);

/** The number, and why, in plain words. */
function Answer({ plan, input, ifs, form, data }: { plan: CrewPlan; input: PlanInput; ifs: ReturnType<typeof whatIfs>; form: Form; data: AppData }) {
  const fewer = ifs.filter((w) => w.pilots < plan.pilots), more = ifs.filter((w) => w.pilots > plan.pilots);
  const many = plan.groups.length > 1;
  const g0 = plan.groups[0];
  const sym = data.settings.currencySymbol ?? "$";
  const crew = plan.dutyDays * form.dayRate;
  const flying = input.aircraft.reduce((t, a, i) => t + (plan.seatsByAircraft[i] ? a.flightHours * input.days * (a.hourCost ?? 0) : 0), 0);
  const charged = input.days * form.dayCharge;
  const start = ms(dateToStart(form.first)), end = dayAt(start, input.days);
  const pool = (g: GroupPlan) => data.people.filter((p) => canFly(p, g, form.nightTrainingId, start, end)).length;
  const rotation = (g: GroupPlan) => (g.pilots === g.seats && input.days <= g.on ? "All of it" : `${g.on + 2 * plan.travelDays} on, ${g.off} off`);
  return (
    <>
      <div className="tiles planner-tiles">
        <div className="tile"><div className="label">Pilots needed</div><div className="value planner-big">{plan.pilots}</div></div>
        <div className="tile"><div className="label">On duty each day</div><div className="value">{plan.seats}</div></div>
        <div className="tile"><div className="label">Rotation</div><div className="value planner-rot">{many && new Set(plan.groups.map(rotation)).size > 1 ? "By group" : rotation(g0)}</div></div>
        {(crew > 0 || charged > 0) && (
          <div className="tile"><div className="label">{charged ? "Margin" : "Cost"}</div>
            <div className={`value planner-rot ${charged && charged - crew - flying < 0 ? "danger" : ""}`}>{money(Math.round(charged ? charged - crew - flying : crew + flying), sym)}</div></div>
        )}
      </div>
      <section className="panel planner-why">
        <h3>Why {plural(plan.pilots, "pilot")}</h3>
        <ul>
          <li>
            <b>{plural(plan.seats, "pilot")} on duty every day.</b>{" "}
            {input.aircraft.map((a, i) => plan.seatsByAircraft[i] ? `${a.label || `Aircraft ${i + 1}`}: ${a.staffedHours} hours, ${plural(plan.seatsByAircraft[i], "pilot")}` : null).filter(Boolean).join("; ")}
            {input.aircraft.some((a) => a.staffedHours > plan.longestDuty)
              ? ` (duty days up to ${plan.longestDuty} hours${input.minRestHours && 24 - input.minRestHours < input.maxDutyHours ? `, to leave ${input.minRestHours} hours' rest` : ""}).` : "."}
          </li>
          {plan.travelDays > 0 && (
            <li><b>{plural(plan.travelDays, "travel day")} each way.</b> They count toward the {input.maxDaysOn} days on, so a pilot covers a seat for at most {input.maxDaysOn - 2 * plan.travelDays}, and they don't count as days off.</li>
          )}
          {many && <li><b>Only rated pilots can fly each type{plan.groups.some((g) => g.night) ? ", and night seats need night-qualified pilots" : ""}</b>, so each group is planned on its own:</li>}
        </ul>
        {plan.groups.map((g) => {
          const have = pool(g);
          return (
            <div key={g.key} className={many ? "planner-group" : ""}>
              {many && <h4>{g.key || "Any pilot"}: {plural(g.pilots, "pilot")} <span className="small muted">· {plural(g.seats, "seat")} · {rotation(g)}</span></h4>}
              <ul>
                <GroupWhy g={g} input={input} travel={plan.travelDays} />
                <li className={have < g.pilots ? "warn-text" : "muted"}>
                  {have < g.pilots ? <b>You have {have}</b> : <>You have {have}</>} {g.type ? `rated on ${g.type}` : "pilots"}{g.night && form.nightTrainingId ? " and night qualified" : ""}{have < g.pilots ? `: ${plural(g.pilots - have, "more pilot")} needed.` : "."}
                </li>
              </ul>
            </div>
          );
        })}
        {fewer.length > 0 && <p className="muted small" style={{ margin: "4px 0" }}>Fewer isn't possible on these rules. It takes changing one:</p>}
        {(fewer.length > 0 || more.length > 0) && (
          <div className="planner-ifs">
            {fewer.map((w) => <div key={w.text} className="planner-if"><UserMinus size={15} /><span><b>{plural(w.pilots, "pilot")}</b> with {w.text}</span></div>)}
            {more.map((w) => <div key={w.text} className="planner-if"><UserPlus size={15} /><span><b>{plural(w.pilots, "pilot")}</b> gives {w.text}</span></div>)}
          </div>
        )}
        {data.settings.costs && (crew > 0 || flying > 0 || charged > 0) && (
          <div className="planner-cost">
            {crew > 0 && <span>Crew: {plan.dutyDays} days away × {money(form.dayRate, sym)} = <b>{money(Math.round(crew), sym)}</b></span>}
            {flying > 0 && <span>Flying: {one(plan.flightHours)} hours = <b>{money(Math.round(flying), sym)}</b></span>}
            {charged > 0 && <span>Customer: {input.days} days × {money(form.dayCharge, sym)} = <b>{money(Math.round(charged), sym)}</b></span>}
          </div>
        )}
      </section>
    </>
  );
}

/** Why one group needs its number: rest, flying, and what the rotation does. */
function GroupWhy({ g, input, travel }: { g: GroupPlan; input: PlanInput; travel: number }) {
  const on = input.maxDaysOn - 2 * travel, off = input.minDaysOff + 2 * travel;
  const cycle = g.on + g.off + 2 * travel;
  const long = input.days >= on + off + on;
  const floor = Math.max(g.seats, ceil(g.restFloor), g.flightFloor ? ceil(g.flightFloor.pilots) : 0);
  return (
    <>
      {long && g.restFloor > g.seats && (
        <li>
          <b>Everyone needs their days off.</b> A pilot covers a seat {on} days in every {on + off}:
          {" "}{g.seats} × {on + off} ÷ {on} = <b>{one(g.restFloor)}</b> pilots on average.
        </li>
      )}
      {g.flightFloor && (
        <li>
          <b>Everyone can only fly so much.</b> Each pilot on duty flies about {one(g.hoursPerPilotDay)} hours a day.
          {" "}With {g.flightFloor.limit.hours} hours in {g.flightFloor.limit.days} days that's <b>{one(g.flightFloor.pilots)}</b> pilots
          {g.mostFlight.length > 1 ? " (the limit that needs the most)" : ""}. The busiest pilot flies {g.mostFlight.map((m) => `${one(m.hours)} of ${m.limit.hours} in ${m.limit.days} days`).join(", ")}.
        </li>
      )}
      <li>
        {g.pilots === g.seats
          ? <><b>No rotation needed:</b> the job is no longer than a hitch{g.flightFloor ? " and the flying fits the limits" : ""}, so the same {plural(g.seats, "pilot")} can stay for all of it.</>
          : <><b>{plural(g.pilots, "pilot")}</b> on {g.on} days on a seat and {g.off} off{travel ? `, plus travel` : ""}, each starting about {plural(Math.round(cycle / g.pilots), "day")} after the last, keep {g.seats} on every day.</>}
        {g.pilots > floor && long && " Whole hitches that fit these dates need one more than the average."}
        {g.pilots < floor && " The job is short, so it takes fewer than the average."}
      </li>
    </>
  );
}

/** Each planned pilot's hitches across the job, and booking them on a season with real pilots. */
function Board({ plan, first, days, season, data, nightTrainingId }: { plan: CrewPlan; first: string; days: number; season?: Booking; data: AppData; nightTrainingId: string }) {
  const { change, open } = useStore();
  const start = ms(dateToStart(first));
  const at = (n: number) => dayAt(start, n);
  const pct = (n: number) => (Math.max(0, Math.min(days, n)) / days) * 100;
  const travel = plan.travelDays;
  // Month marks along the top.
  const marks: { n: number; label: string }[] = [];
  for (let n = 0; n < days; n++) {
    const d = new Date(at(n));
    // Not so close to the last one that the labels run together.
    if ((n === 0 || d.getDate() === 1) && (!marks.length || pct(n - marks[marks.length - 1].n) > 10))
      marks.push({ n, label: format(d, n === 0 ? "MMM d" : d.getMonth() === 0 ? "MMM yyyy" : "MMM") });
  }
  // Every line, with its group.
  const lines = plan.groups.flatMap((g) => g.hitches.map((h) => ({ g, h })));

  // Who can take each line on the season: rated, current, free (without the season's own pilot shifts).
  const mission = season ? data.missions.find((m) => m.id === season.missionId) : undefined;
  const required = mission ? requiredTraining(data, mission, "Pilot") : [];
  const without: AppData = useMemo(() => (season ? { ...data, shifts: data.shifts.filter((s) => s.seasonId !== season.id || data.people.find((p) => p.id === s.personId)?.role !== "Pilot") } : data), [data, season]);
  const fits = (p: Person, g: GroupPlan) => canFly(p, g, nightTrainingId, start, at(days));
  /** For each line, each pilot who can fly its group: hitches they can't take, and why the first one. */
  const fit = useMemo(() => {
    const out = new Map<string, { bad: number; why: string }>();
    if (!season) return out;
    lines.forEach(({ g, h }, i) => {
      // Everyone's answer for each hitch at once (asking person by person repeats the work for each).
      const answers = h.map(([a, b]) => new Map(whoCanCover(without, "Pilot", at(a - travel), at(b + travel), g.type || null, [], required, season.missionId).map((c) => [c.person.id, c])));
      for (const p of data.people.filter((x) => fits(x, g))) {
        let bad = 0, why = "";
        for (const answer of answers) {
          const c = answer.get(p.id);
          if (!c || c.ok) continue;
          bad++;
          why ||= !c.trained ? "qualifications not current" : !c.current ? "not flown the type lately" : c.off ? "time off" : !c.onRotation ? "off their rotation" : "booked elsewhere";
        }
        out.set(`${i}|${p.id}`, { bad, why });
      }
    });
    return out;
  }, [plan, season, without, start, nightTrainingId]); // eslint-disable-line react-hooks/exhaustive-deps

  // The usual pick: whoever fits the line best, mission crew first.
  const auto = useMemo(() => {
    if (!season) return [];
    const used = new Set<string>();
    return lines.map(({ g }, i) => {
      const best = data.people.filter((p) => fits(p, g) && !used.has(p.id))
        .sort((a, b) => fit.get(`${i}|${a.id}`)!.bad - fit.get(`${i}|${b.id}`)!.bad || Number(b.missionIds.includes(season.missionId)) - Number(a.missionIds.includes(season.missionId)) || a.name.localeCompare(b.name))[0];
      if (best) used.add(best.id);
      return best?.id ?? "";
    });
  }, [fit, plan]); // eslint-disable-line react-hooks/exhaustive-deps
  const [picked, setPicked] = useState<Record<number, string>>({});
  const who = (i: number) => (i in picked ? picked[i] : auto[i] ?? "");
  const twice = new Set(lines.map((_, i) => who(i)).filter((id, i, all) => id && all.indexOf(id) !== i));

  /**
   * Book the lines on the season. A picked pilot only gets the hitches they can legally take; the rest are
   * filled the way Fill the schedule does (rated, current, free, rested, inside every limit), and anything
   * nobody can take stays open, so it shows as an open seat instead of a booking over someone's time off.
   */
  const book = () => {
    if (!season) return;
    const shifts: Shift[] = [];
    let handed = 0;
    lines.forEach(({ g, h }, i) => {
      const personId = who(i);
      if (!personId) return;
      for (const [a, b] of h) {
        const taken: AppData = { ...without, shifts: [...without.shifts, ...shifts] };
        const c = whoCanCover(taken, "Pilot", at(a - travel), at(b + travel), g.type || null, [], required, season.missionId).find((x) => x.person.id === personId);
        if (c?.ok) shifts.push({ id: uid(), seasonId: season.id, personId, start: toWhen(at(a)), end: toWhen(at(b)) });
        else handed++;
      }
    });
    // Handovers: a shift starting the day another ends takes over from it.
    for (const s of shifts) {
      const from = shifts.find((x) => x.end === s.start && x.personId !== s.personId && !shifts.some((y) => y.after === x.id));
      if (from) s.after = from.id;
    }
    const main = plan.groups.reduce((a, b) => (b.seats > a.seats ? b : a));
    const rotation = { on: main.on, off: main.off + 2 * travel };
    const d = useStore.getState().data;
    const seasons = d.seasons.map((s) => (s.id === season.id ? { ...s, pilotsNeeded: plan.seats, pilotRotation: rotation } : s));
    let next: AppData = { ...d, seasons, shifts: [...d.shifts.filter((s) => s.seasonId !== season.id || d.people.find((p) => p.id === s.personId)?.role !== "Pilot"), ...shifts] };
    let others = 0, opened = 0;
    // What the picked pilots couldn't take: filled like Fill the schedule, or left open.
    if (handed) {
      const added = fillSeason(next, seasons.find((s) => s.id === season.id)!, "Pilot", rotation, { ...next.settings.rules });
      others = new Set(added.map((s) => s.personId)).size;
      next = { ...next, shifts: [...next.shifts, ...added] };
      opened = missionCoverage(next, next.seasons.find((s) => s.id === season.id)!).pilotGaps.length;
    }
    const on = new Set(next.shifts.filter((s) => s.seasonId === season.id).map((s) => s.personId));
    next = { ...next, people: next.people.map((p) => (p.role === "Pilot" && on.has(p.id) && !p.missionIds.includes(season.missionId) ? { ...p, missionIds: [...p.missionIds, season.missionId] } : p)) };
    const picked_ = new Set(shifts.map((s) => s.personId)).size;
    change(() => next, !handed ? `Booked ${plural(picked_, "pilot")} on “${season.name}”`
      : `Booked ${plural(picked_, "pilot")}. ${plural(handed, "hitch", "hitches")} they couldn't take ${others ? `went to ${plural(others, "other pilot")}` : "had nobody free"}${opened ? `; ${plural(opened, "stretch", "stretches")} still open` : ""}`);
    open("season", season.id, undefined, { tab: "pilots" });
  };
  const matches = season && startToDate(season.start) === first && ms(season.end) === at(days);
  const hasPilots = season && data.shifts.some((s) => s.seasonId === season.id && data.people.find((p) => p.id === s.personId)?.role === "Pilot");
  const many = plan.groups.length > 1;

  return (
    <div className="panel planner-board">
      <div className="planner-row planner-marks">
        <span />
        <span className="planner-track">{marks.map((m) => <span key={m.n} className="planner-mark small muted" style={{ left: `${pct(m.n)}%` }}>{m.label}</span>)}</span>
      </div>
      {lines.map(({ g, h }, i) => {
        const pid = who(i);
        const person = data.people.find((p) => p.id === pid);
        const f = pid ? fit.get(`${i}|${pid}`) : undefined;
        const firstOfGroup = many && (i === 0 || lines[i - 1].g !== g);
        const label = `Pilot ${i + 1}${many ? ` (${g.key || "any"})` : ""}`;
        return (
          <div key={i}>
            {firstOfGroup && <div className="planner-group-head small"><b>{g.key || "Any pilot"}</b> · {plural(g.pilots, "pilot")}</div>}
            <div className="planner-row">
              <span className="planner-name">
                {season ? (
                  <select aria-label={label} value={pid} onChange={(e) => setPicked((x) => ({ ...x, [i]: e.target.value }))}>
                    <option value="">{label}: leave open</option>
                    {data.people.filter((p) => fits(p, g) || p.id === pid).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                ) : <b>{label}</b>}
                {season && f && f.bad > 0 && <span className="small warn-text">Can't take {plural(f.bad, "hitch", "hitches")} ({f.why}): Book gives {f.bad === 1 ? "it" : "them"} to someone who can</span>}
                {season && pid && twice.has(pid) && <span className="small warn-text">On two lines</span>}
              </span>
              <span className="planner-track">
                {h.map(([a, b]) => (
                  <span key={a}>
                    {travel > 0 && <span className="planner-bar travel" style={{ left: `${pct(a - travel)}%`, width: `${pct(a) - pct(a - travel)}%` }} />}
                    <span className="planner-bar" style={{ left: `${pct(a)}%`, width: `${pct(b) - pct(a)}%`, ...(season ? slotStyle(missionLook(season)) : {}) }}
                      title={`${person?.name ?? label}: ${format(at(a), "MMM d")} to ${format(at(b) - 1, "MMM d")} (${plural(b - a, "day")})`} />
                    {travel > 0 && <span className="planner-bar travel" style={{ left: `${pct(b)}%`, width: `${pct(b + travel) - pct(b)}%` }} />}
                  </span>
                ))}
              </span>
            </div>
          </div>
        );
      })}
      {travel > 0 && <div className="legend"><span><span className="swatch planner-bar-swatch" />On the job</span><span><span className="swatch planner-bar-swatch travel" />Travelling</span></div>}
      <div className="planner-book">
        {season ? (
          <>
            <button className="btn primary" disabled={!matches || twice.size > 0} onClick={book}><CalendarCheck size={16} /> Book on “{season.name}”</button>
            <span className="small muted">
              {!matches ? "The dates differ from the job's: put them back to book it."
                : twice.size ? "Someone is on two lines."
                : `Sets it to ${plural(plan.seats, "pilot")} at a time${hasPilots ? " and replaces its pilot shifts" : ""}${travel ? "; travel days aren't booked" : ""}. Undo puts it back.`}
            </span>
          </>
        ) : <span className="small muted">Start from a job to book this plan with real pilots.</span>}
      </div>
    </div>
  );
}

/**
 * The coming jobs together: each one's pilots (planned on its own rules) counted for its whole run, added
 * up day by day per type, against the pilots rated on that type. Pilots free after one job can take a later one.
 */
function SeveralJobs() {
  const { data } = useStore();
  const [first, setFirst] = useState(() => ymd(dayAt(today(), 0)));
  const [last, setLast] = useState(() => ymd(dayAt(today(), 364)));
  const [left, setLeft] = useState<Set<string>>(new Set());
  const from = ms(dateToStart(first)), to = dayAt(from, Math.max(1, daysOf(first, last)));
  const base = useMemo(() => blank(data), [data]);
  const jobs = useMemo(() => bookings(data)
    .filter((b) => b.status !== "Cancelled" && ms(b.end) > from && ms(b.start) < to)
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((b) => {
      const form = fromSeason(data, b, base);
      const r = planCrew(inputOf(form, daysOf(form.first, form.last)));
      return { b, plan: r.ok ? r.plan : null, reason: r.ok ? "" : r.reason };
    }), [data, base, from, to]);
  const picked = jobs.filter((j) => !left.has(j.b.id) && j.plan);

  // Pilots tied up each day, by type, and the busiest stretch for each.
  const byType = useMemo(() => {
    const out = new Map<string, { peak: number; a: number; b: number }>();
    const keys = new Set(picked.flatMap((j) => j.plan!.groups.map((g) => g.type)));
    keys.add("*");
    for (const k of keys) {
      let peak = 0, a = from, b = from;
      for (let d = from; d < to; d = dayAt(d, 1)) {
        const n = picked.filter((j) => ms(j.b.start) <= d && d < ms(j.b.end)).reduce((t, j) => t + j.plan!.groups.filter((g) => k === "*" || g.type === k).reduce((u, g) => u + g.pilots, 0), 0);
        if (n > peak) { peak = n; a = d; b = dayAt(d, 1); }
        else if (n === peak && b === d) b = dayAt(d, 1);
      }
      out.set(k, { peak, a, b });
    }
    return out;
  }, [picked, from, to]);
  const pilots = data.people.filter((p) => p.role === "Pilot");
  const have = (type: string) => (type === "*" ? pilots.length : type ? pilots.filter((p) => p.quals.includes(type)).length : pilots.length);
  const toggle = (id: string) => setLeft((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });

  return (
    <>
      <p className="muted" style={{ marginTop: -8 }}>
        Can your pilots cover the coming jobs together? Each job's pilots are worked out on its own rules and counted for its whole run; pilots free after one job can take a later one. Untick a job to see it without.
      </p>
      <div className="panel" style={{ marginBottom: 12 }}>
        <DateRange first={first} last={last} onChange={(f, l) => { setFirst(f); setLast(l); }} labels={["From", "To"]} />
      </div>
      <div className="tiles">
        {[...byType].sort((x, y) => (x[0] === "*" ? -1 : y[0] === "*" ? 1 : x[0].localeCompare(y[0]))).map(([k, v]) => {
          const n = have(k);
          return (
            <div key={k} className="tile">
              <div className="label">{k === "*" ? "All pilots at once" : k || "Any type"}</div>
              <div className={`value ${v.peak > n ? "danger" : "ok"}`}>{v.peak} <span className="small muted">of {n}</span></div>
              <div className="small muted">{v.peak ? `Busiest ${fmtDates(toWhen(v.a), toWhen(v.b))}` : "Nothing booked"}{v.peak > n ? ` · ${plural(v.peak - n, "pilot")} short` : ""}</div>
            </div>
          );
        })}
      </div>
      <p className="small muted">A pilot rated on several types counts toward each of them; the first tile counts everyone once.</p>
      <div className="panel planner-jobs">
        {jobs.map(({ b, plan, reason }) => (
          <label key={b.id} className="planner-job">
            <input type="checkbox" checked={!left.has(b.id)} disabled={!plan} onChange={() => toggle(b.id)} />
            <span className="swatch" style={slotStyle(missionLook(b))} />
            <span className="grow">
              <b>{b.name}</b>
              <span className="small muted" style={{ display: "block" }}>{fmtDates(b.start, b.end)} · {plan ? plan.groups.map((g) => `${g.key || "any"}: ${g.pilots}`).join(", ") : reason}</span>
            </span>
            {plan && <span className="pill accent">{plural(plan.pilots, "pilot")}</span>}
          </label>
        ))}
        {jobs.length === 0 && <span className="muted">No jobs in these dates.</span>}
      </div>
    </>
  );
}
