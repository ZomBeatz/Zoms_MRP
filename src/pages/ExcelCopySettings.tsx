import { useEffect, useState } from "react";
import { FileSpreadsheet, FolderOpen, RefreshCw } from "lucide-react";
import { copyStatus, EXCEL_COPY_NAME, excelFolder, onCopyStatus, setExcelFolder, writeExcelCopy, type CopyStatus } from "../excelCopy";
import { showInFolder } from "../files";

/** Settings in the desktop app: keep an Excel copy in a folder, for Teams. */
export function ExcelCopySettings() {
  const [folder, setFolder] = useState(excelFolder());
  const [status, setStatus] = useState<CopyStatus>(copyStatus());
  useEffect(() => onCopyStatus(setStatus), []);

  const choose = async () => {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const picked = await open({ directory: true, title: "Pick the folder for the Excel copy" });
    if (typeof picked === "string") {
      setExcelFolder(picked);
      setFolder(picked);
    }
  };
  const path = folder ? folder.replace(/[\\/]+$/, "") + (folder.includes("\\") ? "\\" : "/") + EXCEL_COPY_NAME : null;

  return (
    <section className="panel">
      <h3><FileSpreadsheet size={16} /> Excel copy for Teams</h3>
      <p className="small muted" style={{ marginTop: 0 }}>
        Zom's MRP can keep an up-to-date Excel copy of the plan in a folder. Pick a Teams channel's folder that OneDrive syncs to this
        computer (in Teams, open the channel's <b>Files</b> and choose <b>Sync</b>), and the team always has the latest plan in Teams.
        It's rewritten a few seconds after each change. The demo is never copied.
      </p>
      {folder ? (
        <>
          <p style={{ margin: "0 0 4px" }}><code>{path}</code></p>
          <p className="small muted" style={{ margin: "0 0 10px" }}>
            {status.error ? <span style={{ color: "var(--zb-danger)" }}>Couldn't write it: {status.error}</span>
              : status.at ? `Written at ${new Date(status.at).toLocaleTimeString(undefined, { timeStyle: "short" })}.` : "Written after the next change."}
          </p>
          <div className="row gap wrap">
            <button className="btn" onClick={() => void writeExcelCopy()}><RefreshCw size={14} /> Write it now</button>
            {path && <button className="btn" onClick={() => void showInFolder(path)}><FolderOpen size={14} /> Show it</button>}
            <button className="btn" onClick={choose}>Choose another folder…</button>
            <button className="btn ghost" onClick={() => { setExcelFolder(null); setFolder(null); }}>Stop keeping a copy</button>
          </div>
        </>
      ) : (
        <button className="btn" onClick={choose}><FolderOpen size={14} /> Choose a folder…</button>
      )}
    </section>
  );
}
