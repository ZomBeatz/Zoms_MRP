import type { AppData } from "../types";

/**
 * Where Zom's MRP keeps its data. The whole app saves one document through one of these:
 * the browser's storage (the web version and the online demo), a file on this computer (the desktop
 * app), or the secure server (the web version for a team). The rest of the app doesn't know which.
 *
 * The demo always stays in the browser (`browserBackend`), whatever the backend, so trying it never
 * touches anyone's real data.
 */
export interface Backend {
  kind: "browser" | "desktop" | "server";
  /** The saved document, as stored (it goes through `migrate`), or null when nothing is saved yet. */
  load(): Promise<unknown | null>;
  /**
   * Store the whole document. Saves are sent one at a time, newest last. Reject with an Error whose
   * message says what happened and what to do; it's shown at the top of the app.
   */
  save(data: AppData): Promise<void>;
  /** False for someone who may only look (a Viewer on the server): the app hides editing. */
  canEdit: boolean;
}
