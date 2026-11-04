//! Zom's MRP on one computer: the web app in a window, with the plan kept in a file in the app's
//! data folder (Windows %APPDATA%\com.zombeatz.zoms-mrp, macOS ~/Library/Application Support/...,
//! Linux ~/.local/share/com.zombeatz.zoms-mrp). Each day's first save also keeps a copy in
//! `backups` (the last 30). It can keep an Excel copy in a folder you pick, such as a Teams
//! channel's folder synced by OneDrive.

use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};

const PLAN_FILE: &str = "mrp.json";

fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Write by way of a temporary file, so a crash or power cut never leaves half a file.
fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let tmp = path.with_extension("saving");
    fs::write(&tmp, bytes).map_err(|e| e.to_string())?;
    fs::rename(&tmp, path).map_err(|e| e.to_string())
}

/// "2026-11-01" (UTC) for backup names.
fn today() -> String {
    let z = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0) / 86_400 + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    format!("{}-{m:02}-{d:02}", yoe + era * 400 + i64::from(m <= 2))
}

/// Keep yesterday's plan before today's first save (the last 30 days).
fn daily_backup(dir: &Path) {
    let plan = dir.join(PLAN_FILE);
    if !plan.exists() {
        return;
    }
    let backups = dir.join("backups");
    let _ = fs::create_dir_all(&backups);
    let name = format!("mrp-{}.json", today());
    if backups.join(&name).exists() {
        return;
    }
    let _ = fs::copy(&plan, backups.join(&name));
    let mut all: Vec<String> = fs::read_dir(&backups)
        .map(|r| r.flatten().filter_map(|e| e.file_name().into_string().ok()).filter(|n| n.starts_with("mrp-2")).collect())
        .unwrap_or_default();
    all.sort();
    while all.len() > 30 {
        let _ = fs::remove_file(backups.join(all.remove(0)));
    }
}

#[tauri::command]
fn load_plan(app: AppHandle) -> Result<Option<String>, String> {
    let path = data_dir(&app)?.join(PLAN_FILE);
    if !path.exists() {
        return Ok(None);
    }
    fs::read_to_string(path).map(Some).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_plan(app: AppHandle, data: String) -> Result<(), String> {
    let dir = data_dir(&app)?;
    daily_backup(&dir);
    write_atomic(&dir.join(PLAN_FILE), data.as_bytes())
}

/// The workbook's bytes as the raw request body; the full path (a .xlsx in a folder that exists) in `x-path`.
#[tauri::command]
fn write_excel(request: tauri::ipc::Request) -> Result<String, String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else { return Err("Expected the file's bytes.".into()) };
    let path = header(&request, "x-path")?;
    let path = PathBuf::from(path);
    if path.extension().and_then(|e| e.to_str()) != Some("xlsx") || !path.parent().is_some_and(Path::is_dir) {
        return Err("That folder isn't there any more. Pick it again in Settings.".into());
    }
    write_atomic(&path, bytes)?;
    Ok(path.to_string_lossy().to_string())
}

/// Save a file to the Downloads folder (a backup, an Excel export). Returns where it went.
#[tauri::command]
fn save_download(app: AppHandle, request: tauri::ipc::Request) -> Result<String, String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else { return Err("Expected the file's bytes.".into()) };
    let name: String = header(&request, "x-name")?.chars().filter(|c| c.is_alphanumeric() || "-_. ".contains(*c)).collect();
    if name.is_empty() || name.starts_with('.') {
        return Err("That file name won't work.".into());
    }
    let dir = app.path().download_dir().or_else(|_| data_dir(&app))?;
    let path = dir.join(name);
    write_atomic(&path, bytes)?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn data_folder(app: AppHandle) -> Result<String, String> {
    Ok(data_dir(&app)?.to_string_lossy().to_string())
}

fn header(request: &tauri::ipc::Request, name: &str) -> Result<String, String> {
    request
        .headers()
        .get(name)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string())
        .ok_or_else(|| format!("Missing {name}."))
}

pub fn run() {
    tauri::Builder::default()
        // Opening it again brings the open window forward instead of starting a second copy.
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![load_plan, save_plan, write_excel, save_download, data_folder])
        .run(tauri::generate_context!())
        .expect("error while running Zom's MRP");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn backups_keep_a_month() {
        let dir = std::env::temp_dir().join(format!("mrp-desktop-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("backups")).unwrap();
        for d in 1..=35 {
            fs::write(dir.join("backups").join(format!("mrp-2020-01-{d:02}.json")), "{}").unwrap();
        }
        fs::write(dir.join(PLAN_FILE), "{\"v\":1}").unwrap();
        daily_backup(&dir);
        let n = fs::read_dir(dir.join("backups")).unwrap().count();
        assert_eq!(n, 30);
        assert!(dir.join("backups").join(format!("mrp-{}.json", today())).exists());
    }

    #[test]
    fn saves_never_leave_half_a_file() {
        let dir = std::env::temp_dir().join(format!("mrp-desktop-atomic-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let p = dir.join("plan.json");
        write_atomic(&p, b"one").unwrap();
        write_atomic(&p, b"two").unwrap();
        assert_eq!(fs::read_to_string(&p).unwrap(), "two");
        assert!(!dir.join("plan.saving").exists());
    }

    /// A command the window isn't allowed to call fails only in the installed app (saving to Downloads
    /// did, from 0.1.0 to 0.2.1), so every command in build.rs must be allowed in the capabilities.
    #[test]
    fn every_command_is_allowed() {
        let build = include_str!("../build.rs");
        let caps = include_str!("../capabilities/default.json");
        let list = &build[build.find("commands(&[").expect("command list in build.rs")..];
        let list = &list[..list.find("])").unwrap()];
        let commands: Vec<&str> = list.split('"').skip(1).step_by(2).collect();
        assert!(commands.len() >= 5);
        for c in commands {
            let allow = format!("\"allow-{}\"", c.replace('_', "-"));
            assert!(caps.contains(&allow), "{c} isn't in capabilities/default.json as {allow}");
        }
    }
}
