import type { Backend } from "./types";
import { browserBackend } from "./browser";

/**
 * The desktop app's backend: a file in the app's data folder on this computer.
 * Until the desktop app exists, it keeps data in the browser storage of its window.
 */
export function desktopBackend(): Backend {
  return { ...browserBackend("zoms-mrp:data"), kind: "desktop" };
}
