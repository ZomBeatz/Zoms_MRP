import { useStore } from "./store";
import { buildWorkbook } from "./excel";

/**
 * Desktop app only: keep an up-to-date Excel copy of the plan in a folder the person picks. Pointed
 * at a Teams channel's folder synced by OneDrive, the team always has the latest plan in Teams.
 * Written a few seconds after changes stop, never from the demo.
 */

const KEY = "zoms-mrp:excel-folder";
export const EXCEL_COPY_NAME = "Zom's MRP plan.xlsx";

export const excelFolder = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};

export interface CopyStatus { at: number | null; error: string | null }
let status: CopyStatus = { at: null, error: null };
const listeners = new Set<(s: CopyStatus) => void>();
export const copyStatus = () => status;
export const onCopyStatus = (fn: (s: CopyStatus) => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
const setStatus = (s: CopyStatus) => {
  status = s;
  listeners.forEach((fn) => fn(s));
};

const join = (folder: string, name: string) => folder.replace(/[\\/]+$/, "") + (folder.includes("\\") ? "\\" : "/") + name;

export async function writeExcelCopy() {
  const folder = excelFolder();
  const { data, demo } = useStore.getState();
  if (!folder || demo) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const blob = await buildWorkbook(data);
    await invoke("write_excel", new Uint8Array(await blob.arrayBuffer()), { headers: { "x-path": join(folder, EXCEL_COPY_NAME) } });
    setStatus({ at: Date.now(), error: null });
  } catch (e) {
    setStatus({ at: status.at, error: String(e) });
  }
}

export function setExcelFolder(folder: string | null) {
  try {
    if (folder) localStorage.setItem(KEY, folder);
    else localStorage.removeItem(KEY);
  } catch { /* only a convenience */ }
  setStatus({ at: null, error: null });
  if (folder) void writeExcelCopy();
}

let started = false;
let timer: ReturnType<typeof setTimeout> | undefined;
/** Rewrite the copy 5 seconds after the plan stops changing. */
export function startExcelCopy() {
  if (started) return;
  started = true;
  useStore.subscribe((s, prev) => {
    if (s.data === prev.data || s.demo || !excelFolder()) return;
    clearTimeout(timer);
    timer = setTimeout(() => void writeExcelCopy(), 5000);
  });
}
