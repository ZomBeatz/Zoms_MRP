//! For admins: who has access (accounts and roles), what's been happening, and a backup download.

use crate::{auth, db, err, now, random_hex, stamp, App, ApiResult};
use axum::{
    extract::{Path, Query, State},
    http::{header, HeaderMap, StatusCode},
    response::IntoResponse,
    Json,
};
use rusqlite::params;
use serde::Deserialize;

pub async fn users(State(app): State<App>, headers: HeaderMap) -> ApiResult {
    auth::require_admin(&app, &headers)?;
    let db = app.db.lock().unwrap();
    let mut st = db
        .prepare("SELECT id, username, display_name, role, disabled, created, last_login FROM users ORDER BY role, display_name")
        .map_err(|_| err(StatusCode::INTERNAL_SERVER_ERROR, "Couldn't read accounts."))?;
    let rows: Vec<serde_json::Value> = st
        .query_map([], |r| {
            Ok(serde_json::json!({
                "id": r.get::<_, String>(0)?, "username": r.get::<_, String>(1)?, "name": r.get::<_, String>(2)?,
                "role": r.get::<_, String>(3)?, "disabled": r.get::<_, i64>(4)? != 0, "created": r.get::<_, i64>(5)?,
                "lastLogin": r.get::<_, Option<i64>>(6)?,
            }))
        })
        .map_err(|_| err(StatusCode::INTERNAL_SERVER_ERROR, "Couldn't read accounts."))?
        .flatten()
        .collect();
    Ok(Json(rows).into_response())
}

#[derive(Deserialize)]
pub struct NewUser {
    username: String,
    name: String,
    role: String,
    password: String,
}

pub async fn create_user(State(app): State<App>, headers: HeaderMap, Json(req): Json<NewUser>) -> ApiResult {
    let admin = auth::require_admin(&app, &headers)?;
    let username = auth::check_username(&req.username)?;
    let role = auth::check_role(&req.role)?;
    auth::check_password_rules(&req.password)?;
    let name = if req.name.trim().is_empty() { username.clone() } else { req.name.trim().to_string() };
    let db = app.db.lock().unwrap();
    db.execute(
        "INSERT INTO users (id, username, display_name, pass_hash, role, created) VALUES (?, ?, ?, ?, ?, ?)",
        params![random_hex(12), username, name, auth::hash_password(&req.password), role, now()],
    )
    .map_err(|_| err(StatusCode::CONFLICT, "There's already an account with that username."))?;
    db::log(&db, Some(&admin.username), "Added an account", &format!("{username} ({role})"));
    Ok("ok".into_response())
}

#[derive(Deserialize)]
pub struct UserPatch {
    name: Option<String>,
    role: Option<String>,
    password: Option<String>,
    disabled: Option<bool>,
}

pub async fn update_user(State(app): State<App>, headers: HeaderMap, Path(id): Path<String>, Json(req): Json<UserPatch>) -> ApiResult {
    let admin = auth::require_admin(&app, &headers)?;
    let db = app.db.lock().unwrap();
    let (username, role): (String, String) = db
        .query_row("SELECT username, role FROM users WHERE id = ?", [&id], |r| Ok((r.get(0)?, r.get(1)?)))
        .map_err(|_| err(StatusCode::NOT_FOUND, "No such account."))?;
    // Never leave the server without an admin who can sign in.
    let losing_admin = role == "admin" && (req.role.as_deref().is_some_and(|r| r != "admin") || req.disabled == Some(true));
    if losing_admin && db::admin_count(&db).unwrap_or(0) <= 1 {
        return Err(err(StatusCode::BAD_REQUEST, "This is the only admin. Make someone else an admin first."));
    }
    let mut changes = vec![];
    if let Some(n) = req.name.as_deref().map(str::trim).filter(|n| !n.is_empty()) {
        db.execute("UPDATE users SET display_name = ? WHERE id = ?", params![n, id]).ok();
        changes.push("name".to_string());
    }
    if let Some(r) = &req.role {
        let r = auth::check_role(r)?;
        db.execute("UPDATE users SET role = ? WHERE id = ?", params![r, id]).ok();
        changes.push(format!("role to {r}"));
    }
    if let Some(p) = &req.password {
        auth::check_password_rules(p)?;
        db.execute("UPDATE users SET pass_hash = ? WHERE id = ?", params![auth::hash_password(p), id]).ok();
        db.execute("DELETE FROM sessions WHERE user_id = ?", [&id]).ok();
        changes.push("password".to_string());
    }
    if let Some(d) = req.disabled {
        db.execute("UPDATE users SET disabled = ? WHERE id = ?", params![d as i64, id]).ok();
        if d {
            db.execute("DELETE FROM sessions WHERE user_id = ?", [&id]).ok();
        }
        changes.push(if d { "turned off".into() } else { "turned on".into() });
    }
    db::log(&db, Some(&admin.username), "Changed an account", &format!("{username}: {}", changes.join(", ")));
    Ok("ok".into_response())
}

