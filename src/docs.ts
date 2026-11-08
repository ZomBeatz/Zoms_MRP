/**
 * Files attached to missions (contracts, task orders, maps). The plan only lists them (`Mission.documents`);
 * the files themselves are kept in the browser's file storage (IndexedDB) on this device, apart for the demo,
 * because the plan is one small document saved on every change. A backup (Settings) carries them; the server doesn't yet.
 */

const DB = (demo: boolean) => (demo ? "zoms-mrp-demo-files" : "zoms-mrp-files");
const STORE = "files";

function openDb(demo: boolean): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("This browser can't keep files."));
    const req = indexedDB.open(DB(demo), 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Couldn't open the file storage."));
  });
}

async function run<T>(demo: boolean, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb(demo);
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error ?? new Error("The file storage failed."));
      tx.onabort = () => reject(tx.error ?? new Error("There isn't room for this file on this device."));
    });
  } finally {
    db.close();
  }
}

/** Keep a file under `id`. */
export const putFile = (demo: boolean, id: string, file: Blob) => run(demo, "readwrite", (s) => s.put(file, id)).then(() => undefined);

/** The file kept under `id`, or null when it isn't on this device. */
export const getFile = (demo: boolean, id: string) => run<Blob | undefined>(demo, "readonly", (s) => s.get(id) as IDBRequest<Blob | undefined>).then((b) => b ?? null);

/**
 * Remove files no mission lists any more. Run when the app opens, not when a document is taken off a mission,
 * so Undo can still bring one back during the session.
 */
export async function sweepFiles(demo: boolean, keep: Set<string>) {
  const keys = await run<IDBValidKey[]>(demo, "readonly", (s) => s.getAllKeys());
  for (const k of keys) if (!keep.has(String(k))) await run(demo, "readwrite", (s) => s.delete(k));
}

/** "2.4 MB" */
export function fileSize(n: number) {
  if (n < 1024) return `${n} bytes`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** What the viewer can show inside the app; anything else is opened or saved. */
export const viewable = (type: string) => type === "application/pdf" || type.startsWith("image/") || type.startsWith("text/");

/** Every file the plan lists (a job's documents, the scans on qualification records). */
export const listedFiles = (data: { missions: { documents?: { id: string }[] }[]; people: { training: { documents?: { id: string }[] }[] }[] }) => [
  ...data.missions.flatMap((m) => m.documents ?? []),
  ...data.people.flatMap((p) => p.training.flatMap((r) => r.documents ?? [])),
].map((d) => d.id);

const toBase64 = (b: Blob) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ""));
  r.onerror = () => reject(r.error);
  r.readAsDataURL(b);
});

/** The listed files that are on this device, for a backup: id → { type, base64 }. */
export async function packFiles(demo: boolean, ids: string[]): Promise<Record<string, { type: string; data: string }>> {
  const out: Record<string, { type: string; data: string }> = {};
  for (const id of ids) {
    const b = await getFile(demo, id).catch(() => null);
    if (b) out[id] = { type: b.type, data: await toBase64(b) };
  }
  return out;
}

/** Put a backup's files back in this device's file storage. */
export async function unpackFiles(demo: boolean, files: Record<string, { type: string; data: string }>) {
  for (const [id, f] of Object.entries(files)) {
    const bytes = Uint8Array.from(atob(f.data), (c) => c.charCodeAt(0));
    await putFile(demo, id, new Blob([bytes], { type: f.type }));
  }
}
