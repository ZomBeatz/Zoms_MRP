/**
 * Which build of Zom's MRP this is. The online demo (GitHub Pages) is built with VITE_DEMO=1: it always
 * shows the demo data, kept in the visitor's own browser, and points to the downloads.
 */
export const isOnlineDemo = import.meta.env.VITE_DEMO === "1";

/** Where people get the real thing: installers and the server, from the latest release. */
export const RELEASES_URL = "https://github.com/ZomBeatz/Zoms-MRP/releases/latest";
