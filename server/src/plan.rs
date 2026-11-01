//! The team's plan: one JSON document, read by everyone signed in and saved by schedulers and admins.
//!
//! Every save says which version it started from. If someone else saved in between, the save is
//! refused (409) with the newer version, so nobody silently overwrites anyone.

use crate::{auth, db, err, now, App, ApiResult};
use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    Json,
};
use rusqlite::params;
use serde::Deserialize;

/// The plan, its version, and who saved it last.
pub async fn get_plan(State(app): State<App>, headers: HeaderMap) -> ApiResult {
    auth::require(&app, &headers)?;
    let (version, data, updated, by) = db::plan(&app.db.lock().unwrap()).map_err(|_| err(StatusCode::INTERNAL_SERVER_ERROR, "Couldn't read the plan."))?;
    let data: serde_json::Value = data.and_then(|d| serde_json::from_str(&d).ok()).unwrap_or(serde_json::Value::Null);
    Ok(Json(serde_json::json!({ "version": version, "data": data, "updated": updated, "updatedBy": by })).into_response())
}

/// Just the version and who saved it, so open pages can check for changes cheaply.
pub async fn get_version(State(app): State<App>, headers: HeaderMap) -> ApiResult {
    auth::require(&app, &headers)?;
    let (version, _, updated, by) = db::plan(&app.db.lock().unwrap()).map_err(|_| err(StatusCode::INTERNAL_SERVER_ERROR, "Couldn't read the plan."))?;
    Ok(Json(serde_json::json!({ "version": version, "updated": updated, "updatedBy": by })).into_response())
}

#[derive(Deserialize)]
pub struct SaveReq {
    /// The version this save started from.
    version: i64,
    data: serde_json::Value,
}

pub async fn save_plan(State(app): State<App>, headers: HeaderMap, Json(req): Json<SaveReq>) -> ApiResult {
    let user = auth::require_editor(&app, &headers)?;
    if !req.data.is_object() || !req.data.get("missions").is_some_and(|m| m.is_array()) {
        return Err(err(StatusCode::BAD_REQUEST, "That isn't a Zom's MRP plan."));
    }
    let db = app.db.lock().unwrap();
    let (current, ..) = db::plan(&db).map_err(|_| err(StatusCode::INTERNAL_SERVER_ERROR, "Couldn't read the plan."))?;
    if req.version != current {
        return Err((
            StatusCode::CONFLICT,
            Json(serde_json::json!({ "error": "Someone else saved changes a moment ago.", "version": current })),
        )
            .into_response());
    }
    let next = current + 1;
    let text = req.data.to_string();
    db.execute(
        "INSERT INTO plan (id, version, data, updated, updated_by) VALUES (1, ?1, ?2, ?3, ?4)
         ON CONFLICT(id) DO UPDATE SET version = ?1, data = ?2, updated = ?3, updated_by = ?4",
        params![next, text, now(), user.display_name],
    )
    .map_err(|_| err(StatusCode::INTERNAL_SERVER_ERROR, "Couldn't save the plan."))?;
    // One log line per person per few minutes of editing, not one per keystroke.
    let recent: bool = db
        .query_row("SELECT COUNT(*) FROM activity WHERE username = ? AND action = 'Changed the plan' AND at > ?", params![user.username, now() - 300], |r| r.get::<_, i64>(0))
        .unwrap_or(0)
        > 0;
    if !recent {
        db::log(&db, Some(&user.username), "Changed the plan", "");
    }
    Ok(Json(serde_json::json!({ "version": next })).into_response())
}
