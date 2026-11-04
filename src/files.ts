import { isDesktopApp } from "./platform";

/**
 * Hand a file to the person: the browser's download, or in the desktop app a file in the
 * Downloads folder (a desktop window can't download like a browser). Returns where it went,
 * when we know.
 */
export async function saveFile(name: string, blob: Blob): Promise<string | null> {
  if (isDesktopApp) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<string>("save_download", new Uint8Array(await blob.arrayBuffer()), { headers: { "x-name": name } });
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return null;
}

/** In the desktop app, open the folder a saved file is in. */
export async function showInFolder(path: string) {
  const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
  await revealItemInDir(path);
}

/** In the desktop app, where the plan file and its daily copies are kept. */
export async function dataFolder(): Promise<string> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string>("data_folder");
}

/** Show the plan file in Finder or Explorer (or just open its folder if there's no file yet). */
export async function openDataFolder() {
  const dir = await dataFolder();
  const opener = await import("@tauri-apps/plugin-opener");
  const sep = dir.includes("\\") ? "\\" : "/";
  try {
    await opener.revealItemInDir(`${dir}${sep}mrp.json`);
  } catch {
    await opener.openPath(dir);
  }
}
