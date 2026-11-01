import { useRef } from "react";
import { Download, FlaskConical, Keyboard, Palette, ShieldCheck, Upload, Info, Database } from "lucide-react";
import { format } from "date-fns";
import { useStore } from "../store";
import { Field } from "../components/ui";
import { migrate } from "../migrate";
import { SHORTCUTS } from "./Help";

export function SettingsPage({ onHelp }: { onHelp: () => void }) {
  const { data, demo, updateSettings, setDemo, resetDemo, change, clearAll, showToast } = useStore();
  const { theme, rules } = data.settings;
  const fileRef = useRef<HTMLInputElement>(null);

  const backup = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `zoms-mrp-backup-${format(new Date(), "yyyy-MM-dd")}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Saved to Downloads");
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
          <h3><FlaskConical size={16} /> Demo data</h3>
          <label className="check">
            <input type="checkbox" checked={demo} onChange={(e) => setDemo(e.target.checked)} />
            Show demo data
          </label>
          <p className="small muted" style={{ margin: "6px 0 0" }}>
            Fills Zom's MRP with made-up aircraft, crew, training and missions so you can see how it works. Your own data is kept apart and comes back when you turn this off.
          </p>
          {demo && <button className="btn sm" style={{ marginTop: 10 }} onClick={resetDemo}>Reset demo</button>}
        </section>

        <section className="panel">
          <h3><ShieldCheck size={16} /> Hitches and days off</h3>
          <p className="small muted" style={{ marginTop: 0 }}>Zom's MRP warns you when someone goes over these. Assignments with fewer days off between them count as one hitch.</p>
          <div className="form-grid">
            <Field label="Most days on in a row" hint="Missions, on call and maintenance all count.">
              <input type="number" min={1} max={365} value={rules.maxDaysOn} onChange={(e) => updateSettings({ rules: { ...rules, maxDaysOn: Math.max(1, Number(e.target.value) || 1) } })} />
            </Field>
            <Field label="Fewest days off between hitches">
              <input type="number" min={0} max={90} value={rules.minDaysOff} onChange={(e) => updateSettings({ rules: { ...rules, minDaysOff: Math.max(0, Number(e.target.value)) } })} />
            </Field>
            <Field label="Warn before training runs out" hint="Days ahead.">
              <input type="number" min={0} max={365} value={data.settings.expiryWarningDays} onChange={(e) => updateSettings({ expiryWarningDays: Math.max(0, Number(e.target.value)) })} />
            </Field>
          </div>
        </section>

        <section className="panel">
          <h3><Database size={16} /> Your data</h3>
          <p className="small muted" style={{ marginTop: 0 }}>Everything is saved on this computer, in this browser. Save a backup now and then.</p>
          <div className="row gap wrap">
            <button className="btn" onClick={backup}><Download size={14} /> Save a backup</button>
            <button className="btn" onClick={() => fileRef.current?.click()}><Upload size={14} /> Restore a backup…</button>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && restore(e.target.files[0])} />
            <button className="btn danger" onClick={() => clearAll()}>Clear all {demo ? "demo " : ""}data</button>
          </div>
        </section>

        <section className="panel kbd-hint">
          <h3><Keyboard size={16} /> Shortcuts</h3>
          <table className="table" style={{ boxShadow: "none" }}>
            <tbody>{SHORTCUTS.map(([k, d]) => <tr key={k} style={{ cursor: "default" }}><td style={{ width: 160 }}><kbd>{k}</kbd></td><td>{d}</td></tr>)}</tbody>
          </table>
          <button className="btn sm" style={{ marginTop: 8 }} onClick={onHelp}>Open help</button>
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
