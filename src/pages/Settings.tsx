import { useRef, useState } from "react";
import { Download, FileSpreadsheet, FlaskConical, Keyboard, Palette, Trash2, ShieldCheck, Upload, Info, Database } from "lucide-react";
import { format } from "date-fns";
import { useStore } from "../store";
import { Field, NumberInput } from "../components/ui";
import { migrate } from "../migrate";
import { downloadWorkbook } from "../excel";
import { saveFile, showInFolder } from "../files";
import { isDesktopApp, isOnlineDemo, isServerBuild } from "../platform";
import { serverUser } from "../backends/server";
import { DEMO_KEY } from "../backends";
import { ServerSettings } from "./ServerSettings";
import { ExcelCopySettings } from "./ExcelCopySettings";
import { SHORTCUTS } from "./Guide";

export function SettingsPage({ onHelp }: { onHelp: () => void }) {
  const { data, demo, updateSettings, setDemo, resetDemo, removeDemo, change, clearAll, showToast } = useStore();
  const { theme, rules } = data.settings;
  const fileRef = useRef<HTMLInputElement>(null);
  const [sureDemo, setSureDemo] = useState(false);
  const hasDemo = demo || (() => {
    try {
      return !!localStorage.getItem(DEMO_KEY);
    } catch {
      return false;
    }
  })();

  const backup = async () => {
    const where = await saveFile(`zoms-mrp-backup-${format(new Date(), "yyyy-MM-dd")}.json`, new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    showToast("Saved to Downloads", where ? { label: "Show", run: () => showInFolder(where) } : undefined);
  };
  const restore = async (f: File) => {
    try {
      const raw = JSON.parse(await f.text());
      if (!Array.isArray(raw.missions) || !Array.isArray(raw.aircraft)) throw new Error();
      const d = migrate(raw); // backups from older versions open too
      change(() => ({ ...d, settings: data.settings }), `Restored “${f.name}”`);
    } catch {
      showToast("That file isn't a Zom's MRP backup.");
    }
  };

  return (
    <>
      <div className="page-head"><h1>Settings</h1></div>
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

        {/* The online demo is only the demo; there's no own data to switch to. */}
        {!isOnlineDemo && (
          <section className="panel">
            <h3><FlaskConical size={16} /> Demo data</h3>
            <label className="check">
              <input type="checkbox" checked={demo} onChange={(e) => setDemo(e.target.checked)} />
              Show demo data
            </label>
            <p className="small muted" style={{ margin: "6px 0 0" }}>
              Fills Zom's MRP with made-up aircraft, crew, training and missions so you can see how it works. Your own data is kept apart and comes back when you turn this off. <b>Remove demo data</b> takes the demo off this device without touching your own.
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
            <Field label="Most days on in a row" hint="Missions, on call and maintenance all count.">
              <NumberInput min={1} max={365} value={rules.maxDaysOn} onChange={(maxDaysOn) => updateSettings({ rules: { ...rules, maxDaysOn } })} />
            </Field>
            <Field label="Fewest days off between hitches">
              <NumberInput min={0} max={90} value={rules.minDaysOff} onChange={(minDaysOff) => updateSettings({ rules: { ...rules, minDaysOff } })} />
            </Field>
            <Field label="Warn before training runs out" hint="Days ahead.">
              <NumberInput min={0} max={365} value={data.settings.expiryWarningDays} onChange={(expiryWarningDays) => updateSettings({ expiryWarningDays })} />
            </Field>
          </div>
        </section>

        <section className="panel">
          <h3><Database size={16} /> {isServerBuild && !demo ? "The plan" : "Your data"}</h3>
          <p className="small muted" style={{ marginTop: 0 }}>
            {demo
              ? "The demo is saved in this browser, apart from everything else."
              : isServerBuild
                ? "The team's plan is on the server, which keeps a copy every day. You can also save one here."
                : isDesktopApp
                  ? "Everything is saved on this computer. Save a backup now and then."
                  : "Everything is saved on this computer, in this browser. Save a backup now and then."}
          </p>
          <div className="row gap wrap">
            <button className="btn" onClick={backup}><Download size={14} /> Save a backup</button>
            <button className="btn" onClick={() => downloadWorkbook(data).then((where) => showToast("Saved to Downloads. Post it in a Teams channel to share it.", where ? { label: "Show", run: () => showInFolder(where) } : undefined), () => showToast("Couldn't make the Excel file. Try again."))}>
              <FileSpreadsheet size={14} /> Export to Excel
            </button>
            {/* On the server these replace the whole team's plan, so only admins get them. */}
            {(!isServerBuild || demo || serverUser()?.role === "admin") && (
              <>
                <button className="btn" onClick={() => fileRef.current?.click()}><Upload size={14} /> Restore a backup…</button>
                <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) restore(f); }} />
                <button className="btn danger" onClick={() => clearAll()}>Clear all {demo ? "demo " : ""}data</button>
              </>
            )}
          </div>
        </section>

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
          <a className="btn sm" href="mailto:info@zombeatzmedia.com?subject=Zom's%20MRP%20feedback">Send feedback</a>
        </section>
      </div>
    </>
  );
}
