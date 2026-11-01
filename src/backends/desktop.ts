import { invoke } from "@tauri-apps/api/core";
import type { AppData } from "../types";
import type { Backend } from "./types";

/**
 * The desktop app's backend: the plan in a file in the app's data folder on this computer
 * (written safely, with a copy kept each day). See src-tauri/src/lib.rs.
 */
export function desktopBackend(): Backend {
  return {
    kind: "desktop",
    canEdit: true,
    async load() {
      const text = await invoke<string | null>("load_plan");
      return text ? JSON.parse(text) : null;
    },
    async save(data: AppData) {
      try {
        await invoke("save_plan", { data: JSON.stringify(data) });
      } catch (e) {
        throw new Error(`Couldn't save on this computer (${String(e)}). Check there's free space, then try again.`);
      }
    },
  };
}
