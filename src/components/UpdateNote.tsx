import { Download, ExternalLink, RefreshCw } from "lucide-react";
import { RELEASES_URL } from "../platform";
import { WHATS_NEW_URL, installUpdate, laterFor, putOff, useUpdates } from "../updates";

/**
 * The line across the top when a new version is out (desktop app only). Downloaded already: Restart
 * installs it. A .deb or .rpm: a link to the release. "Later" puts it off for a few days.
 */
export function UpdateNote() {
  const { mode, status, version, progress } = useUpdates();
  if (mode === "off" || !version || laterFor(version)) return null;
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
