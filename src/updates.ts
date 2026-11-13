import { create } from "zustand";
import type { Update } from "@tauri-apps/plugin-updater";
import { isDesktopApp } from "./platform";
import { allSaved } from "./store";

/**
 * Updates for the desktop app. A release built with the updater key checks the latest published GitHub
 * release when it opens and every few hours while it stays open: it downloads a new version in the background (unless that's switched off) and
 * installs it when someone presses Restart, so it never closes the app in the middle of something.
 * Just before installing, the plan is copied to backups/before-<version>.json. A .deb or .rpm install
 * belongs to the package manager, so those get a link to the release instead. Drafts are never offered:
 * only a release you've published is "latest".
 */

/** "auto": downloads and installs. "download": offers the release page. "off": this build doesn't update. */
export type UpdateMode = "auto" | "download" | "off";

type Status = "idle" | "checking" | "none" | "available" | "downloading" | "ready" | "installing" | "error";

interface UpdateState {
  mode: UpdateMode;
  status: Status;
  /** The new version, when there is one. */
  version: string | null;
  /** Downloaded so far, 0 to 1, while downloading. */
  progress: number;
  error: string | null;
  /** What the error happened in: a check (often just offline), or downloading or installing a version that's out. */
  failed: "check" | "download" | "install" | null;
  checkedAt: number | null;
}

export const WHATS_NEW_URL = "https://docs.zombeatzmedia.com/mrp/whats-new";
const DAY = 86_400_000;
/** How often to look for a new version: on opening if it's been this long, and again while the app is open. */
const CHECK_EVERY = 6 * 3_600_000;
const AUTO_KEY = "zoms-mrp:updates:auto";
const LAST_KEY = "zoms-mrp:updates:last";
const LATER_KEY = "zoms-mrp:updates:later";

// Browser storage holds this device's choices; without it, updates just behave as they do by default.
const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* only a convenience */ } };

export const useUpdates = create<UpdateState>(() => ({ mode: "off", status: "idle", version: null, progress: 0, error: null, failed: null, checkedAt: Number(read(LAST_KEY)) || null }));
const set = (s: Partial<UpdateState>) => useUpdates.setState(s);

/** Download new versions in the background (on unless switched off in Settings). */
export const autoDownload = () => read(AUTO_KEY) !== "off";
export const setAutoDownload = (on: boolean) => write(AUTO_KEY, on ? "on" : "off");

/** "Later" on the note hides it for this version for a few days. */
export const laterFor = (version: string) => {
  const [v, at] = (read(LATER_KEY) ?? "").split("|");
  return v === version && Date.now() - Number(at) < 3 * DAY;
};
export const putOff = (version: string) => { write(LATER_KEY, `${version}|${Date.now()}`); set({}); };

let found: Update | null = null;

async function invoke<T>(cmd: string, args?: Record<string, unknown>) {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

let started = false;

/**
 * When the app opens: find out what this build can do, then check now and every few hours after, so an
 * app that's left open for days still hears about a new version.
 */
export async function startUpdates() {
  if (!isDesktopApp || started) return;
  started = true;
  const mode = await invoke<UpdateMode>("update_mode").catch((): UpdateMode => "off");
  set({ mode });
  if (mode === "off") return;
  const due = () => Date.now() - (Number(read(LAST_KEY)) || 0) > CHECK_EVERY;
  // Looked every hour, so a computer that slept through a check catches up soon after it wakes.
  setInterval(() => { if (due()) void checkForUpdate(); }, 3_600_000);
  if (due()) await checkForUpdate();
}

/** Ask GitHub for the latest published release. `asked`: someone pressed Check for updates. */
export async function checkForUpdate(asked = false) {
  const { mode, status } = useUpdates.getState();
  if (mode === "off" || status === "checking" || status === "downloading" || status === "installing") return;
  if (status === "ready" && !asked) return;
  set({ status: "checking", error: null, failed: null });
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    found = await check();
    const now = Date.now();
    write(LAST_KEY, String(now));
    if (!found) return set({ status: "none", version: null, checkedAt: now });
    set({ status: "available", version: found.version, checkedAt: now });
    if (mode === "auto" && autoDownload()) await downloadUpdate();
  } catch (e) {
    // Offline or GitHub unreachable: Settings shows why, and it tries again within the hour. Only a
    // check someone asked for turns into an error on the spot.
    set({ status: asked ? "error" : "idle", error: message(e), failed: "check" });
  }
}

/** Download the new version in the background; it's installed on Restart. */
export async function downloadUpdate() {
  if (!found) return;
  set({ status: "downloading", progress: 0 });
  let total = 0, got = 0;
  try {
    await found.download((e) => {
      if (e.event === "Started") total = e.data.contentLength ?? 0;
      else if (e.event === "Progress") { got += e.data.chunkLength; if (total) set({ progress: got / total }); }
    });
    set({ status: "ready", progress: 1 });
  } catch (e) {
    set({ status: "error", error: message(e), failed: "download" });
  }
}

/**
 * Install and start the new version: everything saved first, a copy of the plan kept, then the update.
 * On Windows the installer closes the app itself and opens the new one.
 */
export async function installUpdate() {
  if (!found) return;
  const { status, version } = useUpdates.getState();
  set({ status: "installing", error: null });
  try {
    await allSaved();
    await invoke("backup_before_update", { version: version ?? "" });
    if (status === "ready") await found.install();
    else await found.downloadAndInstall();
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  } catch (e) {
    set({ status: "error", error: message(e), failed: "install" });
  }
}

const message = (e: unknown) => {
  const text = e instanceof Error ? e.message : typeof e === "string" ? e : "Something went wrong.";
  // The latest release has no latest.json (built without the update files): not the network's fault.
  if (/release json|valid release|404|not found/i.test(text))
    return "The latest release doesn't have update files yet, so there's nothing to install from here. Download it from the releases page, or wait for the next release.";
  if (/signature|verify/i.test(text))
    return "The download didn't match the release's signature, so it wasn't installed. Download this version from the releases page instead.";
  if (/network|connect|dns|timed out|offline|request/i.test(text)) return "Couldn't reach GitHub. Check the internet connection and try again.";
  return text;
};
