import { browserBackend } from "./browser";
import type { Backend } from "./types";
import { isDesktopApp, isServerBuild } from "../platform";

export type { Backend };

/** The demo's own place, always in this browser. */
export const demoBackend = () => browserBackend("zoms-mrp:demo");

/**
 * Where the person's own data lives in this build. The desktop app and the server each bring their
 * backend in their own file (loaded only in that build), so the web version stays small.
 */
export async function ownBackend(): Promise<Backend> {
  if (isDesktopApp) return (await import("./desktop")).desktopBackend();
  if (isServerBuild) return (await import("./server")).serverBackend();
  return browserBackend("zoms-mrp:data");
}
