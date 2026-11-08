import { useEffect, useRef, useState } from "react";
import { ClipboardCheck, Coins, Download, Plus, SlidersHorizontal, FileSpreadsheet, FlaskConical, FolderOpen, Keyboard, Palette, Trash2, ShieldCheck, Upload, Info, Database } from "lucide-react";
import { useStore } from "../store";
import { Dialog, Field, NumberInput } from "../components/ui";
import type { ImportPlan } from "../importer";
import { migrate, restoredSettings } from "../migrate";
import { UpdateSettings } from "./UpdateSettings";
import { downloadWorkbook } from "../excel";
import { dataFolder, openDataFolder, saveFile, showInFolder } from "../files";
import { isDesktopApp, isOnlineDemo, isServerBuild, withDemo } from "../platform";
import { serverUser } from "../backends/server";
import { DEMO_KEY } from "../backends";
import { ServerSettings } from "./ServerSettings";
import { ExcelCopySettings } from "./ExcelCopySettings";
import { FlightLimitsEditor } from "./Planner";
import { uid } from "../time";
import { SWATCHES, reshade, shadesOf } from "../look";
import { unpackFiles } from "../docs";
import { backupFolder, saveBackup } from "../backup";
import { BackupPlace } from "./BackupPlace";
import { SHORTCUTS } from "./Guide";

