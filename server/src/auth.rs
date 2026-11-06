//! Accounts and sign-in: Argon2 password hashes, session cookies (stored hashed, HttpOnly, SameSite),
//! first-run setup, and a limit on repeated wrong passwords.

use crate::{db, err, now, random_hex, sha256_hex, App, ApiResult};
use argon2::{
    password_hash::{phc::PasswordHash, PasswordHasher, PasswordVerifier},
    Argon2,
};
use axum::{
    extract::State,
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use rusqlite::params;
use serde::Deserialize;
use std::time::{Duration, Instant};

pub const COOKIE: &str = "mrp_session";
/// Signed out after this long without using it.
const IDLE_DAYS: i64 = 14;
/// And after this long in any case.
const MAX_DAYS: i64 = 60;
const MAX_FAILS: u32 = 5;
const LOCKOUT: Duration = Duration::from_secs(5 * 60);

/// A PHC string ("$argon2id$v=19$m=…"), with a random salt from the system's random source.
pub fn hash_password(pw: &str) -> String {
    let hash: PasswordHash = Argon2::default().hash_password(pw.as_bytes()).expect("argon2");
    hash.to_string()
}

pub fn verify_password(pw: &str, hash: &str) -> bool {
    PasswordHash::new(hash).is_ok_and(|h| Argon2::default().verify_password(pw.as_bytes(), &h).is_ok())
}

/// At least 10 characters: this server holds a team's operations.
pub fn check_password_rules(pw: &str) -> Result<(), Response> {
    if pw.chars().count() < 10 {
        return Err(err(StatusCode::BAD_REQUEST, "Use a password of at least 10 characters."));
    }
    Ok(())
}

pub fn check_username(u: &str) -> Result<String, Response> {
    let u = u.trim().to_lowercase();
    if u.len() < 2 || u.len() > 32 || !u.chars().all(|c| c.is_ascii_alphanumeric() || "._-@".contains(c)) {
        return Err(err(StatusCode::BAD_REQUEST, "Usernames are 2 to 32 letters, numbers, dots, dashes, underscores or @."));
    }
    Ok(u)
}

pub fn check_role(r: &str) -> Result<String, Response> {
    match r {
        "admin" | "scheduler" | "viewer" => Ok(r.to_string()),
        _ => Err(err(StatusCode::BAD_REQUEST, "The role is admin, scheduler or viewer.")),
    }
}

fn token_from(headers: &HeaderMap) -> Option<String> {
    headers
        .get_all(header::COOKIE)
        .iter()
        .filter_map(|v| v.to_str().ok())
        .flat_map(|v| v.split(';'))
        .find_map(|kv| kv.trim().strip_prefix(&format!("{COOKIE}=")).map(str::to_string))
}

/// The signed-in person for a request, if any. Old and idle sessions end here.
pub fn current_user(app: &App, headers: &HeaderMap) -> Option<db::User> {
    let token = token_from(headers)?;
    let hash = sha256_hex(&token);
    let db = app.db.lock().unwrap();
    let t = now();
    db.execute("DELETE FROM sessions WHERE last_seen < ? OR created < ?", params![t - IDLE_DAYS * 86_400, t - MAX_DAYS * 86_400]).ok();
    let user = db::user_by_session(&db, &hash).ok().flatten()?;
    db.execute("UPDATE sessions SET last_seen = ? WHERE token_hash = ?", params![t, hash]).ok();
    Some(user)
}

pub fn require(app: &App, headers: &HeaderMap) -> Result<db::User, Response> {
    current_user(app, headers).ok_or_else(|| err(StatusCode::UNAUTHORIZED, "Sign in first."))
}

pub fn require_editor(app: &App, headers: &HeaderMap) -> Result<db::User, Response> {
    let u = require(app, headers)?;
    if !u.can_edit() {
        return Err(err(StatusCode::FORBIDDEN, "You can look but not change things. Ask an admin for scheduler access."));
    }
    Ok(u)
}

pub fn require_admin(app: &App, headers: &HeaderMap) -> Result<db::User, Response> {
    let u = require(app, headers)?;
    if !u.is_admin() {
        return Err(err(StatusCode::FORBIDDEN, "Only admins can do that."));
    }
    Ok(u)
}

fn new_session(app: &App, user_id: &str, headers: &HeaderMap) -> String {
    let token = random_hex(32);
    let agent = headers.get(header::USER_AGENT).and_then(|v| v.to_str().ok()).unwrap_or("").chars().take(200).collect::<String>();
    let t = now();
    app.db
        .lock()
        .unwrap()
        .execute("INSERT INTO sessions (token_hash, user_id, created, last_seen, agent) VALUES (?, ?, ?, ?, ?)", params![sha256_hex(&token), user_id, t, t, agent])
        .ok();
    token
}

/// Secure when the page came over https (directly, or through a proxy like Caddy).
fn cookie(app: &App, headers: &HeaderMap, token: &str, max_age: i64) -> String {
    let https = app.config.tls || (app.config.trust_proxy && headers.get("x-forwarded-proto").and_then(|v| v.to_str().ok()) == Some("https"));
    format!("{COOKIE}={token}; Path=/; Max-Age={max_age}; HttpOnly; SameSite=Strict{}", if https { "; Secure" } else { "" })
}

/// Who's signed in, and whether the server still needs its first admin.
pub async fn session(State(app): State<App>, headers: HeaderMap) -> ApiResult {
    let needs_setup = db::user_count(&app.db.lock().unwrap()).unwrap_or(0) == 0;
    let user = current_user(&app, &headers);
    Ok(Json(serde_json::json!({ "user": user.map(|u| u.json()), "needsSetup": needs_setup, "name": app.config.name })).into_response())
}

#[derive(Deserialize)]
pub struct SetupReq {
    username: String,
    name: String,
    password: String,
}

/// The first person to open a new server makes the admin account. Only works while there are no accounts.
pub async fn setup(State(app): State<App>, headers: HeaderMap, Json(req): Json<SetupReq>) -> ApiResult {
    let username = check_username(&req.username)?;
    check_password_rules(&req.password)?;
    let id = random_hex(12);
    {
        let db = app.db.lock().unwrap();
        if db::user_count(&db).unwrap_or(1) > 0 {
            return Err(err(StatusCode::CONFLICT, "This server is already set up. Sign in instead."));
        }
        let name = if req.name.trim().is_empty() { username.clone() } else { req.name.trim().to_string() };
        db.execute(
            "INSERT INTO users (id, username, display_name, pass_hash, role, created, last_login) VALUES (?, ?, ?, ?, 'admin', ?, ?)",
            params![id, username, name, hash_password(&req.password), now(), now()],
        )
        .map_err(|_| err(StatusCode::INTERNAL_SERVER_ERROR, "Couldn't create the account."))?;
        db::log(&db, Some(&username), "Set up the server", "");
    }
    let token = new_session(&app, &id, &headers);
    Ok(([(header::SET_COOKIE, cookie(&app, &headers, &token, MAX_DAYS * 86_400))], "ok").into_response())
}

#[derive(Deserialize)]
pub struct LoginReq {
    username: String,
    password: String,
}

pub async fn login(State(app): State<App>, headers: HeaderMap, Json(req): Json<LoginReq>) -> ApiResult {
    let username = req.username.trim().to_lowercase();
    {
        let fails = app.fails.lock().unwrap();
        if let Some((n, at)) = fails.get(&username) {
            if *n >= MAX_FAILS && at.elapsed() < LOCKOUT {
                return Err(err(StatusCode::TOO_MANY_REQUESTS, "Too many wrong passwords. Wait 5 minutes, then try again."));
            }
        }
    }
    let found: Option<(String, String, bool)> = app
        .db
        .lock()
        .unwrap()
        .query_row("SELECT id, pass_hash, disabled FROM users WHERE username = ?", [&username], |r| Ok((r.get(0)?, r.get(1)?, r.get::<_, i64>(2)? != 0)))
        .ok();
    // Check a password even for unknown names, so the answer takes as long either way.
    let ok = match &found {
        Some((_, hash, disabled)) => verify_password(&req.password, hash) && !disabled,
        None => {
            static DUMMY: std::sync::OnceLock<String> = std::sync::OnceLock::new();
            verify_password(&req.password, DUMMY.get_or_init(|| hash_password(&random_hex(16))));
            false
        }
    };
    if !ok {
        let mut fails = app.fails.lock().unwrap();
        let e = fails.entry(username.clone()).or_insert((0, Instant::now()));
        if e.1.elapsed() >= LOCKOUT {
            *e = (0, Instant::now());
        }
        e.0 += 1;
        e.1 = Instant::now();
        db::log(&app.db.lock().unwrap(), Some(&username), "Wrong password", "");
        return Err(err(StatusCode::UNAUTHORIZED, "That username and password don't match."));
    }
    app.fails.lock().unwrap().remove(&username);
    let id = found.unwrap().0;
    {
        let db = app.db.lock().unwrap();
        db.execute("UPDATE users SET last_login = ? WHERE id = ?", params![now(), id]).ok();
        db::log(&db, Some(&username), "Signed in", "");
    }
    let token = new_session(&app, &id, &headers);
    Ok(([(header::SET_COOKIE, cookie(&app, &headers, &token, MAX_DAYS * 86_400))], "ok").into_response())
}

pub async fn logout(State(app): State<App>, headers: HeaderMap) -> ApiResult {
    if let Some(t) = token_from(&headers) {
        app.db.lock().unwrap().execute("DELETE FROM sessions WHERE token_hash = ?", [sha256_hex(&t)]).ok();
    }
    Ok(([(header::SET_COOKIE, cookie(&app, &headers, "", 0))], "ok").into_response())
}

#[derive(Deserialize)]
pub struct PasswordReq {
    current: String,
    new: String,
}

/// Change your own password. Signs you out everywhere else.
pub async fn change_password(State(app): State<App>, headers: HeaderMap, Json(req): Json<PasswordReq>) -> ApiResult {
    let user = require(&app, &headers)?;
    check_password_rules(&req.new)?;
    let db = app.db.lock().unwrap();
    let hash: String = db.query_row("SELECT pass_hash FROM users WHERE id = ?", [&user.id], |r| r.get(0)).map_err(|_| err(StatusCode::NOT_FOUND, "No such account."))?;
    if !verify_password(&req.current, &hash) {
        return Err(err(StatusCode::BAD_REQUEST, "Your current password isn't right."));
    }
    db.execute("UPDATE users SET pass_hash = ? WHERE id = ?", params![hash_password(&req.new), user.id]).ok();
    let keep = token_from(&headers).map(|t| sha256_hex(&t)).unwrap_or_default();
    db.execute("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?", params![user.id, keep]).ok();
    db::log(&db, Some(&user.username), "Changed their password", "");
    Ok("ok".into_response())
}
