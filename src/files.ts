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
