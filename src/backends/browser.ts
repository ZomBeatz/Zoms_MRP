import type { AppData } from "../types";
import type { Backend } from "./types";

/** The browser's own storage on this device: the web version, and the demo in every version. */
export function browserBackend(key: string): Backend {
  return {
    kind: "browser",
    canEdit: true,
    async load() {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    },
    async save(data: AppData) {
      try {
        localStorage.setItem(key, JSON.stringify(data));
      } catch {
        throw new Error("Couldn't save on this device. The browser's storage may be full or turned off.");
      }
    },
  };
}