pub async fn delete_user(State(app): State<App>, headers: HeaderMap, Path(id): Path<String>) -> ApiResult {
    let admin = auth::require_admin(&app, &headers)?;
    if admin.id == id {
        return Err(err(StatusCode::BAD_REQUEST, "You can't remove your own account."));
    }
    let db = app.db.lock().unwrap();
    let (username, role): (String, String) = db
        .query_row("SELECT username, role FROM users WHERE id = ?", [&id], |r| Ok((r.get(0)?, r.get(1)?)))
        .map_err(|_| err(StatusCode::NOT_FOUND, "No such account."))?;
    if role == "admin" && db::admin_count(&db).unwrap_or(0) <= 1 {
        return Err(err(StatusCode::BAD_REQUEST, "This is the only admin. Make someone else an admin first."));
    }
    db.execute("DELETE FROM users WHERE id = ?", [&id]).ok();
    db::log(&db, Some(&admin.username), "Removed an account", &username);
    Ok("ok".into_response())
}

#[derive(Deserialize)]
pub struct ActivityQuery {
    limit: Option<i64>,
}

/// What's been happening: sign-ins, wrong passwords, saves, account changes. Newest first.
pub async fn activity(State(app): State<App>, headers: HeaderMap, Query(q): Query<ActivityQuery>) -> ApiResult {
    auth::require_admin(&app, &headers)?;
    let db = app.db.lock().unwrap();
    let mut st = db
        .prepare("SELECT at, username, action, detail FROM activity ORDER BY id DESC LIMIT ?")
        .map_err(|_| err(StatusCode::INTERNAL_SERVER_ERROR, "Couldn't read the activity."))?;
    let rows: Vec<serde_json::Value> = st
        .query_map([q.limit.unwrap_or(200).clamp(1, 1000)], |r| {
            Ok(serde_json::json!({ "at": r.get::<_, i64>(0)?, "username": r.get::<_, Option<String>>(1)?, "action": r.get::<_, String>(2)?, "detail": r.get::<_, String>(3)? }))
        })
        .map_err(|_| err(StatusCode::INTERNAL_SERVER_ERROR, "Couldn't read the activity."))?
        .flatten()
        .collect();
    Ok(Json(rows).into_response())
}

/// A copy of the whole database (accounts included, passwords only as hashes), to keep somewhere safe.
pub async fn backup(State(app): State<App>, headers: HeaderMap) -> ApiResult {
    let admin = auth::require_admin(&app, &headers)?;
    let name = format!("download-{}.db", stamp());
    let path = snapshot(&app, &name).map_err(|_| err(StatusCode::INTERNAL_SERVER_ERROR, "Couldn't make the backup."))?;
    let bytes = std::fs::read(&path).map_err(|_| err(StatusCode::INTERNAL_SERVER_ERROR, "Couldn't read the backup."))?;
    let _ = std::fs::remove_file(&path);
    db::log(&app.db.lock().unwrap(), Some(&admin.username), "Downloaded a backup", "");
    Ok((
        [
            (header::CONTENT_TYPE, "application/octet-stream".to_string()),
            (header::CONTENT_DISPOSITION, format!("attachment; filename=\"zoms-mrp-{}.db\"", stamp())),
        ],
        bytes,
    )
        .into_response())
}

/// Copy the database into the data folder's `backups` (consistent even while people are saving).
pub fn snapshot(app: &App, name: &str) -> rusqlite::Result<std::path::PathBuf> {
    let dir = app.config.data_dir.join("backups");
    let _ = std::fs::create_dir_all(&dir);
    let path = dir.join(name);
    let _ = std::fs::remove_file(&path);
    app.db.lock().unwrap().execute("VACUUM INTO ?", [path.to_string_lossy().to_string()])?;
    Ok(path)
}
