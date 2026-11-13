import { Download, ExternalLink, RefreshCw } from "lucide-react";
import { RELEASES_URL } from "../platform";
import { WHATS_NEW_URL, checkForUpdate, installUpdate, laterFor, putOff, useUpdates } from "../updates";

/**
 * The line across the top when a new version is out (desktop app only). Downloaded already: Restart
 * installs it. A .deb or .rpm: a link to the release. "Later" puts it off for a few days. When a new
 * version didn't download or install, it says why, with Try again and the release to download by hand.
 */
export function UpdateNote() {
  const { mode, status, version, progress, error, failed } = useUpdates();
  if (mode === "off" || !version || laterFor(version)) return null;
  if (status === "error" && (failed === "download" || failed === "install")) return (
    <div className="banner update-banner" role="alert">
      <RefreshCw size={15} />
      <span className="grow"><b>Zom's MRP {version}</b> didn't {failed}. {error}</span>
      <button className="btn sm" onClick={() => void checkForUpdate(true)}>Try again</button>
      <a className="btn sm primary" href={RELEASES_URL} target="_blank" rel="noreferrer"><Download size={14} /> Download</a>
      <button className="btn sm ghost" onClick={() => putOff(version)}>Later</button>
    </div>
  );
  if (!["available", "downloading", "ready", "installing"].includes(status)) return null;
  return (
    <div className="banner update-banner" role="status">
      <RefreshCw size={15} />
      <span className="grow">
        <b>Zom's MRP {version}</b>{" "}
        {status === "ready" ? "is ready. Restarting installs it; your plan stays as it is."
          : status === "downloading" ? `is downloading${progress ? ` (${Math.round(progress * 100)}%)` : ""}.`
          : status === "installing" ? "is installing…"
          : "is out."}
      </span>
      <a className="btn sm ghost" href={WHATS_NEW_URL} target="_blank" rel="noreferrer"><ExternalLink size={14} /> What's new</a>
      {mode === "download" ? (
        <a className="btn sm primary" href={RELEASES_URL} target="_blank" rel="noreferrer"><Download size={14} /> Download</a>
      ) : status === "ready" || status === "available" ? (
        <button className="btn sm primary" onClick={() => void installUpdate()}>{status === "ready" ? "Restart now" : "Update and restart"}</button>
      ) : null}
      {status !== "installing" && <button className="btn sm ghost" onClick={() => putOff(version)}>Later</button>}
    </div>
  );
}
