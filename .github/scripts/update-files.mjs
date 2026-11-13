// Writes latest.json, the file installed copies read to find a new version, from the release's own files.
// tauri-action can't: it works out each file's name itself, keeps the apostrophe in "Zom's MRP", and so
// never matches GitHub's "Zom.s.MRP_…" names. It found no signature and skipped latest.json without failing
// (0.2.5 to 0.2.7). This checks every system instead and fails with the reason when one is missing.
//
// node update-files.mjs <folder>: the folder holds assets.txt (the release's file names, one per line)
// and the release's .sig files. Needs TAG, REPO and PUBKEY. Writes <folder>/latest.json.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [dir] = process.argv.slice(2);
const { TAG, REPO, PUBKEY } = process.env;
const fail = (why) => { console.log(`::error::${why}`); process.exitCode = 1; };

// The key a signature was made with, or that a public key is: bytes 2 to 10 of its second line.
const keyId = (b64) => Buffer.from(Buffer.from(b64.trim(), "base64").toString().split("\n")[1], "base64").subarray(2, 10).toString("hex");

const names = readFileSync(join(dir, "assets.txt"), "utf8").split("\n").map((s) => s.trim()).filter(Boolean);
// Which file each system installs from. The Mac app is one universal build for both kinds of Mac;
// .deb and .rpm copies don't update themselves (their package manager does).
const systems = [
  { keys: ["windows-x86_64", "windows-x86_64-nsis"], label: "Windows", match: /_x64-setup\.exe$/ },
  { keys: ["darwin-aarch64", "darwin-x86_64", "darwin-aarch64-app", "darwin-x86_64-app"], label: "macOS", match: /\.app\.tar\.gz$/ },
  { keys: ["linux-x86_64", "linux-x86_64-appimage"], label: "Linux (AppImage)", match: /\.AppImage$/ },
];

const want = keyId(PUBKEY ?? "");
const platforms = {};
for (const { keys, label, match } of systems) {
  const file = names.find((n) => match.test(n));
  if (!file) { fail(`${label}: the release has no update file (looked for ${match}). Did that build fail?`); continue; }
  if (!names.includes(`${file}.sig`) || !existsSync(join(dir, `${file}.sig`))) { fail(`${label}: ${file} has no .sig, so it wasn't signed with the updater key.`); continue; }
  const signature = readFileSync(join(dir, `${file}.sig`), "utf8").trim();
  let got;
  try { got = keyId(signature); } catch { got = "unreadable"; }
  if (got !== want) { fail(`${label}: ${file}.sig was signed with key ${got}, but installed copies trust ${want} (TAURI_UPDATER_PUBKEY).`); continue; }
  const url = `https://github.com/${REPO}/releases/download/${encodeURIComponent(TAG)}/${encodeURIComponent(file)}`;
  for (const key of keys) platforms[key] = { signature, url };
  console.log(`${label}: ${file}`);
}

if (!process.exitCode) {
  const version = TAG.replace(/^v/, "");
  const notes = `What's new: https://docs.zombeatzmedia.com/mrp/whats-new`;
  writeFileSync(join(dir, "latest.json"), JSON.stringify({ version, notes, pub_date: new Date().toISOString(), platforms }, null, 2));
  console.log(`::notice::latest.json lists ${Object.keys(platforms).length} entries for ${version}, all signed with key ${want}.`);
}