export function SettingsPage({ onHelp }: { onHelp: () => void }) {
  const { data, demo, updateSettings, setDemo, resetDemo, removeDemo, change, clearAll, showToast } = useStore();
  const { theme, rules } = data.settings;
  const mx = data.settings.maintenance;
  const sd = data.settings.seasonDefaults ?? { pilots: 1, maintainers: 0, pilotRotation: null, dutyHours: null };
  const fileRef = useRef<HTMLInputElement>(null);
  const [sureDemo, setSureDemo] = useState(false);
  const [clearing, setClearing] = useState(false);
  // Importing: the file picker, and the plan to preview before anything changes.
  const importRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState<{ name: string; plan: ImportPlan } | null>(null);
  const startImport = async (f: File) => {
    try {
      const { planImport, readFile } = await import("../importer");
      setImporting({ name: f.name, plan: planImport(data, await readFile(f)) });
    } catch {
      showToast("Couldn't read that file. Use the template, saved as .xlsx or .csv.");
    }
  };
  const template = async () => {
    const { buildTemplate } = await import("../importer");
    const where = await saveFile("zoms-mrp-import-template.xlsx", await buildTemplate());
    showToast(where ? "Template saved to Downloads." : "Template made. Look in your downloads.", where ? { label: "Show", run: () => showInFolder(where) } : undefined);
  };
  // The desktop app's data folder, shown with a button to open it.
  const [folder, setFolder] = useState<string | null>(null);
  useEffect(() => {
    if (isDesktopApp) dataFolder().then(setFolder, () => setFolder(null));
  }, []);
  const hasDemo = demo || (() => {
    try {
      return !!localStorage.getItem(DEMO_KEY);
    } catch {
      return false;
    }
  })();

  // A backup is the plan with its attached files inside, so one file brings back everything. Where it goes
  // is this device's choice (Backups, below).
  const backup = async () => {
    try {
      const { where, files } = await saveBackup(data, demo);
      if (where === "cancelled") return;
      const what = `Backup saved${files ? `, with ${files === 1 ? "1 attached file" : `${files} attached files`}` : ""}`;
      if (where === "picked") showToast(what);
      else showToast(where ? `${what} in ${backupFolder() ? "the backup folder" : "Downloads"}` : `${what} to Downloads`, where ? { label: "Show", run: () => showInFolder(where) } : undefined);
    } catch (e) {
      showToast(`Couldn't save the backup: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  const restore = async (f: File) => {
    try {
      const raw = JSON.parse(await f.text());
      if (!Array.isArray(raw.missions) || !Array.isArray(raw.aircraft)) throw new Error();
      if (raw.files && typeof raw.files === "object") await unpackFiles(demo, raw.files).catch(() => showToast("Some attached files couldn't be put back (not enough room on this device)."));
      delete raw.files;
      const d = migrate(raw); // backups from older versions open too
      change(() => ({ ...d, settings: restoredSettings(data.settings, d.settings) }), `Restored “${f.name}”`);
    } catch {
      showToast("That file isn't a Zom's MRP backup.");
    }
  };

  return (
    <>
      <div className="page-head"><h1>Settings</h1></div>
      {importing && <ImportDialog name={importing.name} plan={importing.plan} onClose={() => setImporting(null)}
        onImport={() => { change(() => importing.plan.data, `Imported ${importing.name}`); setImporting(null); }} />}
      {clearing && <ClearAllDialog onBackup={backup} onClose={() => setClearing(false)} onClear={() => { clearAll(); setClearing(false); }} />}
      <div style={{ maxWidth: 720, display: "flex", flexDirection: "column", gap: 14 }}>
        {isServerBuild && <ServerSettings />}
        <section className="panel">
          <h3><Palette size={16} /> Appearance</h3>
          <div className="seg">
            {(["system", "light", "dark"] as const).map((t) => (
              <button key={t} className={theme === t ? "active" : ""} onClick={() => updateSettings({ theme: t })}>
                {t === "system" ? "Match my computer" : t === "light" ? "Light" : "Dark"}
              </button>
            ))}
          </div>
        </section>

        <section className="panel">
          <h3><SlidersHorizontal size={16} /> Preferences</h3>
          <div className="form-grid">
            <div className="field">
              <span>Week starts on</span>
              <div className="seg">
                {([[1, "Monday"], [0, "Sunday"]] as const).map(([v, l]) => <button key={v} className={(data.settings.weekStart ?? 1) === v ? "active" : ""} onClick={() => updateSettings({ weekStart: v })}>{l}</button>)}
              </div>
            </div>
            <Field label="Currency symbol" hint="Before amounts in cost per job.">
              <input value={data.settings.currencySymbol ?? "$"} maxLength={4} style={{ width: 80 }} onChange={(e) => updateSettings({ currencySymbol: e.target.value })} />
            </Field>
          </div>
          <div className="field" style={{ marginTop: 12 }}>
            <span>Pages in the menu</span>
            <div className="picker-row">
              {([["aircraft", "Fleet"], ["types", "Types & equipment"], ["schedule", "Schedule"], ["missions", "Clients"], ["people", "Crew"], ["maintenance", "Maintenance"], ["training", "Qualifications"], ["balance", "Balance"], ["planner", "Crew planner"], ["reports", "Reports"]] as const).map(([pg, label]) => {
                const hidden = (data.settings.hiddenPages ?? []).includes(pg);
                return (
                  <label key={pg} className={`chip pick ${hidden ? "" : "on"}`}>
                    <input type="checkbox" checked={!hidden} onChange={() => updateSettings({ hiddenPages: hidden ? (data.settings.hiddenPages ?? []).filter((x) => x !== pg) : [...(data.settings.hiddenPages ?? []), pg] })} />
                    {label}
                  </label>
                );
              })}
            </div>
            <span className="hint">Untick pages you don't use to keep the menu short. Inspections has its own switch below.</span>
          </div>
          <div className="field" style={{ marginTop: 12 }}>
            <span>New jobs start with</span>
            <span className="rotation">
              <NumberInput min={0} max={8} aria-label="Pilots at a time" value={sd.pilots} onChange={(pilots) => updateSettings({ seasonDefaults: { ...sd, pilots } })} /> pilots,
              <NumberInput min={0} max={8} aria-label="Maintainers at a time" value={sd.maintainers} onChange={(maintainers) => updateSettings({ seasonDefaults: { ...sd, maintainers } })} /> maintainers,
              rotation <NumberInput min={0} max={90} aria-label="Days on" value={sd.pilotRotation?.on ?? 0} onChange={(on) => updateSettings({ seasonDefaults: { ...sd, pilotRotation: on ? { on, off: sd.pilotRotation?.off ?? 7 } : null } })} /> on
              <NumberInput min={0} max={90} aria-label="Days off" value={sd.pilotRotation?.off ?? 0} onChange={(off) => updateSettings({ seasonDefaults: { ...sd, pilotRotation: sd.pilotRotation ? { ...sd.pilotRotation, off } : null } })} /> off
            </span>
            <span className="hint">For a client's first job; later jobs start from the one before. Rotation 0 on: the hitch rules below.</span>
          </div>
        </section>

        {/* The online demo is only the demo; there's no own data to switch to. */}
        {withDemo && !isOnlineDemo && (
          <section className="panel">
            <h3><FlaskConical size={16} /> Demo data</h3>
            <label className="check">
              <input type="checkbox" checked={demo} onChange={(e) => setDemo(e.target.checked)} />
              Show demo data
            </label>
            <p className="small muted" style={{ margin: "6px 0 0" }}>
              Fills Zom's MRP with made-up aircraft, crew, qualifications and clients so you can see how it works. Your own data is kept apart and comes back when you turn this off. <b>Remove demo data</b> takes the demo off this device without touching your own.
            </p>
            {hasDemo && (
              <div className="row gap wrap" style={{ marginTop: 10 }}>
                {demo && <button className="btn sm" onClick={() => resetDemo()}>Reset demo</button>}
                {sureDemo
                  ? <button className="btn sm danger" autoFocus onBlur={() => setSureDemo(false)} onClick={() => { setSureDemo(false); void removeDemo(); }}><Trash2 size={14} /> Remove demo for good?</button>
                  : <button className="btn sm" onClick={() => setSureDemo(true)}><Trash2 size={14} /> Remove demo data</button>}
              </div>
            )}
          </section>
        )}

        <section className="panel">
          <h3><ShieldCheck size={16} /> Hitches and days off</h3>
          <p className="small muted" style={{ marginTop: 0 }}>Zom's MRP warns you when someone goes over these. Assignments with fewer days off between them count as one hitch.</p>
          <div className="form-grid">
            <Field label="Most days on in a row" hint="Jobs, on call and maintenance all count.">
              <NumberInput min={1} max={365} value={rules.maxDaysOn} onChange={(maxDaysOn) => updateSettings({ rules: { ...rules, maxDaysOn } })} />
            </Field>
            <Field label="Fewest days off between hitches">
              <NumberInput min={0} max={90} value={rules.minDaysOff} onChange={(minDaysOff) => updateSettings({ rules: { ...rules, minDaysOff } })} />
            </Field>
            <Field label="Most hours on duty in a day" hint="A job's duty day is set on it. 0 = don't check.">
              <NumberInput min={0} max={24} value={data.settings.maxDutyHours} onChange={(maxDutyHours) => updateSettings({ maxDutyHours })} />
            </Field>
            <Field label="Rest between duty days" hint="Hours off before the next duty day. A job whose duty day leaves less is flagged. 0 = don't check.">
              <NumberInput min={0} max={23} value={data.settings.minRestHours} onChange={(minRestHours) => updateSettings({ minRestHours })} />
            </Field>
            <Field label="Most flight hours" full hint="Per pilot, in any stretch of that many days, such as 100 in 30 and 1,000 in 365. A job's flying is shared by its pilots, or the hours flown typed on a shift. The checks, Fill and the Crew planner keep under all of them.">
              <FlightLimitsEditor value={data.settings.flightLimits} onChange={(flightLimits) => updateSettings({ flightLimits })} />
            </Field>
            <Field label="Current on a type" hint="Pilots must have flown it within this many days. 0 = don't check.">
              <NumberInput min={0} max={730} value={data.settings.currencyDays} onChange={(currencyDays) => updateSettings({ currencyDays })} />
            </Field>
            <Field label="Warn before a qualification runs out" hint="Days ahead.">
              <NumberInput min={0} max={365} value={data.settings.expiryWarningDays} onChange={(expiryWarningDays) => updateSettings({ expiryWarningDays })} />
            </Field>
          </div>
        </section>

        <section className="panel">
          <h3><Palette size={16} /> Lines of business</h3>
          <p className="small muted" style={{ marginTop: 0 }}>Lines of business, like fire, medevac or utilities, each with a color. A client of that type gets its own shade of it, so related clients look alike on the schedule. Changing a color reshades its clients.</p>
          {data.workTypes.map((t) => {
            const n = data.missions.filter((m) => m.workTypeId === t.id).length;
            return (
              <div key={t.id} className="row gap-sm" style={{ marginBottom: 8 }}>
                <input type="color" aria-label={`Color for ${t.name || "this line of business"}`} value={t.color}
                  onChange={(e) => { const color = e.target.value; change((d) => ({ ...d, workTypes: d.workTypes.map((x) => (x.id === t.id ? { ...x, color } : x)), missions: reshade(d.missions, t.id, color) })); }} />
                <input value={t.name} placeholder="Fire" style={{ width: 200 }} onChange={(e) => change((d) => ({ ...d, workTypes: d.workTypes.map((x) => (x.id === t.id ? { ...x, name: e.target.value } : x)) }))} />
                <span className="row gap-sm">{shadesOf(t.color, 6).map((c) => <span key={c} className="swatch" style={{ background: c, width: 14, height: 14 }} />)}</span>
                <span className="small muted">{n === 1 ? "1 client" : `${n} clients`}</span>
                <button className="icon-btn danger" aria-label={`Remove ${t.name}`} onClick={() => change((d) => ({ ...d, workTypes: d.workTypes.filter((x) => x.id !== t.id), missions: d.missions.map((m) => (m.workTypeId === t.id ? { ...m, workTypeId: null } : m)) }), `Removed ${t.name || "the line of business"}; its clients keep their colors`)}><Trash2 size={15} /></button>
              </div>
            );
          })}
          <button className="btn sm" onClick={() => change((d) => ({ ...d, workTypes: [...d.workTypes, { id: uid(), name: "", color: SWATCHES[d.workTypes.length % 10] }] }))}><Plus size={14} /> Add a line of business</button>
        </section>

        <section className="panel">
          <h3><ShieldCheck size={16} /> Schedule limitations</h3>
          <p className="small muted" style={{ marginTop: 0 }}>Different limits for different work, such as EMS and fire. A client that picks one uses its days on and off instead of the ones above (its own limits can still be stricter).</p>
          {(data.settings.ruleSets ?? []).map((r) => {
            const setRule = (patch: Partial<typeof r>) => updateSettings({ ruleSets: data.settings.ruleSets.map((x) => (x.id === r.id ? { ...x, ...patch } : x)) });
            const used = data.missions.filter((m) => m.ruleSetId === r.id).length;
            return (
              <div key={r.id} className="rule-set">
                <input aria-label="Name" value={r.name} placeholder="EMS" onChange={(e) => setRule({ name: e.target.value })} />
                <span className="rotation">
                  <NumberInput min={1} max={365} aria-label={`${r.name}: most days on`} value={r.maxDaysOn} onChange={(maxDaysOn) => setRule({ maxDaysOn })} /> days on,
                  <NumberInput min={0} max={180} aria-label={`${r.name}: fewest days off`} value={r.minDaysOff} onChange={(minDaysOff) => setRule({ minDaysOff })} /> off
                </span>
                <span className="small muted">{used ? `${used} ${used === 1 ? "mission" : "missions"}` : "Not used"}</span>
                <button className="icon-btn" aria-label={`Remove ${r.name || "this kind"}`} title={used ? "Its clients go back to the limits above" : undefined}
                  onClick={() => change((d) => ({ ...d, settings: { ...d.settings, ruleSets: d.settings.ruleSets.filter((x) => x.id !== r.id) }, missions: d.missions.map((m) => (m.ruleSetId === r.id ? { ...m, ruleSetId: null } : m)) }), `Removed “${r.name}”`)}>
                  <Trash2 size={15} />
                </button>
              </div>
            );
          })}
          <button className="btn sm" onClick={() => updateSettings({ ruleSets: [...(data.settings.ruleSets ?? []), { id: uid(), name: (data.settings.ruleSets ?? []).length ? "" : "EMS", ...rules }] })}><Plus size={14} /> Add a set of schedule limitations</button>
        </section>

        <section className="panel">
          <h3><Coins size={16} /> Costs</h3>
          <label className="check">
            <input type="checkbox" checked={!!data.settings.costs} onChange={(e) => updateSettings({ costs: e.target.checked })} />
            Show costs and charges
          </label>
          <p className="small muted" style={{ margin: "6px 0 0" }}>Day rates on crew, cost per flight hour on aircraft, a charge per day on clients, and cost and margin in Reports and the Crew planner. Off: they're hidden, and anything already typed in is kept.</p>
        </section>

        <section className="panel">
          <h3><ClipboardCheck size={16} /> Maintenance programs</h3>
          <label className="check">
            <input type="checkbox" checked={mx.enabled} onChange={(e) => updateSettings({ maintenance: { ...mx, enabled: e.target.checked } })} />
            Track flight hours and inspections here
          </label>
          <p className="small muted" style={{ margin: "6px 0 0" }}>Each aircraft type's inspections (every so many hours or months), when each tail is due, and its flight hours, on the Inspections page. Off: the Inspections page, flight hours on aircraft and due inspections are hidden, and anything already typed in is kept.</p>
          {mx.enabled && (
            <>
              <label className="check" style={{ marginTop: 10 }}>
                <input type="checkbox" checked={mx.autoPlan} onChange={(e) => updateSettings({ maintenance: { ...mx, autoPlan: e.target.checked } })} />
                Plan inspections automatically
              </label>
              <p className="small muted" style={{ margin: "4px 0 0" }}>When the app opens, inspections overdue or due soon are booked in their tail's best free days before they're due. You still pick who does them.</p>
              <div className="form-grid" style={{ marginTop: 10 }}>
                <Field label="Flight hours on a job day" hint="An aircraft can have its own on its form.">
                  <NumberInput min={1} max={24} value={mx.hoursPerDay} onChange={(hoursPerDay) => updateSettings({ maintenance: { ...mx, hoursPerDay } })} />
                </Field>
                <Field label="Due soon" hint="Days ahead.">
                  <NumberInput min={1} max={365} value={mx.dueSoonDays} onChange={(dueSoonDays) => updateSettings({ maintenance: { ...mx, dueSoonDays } })} />
                </Field>
              </div>
            </>
          )}
        </section>

        <section className="panel">
          <h3><Database size={16} /> {isServerBuild && !demo ? "The plan" : "Your data"}</h3>
          <p className="small muted" style={{ marginTop: 0 }}>
            {demo
              ? "The demo is saved in this browser, apart from everything else."
              : isServerBuild
                ? "The team's plan is on the server, which keeps a copy every day. You can also save one here."
                : isDesktopApp
                  ? "Everything is saved on this computer. Save a backup now and then; it holds attached files too."
                  : "Everything is saved on this computer, in this browser. Save a backup now and then; it holds attached files too."}
          </p>
          {isDesktopApp && !demo && folder && (
            <p className="small muted" style={{ marginTop: 0, wordBreak: "break-all" }}>Saved in <code>{folder}</code></p>
          )}
          <div className="row gap wrap">
            {isDesktopApp && !demo && (
              <button className="btn" onClick={() => openDataFolder().catch(() => showToast("Couldn't open the folder."))}><FolderOpen size={14} /> Open folder</button>
            )}
            <button className="btn" onClick={backup}><Download size={14} /> Save a backup</button>
            {(!isServerBuild || demo || serverUser()?.role !== "viewer") && (
              <>
                <button className="btn" onClick={() => importRef.current?.click()}><Upload size={14} /> Import from Excel or CSV…</button>
                <input ref={importRef} type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden
                  onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) startImport(f); }} />
                <button className="btn" onClick={template}><FileSpreadsheet size={14} /> Download the import template</button>
              </>
            )}
            <button className="btn" onClick={() => downloadWorkbook(data).then((where) => showToast("Saved to Downloads. Post it in a Teams channel to share it.", where ? { label: "Show", run: () => showInFolder(where) } : undefined), () => showToast("Couldn't make the Excel file. Try again."))}>
              <FileSpreadsheet size={14} /> Export to Excel
            </button>
            {/* On the server these replace the whole team's plan, so only admins get them. */}
            {(!isServerBuild || demo || serverUser()?.role === "admin") && (
              <>
                <button className="btn" onClick={() => fileRef.current?.click()}><Upload size={14} /> Restore a backup…</button>
                <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) restore(f); }} />
                <button className="btn danger" onClick={() => setClearing(true)}>Clear all {demo ? "demo " : ""}data…</button>
              </>
            )}
          </div>
        </section>

        {!demo && !isServerBuild && <BackupPlace onBackup={backup} />}

        {isDesktopApp && <ExcelCopySettings />}

        <section className="panel kbd-hint">
          <h3><Keyboard size={16} /> Shortcuts</h3>
          <table className="table" style={{ boxShadow: "none" }}>
            <tbody>{SHORTCUTS.map(([k, d]) => <tr key={k} style={{ cursor: "default" }}><td style={{ width: 160 }}><kbd>{k}</kbd></td><td>{d}</td></tr>)}</tbody>
          </table>
          <button className="btn sm" style={{ marginTop: 8 }} onClick={onHelp}>Open the guide</button>
        </section>

        <section className="panel">
          <h3><Info size={16} /> About</h3>
          <p style={{ margin: "0 0 10px" }}>Zom's MRP (Mission Ready Planner) {__APP_VERSION__}, by ZomBeatz Media. MIT license.</p>
          {isDesktopApp && <UpdateSettings />}
          <a className="btn sm" href="mailto:info@zombeatzmedia.com?subject=Zom's%20MRP%20feedback">Send feedback</a>
        </section>
      </div>
    </>
  );
}

/**
 * Clearing everything is the one change that's hard to come back from (Undo only lasts until the app
 * closes), so it says what goes, offers a backup first, and needs the word DELETE typed.
 */
function ClearAllDialog({ onBackup, onClose, onClear }: { onBackup: () => void; onClose: () => void; onClear: () => void }) {
  const { data, demo } = useStore();
  const [typed, setTyped] = useState("");
  const ready = typed.trim().toUpperCase() === "DELETE";
  const counts: [number, string, string][] = [
    [data.aircraft.length, "aircraft", "aircraft"], [data.people.length, "person", "people"], [data.missions.length, "mission", "missions"],
    [data.seasons.length, "season", "seasons"], [data.shifts.length, "shift", "shifts"], [data.jobs.length, "work order", "work orders"],
    [data.trainings.length, "qualification", "qualifications"], [data.timeOff.length, "time-off entry", "time-off entries"],
  ];
  const what = counts.filter(([n]) => n > 0).map(([n, one, many]) => `${n} ${n === 1 ? one : many}`).join(", ");
  return (
    <Dialog title={`Delete all ${demo ? "demo " : ""}data?`} onClose={onClose}
      foot={<>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn danger solid" disabled={!ready} onClick={onClear}>Delete everything</button>
      </>}>
      <div className="clear-warning">
        <p style={{ marginTop: 0 }}>
          <b>This deletes {what || "everything"}.</b>{" "}
          {isServerBuild && !demo ? "It's the whole team's plan: everyone signed in loses it too." : "Your settings stay."}
        </p>
        <p>Save a backup first if there's any chance you'll want it back. <b>Undo</b> works only until the app is closed.</p>
        <button className="btn" onClick={onBackup}><Download size={14} /> Save a backup first</button>
        <Field label="Type DELETE to confirm" full>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="DELETE" aria-label="Type DELETE to confirm" />
        </Field>
      </div>
    </Dialog>
  );
}

/** What an import will add and update, and the rows it couldn't use, before anything changes. */
function ImportDialog({ name, plan, onClose, onImport }: { name: string; plan: ImportPlan; onClose: () => void; onImport: () => void }) {
  const { added, updated, skipped } = plan;
  const parts = (o: Record<string, number>, words: Record<string, [string, string]>) =>
    Object.entries(o).filter(([, n]) => n).map(([k, n]) => `${n} ${n === 1 ? words[k][0] : words[k][1]}`).join(", ");
  const words = { people: ["person", "people"], aircraft: ["aircraft", "aircraft"], courses: ["qualification", "qualifications"], records: ["qualification record", "qualification records"] } as Record<string, [string, string]>;
  const adds = parts(added, words), updates = parts(updated, words);
  const nothing = !adds && !updates;
  return (
    <Dialog title={`Import ${name}`} onClose={onClose}
      foot={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={nothing} onClick={onImport}>Import</button></>}>
      {nothing ? <p style={{ marginTop: 0 }}>Nothing to import. Check the sheets have the template's headings and a row under them.</p> : (
        <>
          {adds && <p style={{ marginTop: 0 }}><b>Adds</b> {adds}.</p>}
          {updates && <p><b>Updates</b> {updates} already here (matched by name, or tail number).</p>}
          <p className="small muted">Undo works right after, from the message.</p>
        </>
      )}
      {skipped.length > 0 && (
        <>
          <h4 className="form-section">Couldn't use {skipped.length === 1 ? "1 row" : `${skipped.length} rows`}</h4>
          <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{skipped.slice(0, 20).map((x, i) => <li key={i}>{x}</li>)}</ul>
        </>
      )}
    </Dialog>
  );
}
