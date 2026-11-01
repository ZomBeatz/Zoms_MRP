import type { Backend } from "./types";
import { browserBackend } from "./browser";

/**
 * The secure server's backend: the team's document on the server, behind sign-in.
 * Until the server exists, it keeps data in this browser.
 */
export function serverBackend(): Backend {
  return { ...browserBackend("zoms-mrp:data"), kind: "server" };
}
