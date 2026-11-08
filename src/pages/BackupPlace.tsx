import { useState } from "react";
import { Archive, Download, FolderOpen } from "lucide-react";
import { backupDaily, backupFolder, browserAsksWhere, lastBackup, setBackupDaily, setBackupFolder } from "../backup";
import { isDesktopApp } from "../platform";
import { showInFolder } from "../files";
import { format } from "date-fns";

/**
 * Where this device keeps backups. The desktop app: a folder you pick (a synced OneDrive or Teams folder,
 * a USB drive, a network share) or Downloads, and a backup there every day if you like. The web version:
 * Chrome and Edge ask where to save each time; other browsers save to Downloads.
 */
export function BackupPlace({ onBackup }: { onBackup: () => void }) {
  const [folder, setFolder] = useState(backupFolder());
  const [daily, setDaily] = useState(backupDaily());
  const last = lastBackup();
  const choose = async () => {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const picked = await open({ directory: true, title: "Pick the folder for backups" });
    if (typeof picked === "string") {
      setBackupFolder(picked);
      setFolder(picked);
    }
  };
  return (
    <section className="panel">
      <h3><Archive size={16} /> Backups</h3>
      <p className="small muted" style={{ marginTop: 0 }}>
        A backup is one file with the whole plan and its attached files (client documents, certificate scans). Restore it on this device or another.
      </p>
      {isDesktopApp ? (
        <>
          <p style={{ margin: "0 0 4px" }}>{folder ? <>Backups go in <code style={{ wordBreak: "break-all" }}>{folder}</code></> : <>Backups go in <b>Downloads</b>.</>}</p>
          <p className="small muted" style={{ margin: "0 0 10px" }}>
            Pick a folder that's copied somewhere else, like a OneDrive or Teams folder synced to this computer, a USB drive or a network share, so a backup survives if this computer doesn't.
          </p>
          <div className="row gap wrap">
            <button className="btn" onClick={choose}><FolderOpen size={14} /> {folder ? "Choose another folder…" : "Choose a folder…"}</button>
            {folder && <button className="btn" onClick={() => void showInFolder(folder)}>Show it</button>}
            {folder && <button className="btn ghost" onClick={() => { setBackupFolder(null); setFolder(null); setBackupDaily(false); setDaily(false); }}>Use Downloads</button>}
            <button className="btn" onClick={onBackup}><Download size={14} /> Save a backup now</button>
          </div>
          {folder && (
            <label className="check" style={{ marginTop: 10 }}>
              <input type="checkbox" checked={daily} onChange={(e) => { setBackupDaily(e.target.checked); setDaily(e.target.checked); }} />
              Save a backup there every day the app is open
            </label>
          )}
          {folder && daily && <p className="small muted" style={{ margin: "4px 0 0" }}>One file a day, named by its date; today's is replaced if you save again. Delete old ones when you like.{last ? ` Last one: ${format(new Date(`${last}T00:00`), "MMM d, yyyy")}.` : ""}</p>}
        </>
      ) : (
        <>
          <p className="small muted" style={{ margin: "0 0 10px" }}>
            {browserAsksWhere()
              ? "Your browser asks where to save each backup, so you can put it in a synced folder or on a USB drive."
              : "Your browser saves backups to Downloads; move them somewhere safe. (Chrome and Edge can ask where to save.) The desktop app can save them to a folder you pick, every day."}
          </p>
          <button className="btn" onClick={onBackup}><Download size={14} /> Save a backup now</button>
        </>
      )}
    </section>
  );
}
