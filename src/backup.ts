import { format } from "date-fns";
import type { AppData } from "./types";
import { isDesktopApp } from "./platform";
import { listedFiles, packFiles } from "./docs";
import { saveFile } from "./files";

/**
 * Backups: the plan and its attached files in one .json file. Where they go is this device's choice (it
 * doesn't travel with the plan): in the desktop app a folder picked in Settings, maybe a synced OneDrive or
 * a USB drive, with an optional backup there every day; otherwise Downloads. In browsers that can (Chrome,
 * Edge) the web version asks where to save each time.
 */

const FOLDER = "zoms-mrp:backup-folder";
const DAILY = "zoms-mrp:backup-daily";
const LAST = "zoms-mrp:backup-last";

const get = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const put = (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* a convenience */ } };

export const backupFolder = () => (isDesktopApp ? get(FOLDER) : null);
export const setBackupFolder = (path: string | null) => put(FOLDER, path);
export const backupDaily = () => !!backupFolder() && get(DAILY) === "1";
export const setBackupDaily = (on: boolean) => put(DAILY, on ? "1" : null);
export const lastBackup = () => get(LAST);

export const backupName = (day = new Date()) => `zoms-mrp-backup-${format(day, "yyyy-MM-dd")}.json`;
const join = (folder: string, name: string) => folder.replace(/[\\/]+$/, "") + (folder.includes("\\") ? "\\" : "/") + name;

/** The backup file: the plan with its attached files inside. */
export async function makeBackup(data: AppData, demo: boolean): Promise<{ blob: Blob; files: number }> {
  const files = await packFiles(demo, listedFiles(data)).catch(() => ({}));
  return { blob: new Blob([JSON.stringify({ ...data, files }, null, 2)], { type: "application/json" }), files: Object.keys(files).length };
}

/** Where the browser's save dialog is, when it has one (Chrome, Edge). */
type Picker = (o: { suggestedName: string; types: { description: string; accept: Record<string, string[]> }[] }) => Promise<{ createWritable: () => Promise<{ write: (b: Blob) => Promise<void>; close: () => Promise<void> }> }>;
const picker = () => (typeof window !== "undefined" ? (window as unknown as { showSaveFilePicker?: Picker }).showSaveFilePicker : undefined);
export const browserAsksWhere = () => !isDesktopApp && !!picker();

/**
 * Save a backup where this device keeps them. Returns the path (desktop), "picked" (the browser saved it
 * where the person chose), null (Downloads), or "cancelled".
 */
export async function saveBackup(data: AppData, demo: boolean): Promise<{ where: string | null | "picked" | "cancelled"; files: number }> {
  const { blob, files } = await makeBackup(data, demo);
  const name = backupName();
  const folder = backupFolder();
  if (folder && !demo) {
    const { invoke } = await import("@tauri-apps/api/core");
    const where = await invoke<string>("write_backup", new Uint8Array(await blob.arrayBuffer()), { headers: { "x-path": join(folder, name) } });
    put(LAST, format(new Date(), "yyyy-MM-dd"));
    return { where, files };
  }
  const pick = picker();
  if (!isDesktopApp && pick) {
    try {
      const handle = await pick({ suggestedName: name, types: [{ description: "Zom's MRP backup", accept: { "application/json": [".json"] } }] });
      const w = await handle.createWritable();
      await w.write(blob);
      await w.close();
      return { where: "picked", files };
    } catch (e) {
      if ((e as { name?: string }).name === "AbortError") return { where: "cancelled", files };
      // Anything else (a browser that blocks it): fall back to Downloads.
    }
  }
  return { where: await saveFile(name, blob), files };
}

/** Desktop app, as it opens: a backup in the chosen folder once a day, if that's turned on. */
export async function dailyBackup(data: AppData, demo: boolean): Promise<string | null> {
  if (demo || !backupDaily() || lastBackup() === format(new Date(), "yyyy-MM-dd")) return null;
  const { where } = await saveBackup(data, demo);
  return typeof where === "string" && where !== "picked" && where !== "cancelled" ? where : null;
}
