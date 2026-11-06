import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { RELEASES_URL } from "../platform";
import { autoDownload, checkForUpdate, installUpdate, setAutoDownload, useUpdates } from "../updates";

/** Settings › About in the desktop app: check for a new version, and whether to download them by itself. */
export function UpdateSettings() {
  const { mode, status, version, error, checkedAt } = useUpdates();
  const [auto, setAuto] = useState(autoDownload());
  if (mode === "off")
    return <p className="small muted" style={{ margin: "0 0 10px" }}>This copy doesn't update itself. New versions are on the <a href={RELEASES_URL} target="_blank" rel="noreferrer">releases page</a>.</p>;
  const when = checkedAt ? new Date(checkedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : null;
  return (
    <div style={{ margin: "0 0 12px" }}>
      <div className="row gap-sm wrap">
        <button className="btn sm" disabled={status === "checking" || status === "downloading" || status === "installing"} onClick={() => void checkForUpdate(true)}>
          <RefreshCw size={14} /> {status === "checking" ? "Checking…" : "Check for updates"}
        </button>
        {status === "ready" && mode === "auto" && <button className="btn sm primary" onClick={() => void installUpdate()}>Restart to update to {version}</button>}
        {status === "available" && mode === "auto" && <button className="btn sm primary" onClick={() => void installUpdate()}>Update to {version} and restart</button>}
        {status === "available" && mode === "download" && <a className="btn sm primary" href={RELEASES_URL} target="_blank" rel="noreferrer">Download {version}</a>}
      </div>
      <p className="small muted" style={{ margin: "6px 0 0" }}>
        {status === "none" ? "You have the latest version."
          : status === "error" ? `Couldn't check: ${error}. Try again when you're online.`
          : status === "downloading" ? `Downloading ${version}…`
          : status === "installing" ? `Installing ${version}…`
          : version ? `Version ${version} is out.`
          : "Zom's MRP looks for a new version once a day."}
        {when && status !== "checking" ? ` Last checked ${when}.` : ""}
      </p>
      {mode === "auto" && (
        <label className="check small" style={{ marginTop: 8 }}>
          <input type="checkbox" checked={auto} onChange={(e) => { setAutoDownload(e.target.checked); setAuto(e.target.checked); }} />
          Download new versions by themselves (they install when you restart)
        </label>
      )}
      {mode === "download" && <p className="small muted" style={{ margin: "6px 0 0" }}>Installed from a .deb or .rpm, so new versions come from the releases page or your package manager.</p>}
    </div>
  );
}
