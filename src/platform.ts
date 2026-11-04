/**
 * Which build of Zom's MRP this is. The online demo (GitHub Pages) is built with VITE_DEMO=1: it always
 * shows the demo data, kept in the visitor's own browser, and points to the downloads.
 */
export const isOnlineDemo = import.meta.env.VITE_DEMO === "1";

/** Demo data, and the lessons and tours that run on it. For now only the online demo has them; the app opens empty. */
export const withDemo = isOnlineDemo;

/** Where people get the real thing: installers and the server, from the latest release. */
export const RELEASES_URL = "https://github.com/ZomBeatz/Zoms_MRP/releases/latest";

/** Inside the desktop app (Tauri adds its bridge to the window). */
export const isDesktopApp = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** The web version served by the secure server, built with VITE_SERVER=1. */
export const isServerBuild = import.meta.env.VITE_SERVER === "1";
