import { useState } from "react";
import { format } from "date-fns";
import { ClipboardCheck, Plus, Trash2 } from "lucide-react";
import { useStore } from "../store";
import { dueList, flightHours, hoursPerDay, planFor, type Due } from "../program";
import { dayAt, ms, toWhen, today, uid } from "../time";
import { Empty, NumberInput, usePref } from "../components/ui";
import { DateInput } from "../components/dates";
import type { ProgramItem } from "../types";

/**
 * Maintenance programs: each aircraft type's inspections (every so many flight hours and/or months),
 * when each tail is due, and its flight hours. Plan it books the inspection in the tail's best free
 * stretch before it's due. Settings › Maintenance programs turns all of this off, or plans on its own.
 */

const STATE = {
  overdue: { label: "Overdue", tone: "danger" },
  soon: { label: "Due soon", tone: "warn" },
  planned: { label: "Planned", tone: "ok" },
  ok: { label: "OK", tone: "" },
  unknown: { label: "No record", tone: "accent" },
} as const;

export function Inspections() {
  const data = useStore((s) => s.data);
  const [tab, setTab] = usePref<"due" | "programs" | "hours">("inspections-tab", "due");
  const due = dueList(data);
  const types = [...new Set(data.aircraft.filter((a) => a.status !== "Retired").map((a) => a.type))].sort();

  return (
    <>
      <div className="page-head">
        <h1>Inspections</h1>
        <div className="seg">
          {([["due", "Due"], ["programs", "Programs"], ["hours", "Flight hours"]] as const).map(([k, l]) => (
            <button key={k} className={tab === k ? "active" : ""} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>
      </div>
      {!data.aircraft.length ? (
        <Empty icon={<ClipboardCheck size={28} />} text="Add aircraft on the Fleet page first; then set each type's inspections here." />
      ) : tab === "due" ? (
        !data.programs.length ? (
          <Empty icon={<ClipboardCheck size={28} />} text="Set up each aircraft type's inspections from its maintenance manual, and when each tail is due shows here."
            action={<button className="btn primary" onClick={() => setTab("programs")}>Set up programs</button>} />
        ) : (
          <>
            <p className="muted" style={{ marginTop: -8 }}>Every tail's inspections from its type's program: when it was last done, when it's due next (by flight hours or months, whichever comes first) and whether it's planned.</p>
            <div className="issues">
              {due.map((d) => <DueRow key={`${d.aircraft.id}-${d.item.id}`} d={d} />)}
            </div>
          </>
        )
      ) : tab === "programs" ? (
        <>
          <p className="muted" style={{ marginTop: -8 }}>Each type's inspections, from its maintenance manual. A job on the tail with the same name counts as doing it.</p>
          {types.map((t) => <ProgramFor key={t} type={t} />)}
        </>
      ) : (
        <>
          <p className="muted" style={{ marginTop: -8 }}>
            Type a tail's hours when you have them (from the hour meter or the logbook). Between readings, Zom's MRP adds its job days × its hours per flying day.
          </p>
          <div className="issues">
            {data.aircraft.filter((a) => a.status !== "Retired").map((a) => <HoursRow key={a.id} id={a.id} />)}
          </div>
        </>
      )}
    </>
  );
}

function DueRow({ d }: { d: Due }) {
  const { data, open } = useStore();
  const s = STATE[d.state];
  const when = d.at !== null ? format(d.at, "MMM d, yyyy") : null;
  /** A finished job dated today, to start counting from when there's no record. */
  const record = () => open("job", "new", {
    aircraftId: d.aircraft.id, title: d.item.title, kind: "Inspection", grounds: d.item.grounds, done: true,
    start: toWhen(dayAt(today(), -d.item.days)), end: toWhen(today()), notes: "When it was last done, so the program can count from it.",
  }, { spot: "dates" });
  return (
    <div className={`issue-card row-card due-${d.state}`}>
      <div className="issue">
        <span className="grow">
          <b><span className="mono">{d.aircraft.tail}</span> · {d.item.title}</b>
          <div className="small muted">
            {d.last ? `Last done ${format(ms(d.last.end) - 1, "MMM d, yyyy")}` : "No record of it yet"}
            {when && ` · due ${when}${d.by === "hours" && d.hoursDue !== null ? ` at about ${Math.round(d.hoursDue)} h` : ""}`}
            {d.hoursNow !== null && ` · about ${Math.round(d.hoursNow)} h now`}
            {d.planned && ` · planned ${format(ms(d.planned.start), "MMM d")}${d.at !== null && ms(d.planned.start) > d.at ? ", after it's due" : ""}`}
          </div>
        </span>
        <span className={`pill ${s.tone}`}>{s.label}</span>
      </div>
      {d.planned ? <button className="btn sm" onClick={() => open("job", d.planned!.id)}>Open the job</button>
        : d.state === "unknown" ? <button className="btn sm" onClick={record}>Record last done…</button>
        : <button className={`btn sm ${d.state === "overdue" || d.state === "soon" ? "primary" : ""}`} onClick={() => open("job", "new", { ...planFor(data, d) }, { spot: "maintainers" })}>Plan it…</button>}
    </div>
  );
}

function ProgramFor({ type }: { type: string }) {
  const { data, change } = useStore();
  const items = data.programs.filter((p) => p.type === type);
  const tails = data.aircraft.filter((a) => a.type === type && a.status !== "Retired").map((a) => a.tail);
  const save = (item: ProgramItem) => change((d) => ({ ...d, programs: d.programs.some((p) => p.id === item.id) ? d.programs.map((p) => (p.id === item.id ? item : p)) : [...d.programs, item] }));
  const add = () => save({ id: uid(), type, title: items.length ? "Inspection" : "100 hour inspection", everyHours: 100, everyMonths: null, days: 1, grounds: true });
  return (
    <section className="panel program">
      <h3>{type} <span className="small muted">{tails.join(", ")}</span></h3>
      {items.length === 0 && <p className="small muted" style={{ marginTop: 0 }}>No inspections set for the {type} yet.</p>}
      {items.map((p) => (
        <div key={p.id} className="program-item">
          <input className="program-title" value={p.title} aria-label="Inspection" onChange={(e) => save({ ...p, title: e.target.value })} />
          <span className="rotation">
            Every <input type="number" min={0} aria-label="Flight hours" value={p.everyHours ?? ""} placeholder="–" onChange={(e) => save({ ...p, everyHours: e.target.value ? Math.max(1, Number(e.target.value)) : null })} /> hours
            or <input type="number" min={0} aria-label="Months" value={p.everyMonths ?? ""} placeholder="–" onChange={(e) => save({ ...p, everyMonths: e.target.value ? Math.max(1, Number(e.target.value)) : null })} /> months,
            takes <NumberInput min={1} max={90} aria-label="Days it takes" value={p.days} onChange={(days) => save({ ...p, days })} /> days
          </span>
          <label className="check"><input type="checkbox" checked={p.grounds} onChange={(e) => save({ ...p, grounds: e.target.checked })} /> Grounds it</label>
          <button className="icon-btn danger" aria-label={`Remove ${p.title}`} onClick={() => change((d) => ({ ...d, programs: d.programs.filter((x) => x.id !== p.id) }), `Removed “${p.title}” from the ${type} program`)}><Trash2 size={15} /></button>
        </div>
      ))}
      <button className="btn sm" onClick={add}><Plus size={14} /> Add an inspection</button>
      <p className="hint" style={{ marginBottom: 0 }}>Leave hours or months empty if it's only one of them. Whichever comes first makes it due.</p>
    </section>
  );
}

function HoursRow({ id }: { id: string }) {
  const { data, change, showToast } = useStore();
  const a = data.aircraft.find((x) => x.id === id)!;
  const [hours, setHours] = useState("");
  const [on, setOn] = useState(() => format(today(), "yyyy-MM-dd"));
  const now = flightHours(data, a, today().getTime());
  const save = () => {
    const h = Number(hours);
    if (!hours || !(h >= 0)) return showToast("Type the hours first, like 4812.5.");
    change((d) => ({ ...d, aircraft: d.aircraft.map((x) => (x.id === id ? { ...x, hours: { hours: h, on } } : x)) }), `${a.tail}: ${h} hours on ${on}`);
    setHours("");
  };
  return (
    <div className="issue-card hours-row">
      <div className="issue">
        <span className="grow">
          <b className="mono">{a.tail}</b> <span className="small muted">{a.type}</span>
          <div className="small muted">
            {a.hours ? `${a.hours.hours} h on ${format(ms(`${a.hours.on}T00:00`), "MMM d, yyyy")}` : "No reading yet"}
            {now !== null && a.hours && ` · about ${now} h now`} · {hoursPerDay(data, a)} h a flying day
          </div>
        </span>
      </div>
      <div className="hours-entry">
        <input type="number" inputMode="decimal" step="0.1" min={0} value={hours} placeholder="Hours" aria-label={`${a.tail} flight hours`} onChange={(e) => setHours(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} />
        <DateInput value={on} onChange={setOn} today ariaLabel="Reading date" />
        <button className="btn sm primary" onClick={save}>Save</button>
      </div>
    </div>
  );
}
