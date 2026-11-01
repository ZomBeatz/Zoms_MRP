import type { AppData } from "../types";
import type { Backend } from "./types";

/**
 * The secure server's backend: the team's plan on the server, behind sign-in.
 *
 * Every save says which version it started from, so two people saving at once can't overwrite each
 * other: the second is told someone else saved first. While nobody here is saving, the page checks
 * for newer versions every 20 seconds and shows them.
 */

export interface ServerUser {
  id: string;
  username: string;
  name: string;
  role: "admin" | "scheduler" | "viewer";
}

export interface ServerSession {
  user: ServerUser | null;
  needsSetup: boolean;
  name: string;
}

/** Calls to this server's API, as the signed-in person. */
export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const res = await fetch(path, {
    ...rest,
    credentials: "same-origin",
    headers: { "X-MRP": "1", ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...(rest.headers ?? {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const text = await res.text();
  const body = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
  if (!res.ok) {
    const e = new Error(body?.error ?? `The server answered ${res.status}.`) as Error & { status: number; body: unknown };
    e.status = res.status;
    e.body = body;
    throw e;
  }
  return body as T;
}

export const getSession = () => api<ServerSession>("/api/session");

/** Set when the page signs in (main.tsx), so the backend knows who's using it. */
let me: ServerUser | null = null;
export const setServerUser = (u: ServerUser | null) => (me = u);
export const serverUser = () => me;

let version = 0;
/** Something newer from someone else, for the store to show. */
let onNewer: ((data: unknown, by: string | null) => void) | null = null;
export const watchServer = (fn: (data: unknown, by: string | null) => void) => (onNewer = fn);

let busy = false;
let polling = false;
function poll() {
  if (polling) return;
  polling = true;
  setInterval(async () => {
    if (busy || document.hidden || !onNewer) return;
    try {
      const v = await api<{ version: number; updatedBy: string | null }>("/api/plan/version");
      if (v.version > version && !busy) {
        const p = await api<{ version: number; data: unknown; updatedBy: string | null }>("/api/plan");
        if (busy) return;
        version = p.version;
        onNewer?.(p.data, p.updatedBy);
      }
    } catch { /* offline for a moment; try again next time */ }
  }, 20_000);
}

export function serverBackend(): Backend {
  return {
    kind: "server",
    canEdit: !!me && me.role !== "viewer",
    async load() {
      const p = await api<{ version: number; data: unknown }>("/api/plan");
      version = p.version;
      poll();
      return p.data;
    },
    async save(data: AppData) {
      busy = true;
      try {
        const r = await api<{ version: number }>("/api/plan", { method: "PUT", json: { version, data } });
        version = r.version;
      } catch (e) {
        const status = (e as { status?: number }).status;
        if (status === 409) throw new Error("Someone else saved changes a moment ago, so this change wasn't saved. Reload to see theirs, then make yours again.");
        if (status === 401) throw new Error("You've been signed out, so this change wasn't saved. Reload to sign in again.");
        if (status === 403) throw new Error("You can look but not change things. Ask an admin for scheduler access.");
        if (status === undefined) throw new Error("Couldn't reach the server, so this change wasn't saved. Check the connection and try again.");
        throw e;
      } finally {
        busy = false;
      }
    },
  };
}
