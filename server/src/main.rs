//! Zom's MRP Server: the Mission Ready Planner for a team, on your own server, behind sign-in.
//!
//! Everyone signs in with their own account. Admins manage accounts; schedulers change the plan;
//! viewers can look. The plan is one document in a SQLite database in the data folder.
//!
//! Settings come from environment variables (handy in Docker):
//!   MRP_DATA          data folder (default /data in Docker, ~/.local/share/zoms-mrp-server otherwise)
//!   MRP_PORT          port (default 7430)
//!   MRP_BIND          address to listen on (default 0.0.0.0)
//!   MRP_TLS           off (default; run it behind Caddy or another proxy for https) | files
//!   MRP_TLS_CERT / MRP_TLS_KEY   PEM files for `files`
//!   MRP_TRUST_PROXY   on when a proxy in front of it handles https (default off; on in docker-compose)
//!   MRP_NAME          the name shown on the sign-in page (default "Zom's MRP")
//!
//! Commands (e.g. `docker exec mrp zoms-mrp-server reset-password alex`):
//!   zoms-mrp-server                          run the server
//!   zoms-mrp-server reset-password <user>    set a new password (prompts, or reads MRP_PASSWORD)
//!   zoms-mrp-server create-admin <user>      add an admin account (same password prompt)
//!   zoms-mrp-server health                   exit 0 if the server on MRP_PORT answers (Docker health check)

mod admin;
mod auth;
mod db;
mod plan;
mod tls;
#[cfg(test)]
mod tests;

use axum::{
    extract::{DefaultBodyLimit, Request},
    http::{header, HeaderValue, Method, StatusCode, Uri},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, patch, post},
    Json, Router,
};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{Arc, Mutex},
    time::{Instant, SystemTime, UNIX_EPOCH},
};

pub struct Config {
    pub data_dir: PathBuf,
    pub port: u16,
    pub bind: String,
    /// https handled by this server itself.
    pub tls: bool,
    /// A proxy in front (Caddy) handles https and says so in X-Forwarded-Proto.
    pub trust_proxy: bool,
    pub name: String,
}

pub struct AppInner {
    pub db: Mutex<rusqlite::Connection>,
    pub config: Config,
    /// Wrong-password counts per username, for the sign-in limit.
    pub fails: Mutex<HashMap<String, (u32, Instant)>>,
}
pub type App = Arc<AppInner>;

pub type ApiResult = Result<Response, Response>;

pub fn err(status: StatusCode, msg: &str) -> Response {
    (status, Json(serde_json::json!({ "error": msg }))).into_response()
}

pub fn now() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0)
}

pub fn random_hex(bytes: usize) -> String {
    let mut b = vec![0u8; bytes];
    getrandom::fill(&mut b).expect("system random source");
    b.iter().map(|x| format!("{x:02x}")).collect()
}

pub fn sha256_hex(s: &str) -> String {
    Sha256::digest(s.as_bytes()).iter().map(|x| format!("{x:02x}")).collect()
}

/// "20261101-153012" (UTC), for file names.
pub fn stamp() -> String {
    let t = now();
    let (y, m, d) = civil_from_days(t / 86_400);
    let s = t % 86_400;
    format!("{y}{m:02}{d:02}-{:02}{:02}{:02}", s / 3600, s % 3600 / 60, s % 60)
}

/// Days since 1970-01-01 → (year, month, day).
fn civil_from_days(z: i64) -> (i32, u8, u8) {
    let z = z + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u8;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u8;
    ((yoe + era * 400 + i64::from(m <= 2)) as i32, m, d)
}

fn env(name: &str) -> Option<String> {
    std::env::var(name).ok().map(|v| v.trim().to_string()).filter(|v| !v.is_empty())
}

/// State-changing requests must come from this site's own pages (on top of SameSite cookies),
/// so other sites can't act on a signed-in person's behalf.
async fn same_origin(req: Request, next: Next) -> Response {
    if req.method() != Method::GET && req.method() != Method::HEAD {
        let host = req.headers().get(header::HOST).and_then(|v| v.to_str().ok()).unwrap_or("");
        let fwd = req.headers().get("x-forwarded-host").and_then(|v| v.to_str().ok());
        let origin = req.headers().get(header::ORIGIN).and_then(|v| v.to_str().ok());
        let ok = match origin {
            Some(o) => {
                let o = o.split("://").nth(1).unwrap_or(o);
                o == host || Some(o) == fwd
            }
            // No Origin (old browsers, scripts): ask for the app's own header instead.
            None => req.headers().get("x-mrp").is_some(),
        };
        if !ok {
            return err(StatusCode::FORBIDDEN, "Requests from other sites aren't allowed.");
        }
    }
    next.run(req).await
}

/// The browser's own protections: only this site's scripts, no framing, no sniffing, https only.
async fn security_headers(req: Request, next: Next) -> Response {
    let https = req.headers().get("x-forwarded-proto").and_then(|v| v.to_str().ok()) == Some("https");
    let api = req.uri().path().starts_with("/api/");
    let mut res = next.run(req).await;
    let h = res.headers_mut();
    let set = |h: &mut axum::http::HeaderMap, k: &'static str, v: String| {
        if let Ok(v) = HeaderValue::from_str(&v) {
            h.insert(k, v);
        }
    };
    set(h, "content-security-policy", format!(
        "default-src 'self'; script-src 'self' {}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; \
         font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
        web::inline_script_hashes()
    ));
    set(h, "x-content-type-options", "nosniff".into());
    set(h, "x-frame-options", "DENY".into());
    set(h, "referrer-policy", "same-origin".into());
    set(h, "permissions-policy", "camera=(), microphone=(), geolocation=(), payment=()".into());
    set(h, "cross-origin-opener-policy", "same-origin".into());
    if https {
        set(h, "strict-transport-security", "max-age=31536000".into());
    }
    if api {
        set(h, "cache-control", "no-store".into());
    }
    res
}

pub fn router(app: App) -> Router {
    Router::new()
        .route("/api/session", get(auth::session))
        .route("/api/setup", post(auth::setup))
        .route("/api/login", post(auth::login))
        .route("/api/logout", post(auth::logout))
        .route("/api/me/password", post(auth::change_password))
        .route("/api/plan", get(plan::get_plan).put(plan::save_plan))
        .route("/api/plan/version", get(plan::get_version))
        .route("/api/admin/users", get(admin::users).post(admin::create_user))
        .route("/api/admin/users/{id}", patch(admin::update_user).delete(admin::delete_user))
        .route("/api/admin/activity", get(admin::activity))
        .route("/api/admin/backup", get(admin::backup))
        .fallback(get(web::serve))
        .layer(middleware::from_fn(same_origin))
        .layer(middleware::from_fn(security_headers))
        .layer(DefaultBodyLimit::max(25 * 1024 * 1024))
        .with_state(app)
}

mod web {
    //! The web app, built in (from `npm run build:server`, which writes ../dist-server).
    use super::*;
    use base64_lite::encode;

    #[derive(rust_embed::Embed)]
    #[folder = "../dist-server"]
    struct Web;

    pub async fn serve(uri: Uri) -> Response {
        let path = uri.path().trim_start_matches('/');
        if path.starts_with("api/") {
            return err(StatusCode::NOT_FOUND, "No such API.");
        }
        if !path.is_empty() {
            if let Some(f) = Web::get(path) {
                let mime = mime_guess::from_path(path).first_or_octet_stream().to_string();
                // Built files have hashed names and never change; the rest should be checked for updates.
                let cache = if path.starts_with("assets/") { "public, max-age=31536000, immutable" } else { "no-cache" };
                return ([(header::CONTENT_TYPE, mime), (header::CACHE_CONTROL, cache.to_string())], f.data.into_owned()).into_response();
            }
        }
        match Web::get("index.html") {
            Some(f) => ([(header::CONTENT_TYPE, "text/html; charset=utf-8"), (header::CACHE_CONTROL, "no-cache")], f.data.into_owned()).into_response(),
            None => (StatusCode::NOT_FOUND, "The web app wasn't built into this server. Run `npm run build:server` before building it.").into_response(),
        }
    }

    /// The hashes of index.html's inline scripts (the theme picker that runs before the page draws),
    /// so the content policy allows exactly those and nothing else inline.
    pub fn inline_script_hashes() -> &'static str {
        static HASHES: std::sync::OnceLock<String> = std::sync::OnceLock::new();
        HASHES.get_or_init(|| {
            let Some(f) = Web::get("index.html") else { return String::new() };
            let html = String::from_utf8_lossy(&f.data).to_string();
            let mut out = vec![];
            let mut rest = html.as_str();
            while let Some(i) = rest.find("<script>") {
                let after = &rest[i + 8..];
                let Some(j) = after.find("</script>") else { break };
                out.push(format!("'sha256-{}'", encode(&Sha256::digest(after[..j].as_bytes()))));
                rest = &after[j..];
            }
            out.join(" ")
        })
    }

    mod base64_lite {
        /// Standard base64, for the content policy's script hashes.
        pub fn encode(bytes: &[u8]) -> String {
            const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
            let mut s = String::new();
            for c in bytes.chunks(3) {
                let n = (c[0] as u32) << 16 | (*c.get(1).unwrap_or(&0) as u32) << 8 | *c.get(2).unwrap_or(&0) as u32;
                s.push(T[(n >> 18) as usize & 63] as char);
                s.push(T[(n >> 12) as usize & 63] as char);
                s.push(if c.len() > 1 { T[(n >> 6) as usize & 63] as char } else { '=' });
                s.push(if c.len() > 2 { T[n as usize & 63] as char } else { '=' });
            }
            s
        }
    }
}

/// Keep a daily copy of the database (last 30 kept) in the data folder's `backups`.
async fn daily_backups(app: App) {
    loop {
        let (y, m, d) = civil_from_days(now() / 86_400);
        let name = format!("mrp-{y}-{m:02}-{d:02}.db");
        let dir = app.config.data_dir.join("backups");
        if !dir.join(&name).exists() {
            match admin::snapshot(&app, &name) {
                Ok(_) => {
                    let mut daily: Vec<String> = std::fs::read_dir(&dir)
                        .map(|r| r.flatten().filter_map(|e| e.file_name().into_string().ok()).filter(|n| n.starts_with("mrp-2")).collect())
                        .unwrap_or_default();
                    daily.sort();
                    while daily.len() > 30 {
                        let _ = std::fs::remove_file(dir.join(daily.remove(0)));
                    }
                }
                Err(e) => eprintln!("backup failed: {e}"),
            }
        }
        tokio::time::sleep(std::time::Duration::from_secs(3600)).await;
    }
}

fn read_password() -> String {
    if let Some(p) = env("MRP_PASSWORD") {
        return p;
    }
    eprint!("New password (at least 10 characters): ");
    let mut s = String::new();
    std::io::stdin().read_line(&mut s).ok();
    s.trim_end_matches(['\r', '\n']).to_string()
}

fn command(conn: &rusqlite::Connection, args: &[String]) -> bool {
    let user = || {
        args.get(1).map(|u| u.to_lowercase()).unwrap_or_else(|| {
            eprintln!("usage: zoms-mrp-server {} <username>", args[0]);
            std::process::exit(2)
        })
    };
    let password = || {
        let pw = read_password();
        if pw.chars().count() < 10 {
            eprintln!("Use at least 10 characters.");
            std::process::exit(2);
        }
        pw
    };
    match args.first().map(String::as_str) {
        Some("reset-password") => {
            let user = user();
            let pw = password();
            let n = conn
                .execute("UPDATE users SET pass_hash = ?, disabled = 0 WHERE username = ?", rusqlite::params![auth::hash_password(&pw), user])
                .unwrap_or(0);
            conn.execute("DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE username = ?)", [&user]).ok();
            if n == 0 {
                eprintln!("No user named {user}.");
                std::process::exit(1);
            }
            db::log(conn, None, "Reset a password from the server", &user);
            println!("Password changed for {user}.");
            true
        }
        Some("create-admin") => {
            let user = user();
            let pw = password();
            match conn.execute(
                "INSERT INTO users (id, username, display_name, pass_hash, role, created) VALUES (?, ?, ?, ?, 'admin', ?)",
                rusqlite::params![random_hex(12), user, user, auth::hash_password(&pw), now()],
            ) {
                Ok(_) => println!("Admin {user} created."),
                Err(e) => {
                    eprintln!("Couldn't create {user}: {e}");
                    std::process::exit(1);
                }
            }
            db::log(conn, None, "Added an admin from the server", &user);
            true
        }
        Some(other) => {
            eprintln!("Unknown command: {other}. Commands: reset-password <user>, create-admin <user>, health.");
            std::process::exit(2);
        }
        None => false,
    }
}

/// `zoms-mrp-server health`: ask the running server for its session page over plain http, so the
/// container needs no curl or shell.
fn health() -> ! {
    use std::io::{Read, Write};
    let port = env("MRP_PORT").and_then(|p| p.parse::<u16>().ok()).unwrap_or(7430);
    let ok = (|| {
        let mut s = std::net::TcpStream::connect(("127.0.0.1", port)).ok()?;
        s.set_read_timeout(Some(std::time::Duration::from_secs(5))).ok()?;
        s.write_all(b"GET /api/session HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n").ok()?;
        let mut head = [0u8; 12];
        s.read_exact(&mut head).ok()?;
        Some(head.ends_with(b"200"))
    })()
    .unwrap_or(false);
    std::process::exit(if ok { 0 } else { 1 })
}

#[tokio::main]
async fn main() {
    if std::env::args().nth(1).as_deref() == Some("health") {
        health();
    }
    let data_dir = env("MRP_DATA").map(PathBuf::from).unwrap_or_else(|| {
        let home = std::env::var("HOME").map(PathBuf::from).unwrap_or_else(|_| PathBuf::from("."));
        home.join(".local/share/zoms-mrp-server")
    });
    std::fs::create_dir_all(&data_dir).unwrap_or_else(|e| panic!("can't create the data folder {}: {e}", data_dir.display()));
    let conn = db::open(&data_dir.join("mrp.db")).expect("can't open the database");
    let args: Vec<String> = std::env::args().skip(1).collect();
    if command(&conn, &args) {
        return;
    }

    let tls_mode = env("MRP_TLS").unwrap_or_else(|| "off".into()).to_lowercase();
    let config = Config {
        port: env("MRP_PORT").and_then(|p| p.parse().ok()).unwrap_or(7430),
        bind: env("MRP_BIND").unwrap_or_else(|| "0.0.0.0".into()),
        tls: tls_mode == "files",
        trust_proxy: env("MRP_TRUST_PROXY").is_some_and(|v| matches!(v.to_lowercase().as_str(), "on" | "1" | "true" | "yes")),
        name: env("MRP_NAME").unwrap_or_else(|| "Zom's MRP".into()),
        data_dir: data_dir.clone(),
    };
    let tls_config = match tls_mode.as_str() {
        "off" => None,
        "files" => Some(tls::from_files(&env("MRP_TLS_CERT").expect("MRP_TLS_CERT"), &env("MRP_TLS_KEY").expect("MRP_TLS_KEY"))),
        other => panic!("MRP_TLS must be off or files (got {other})"),
    };
    let app: App = Arc::new(AppInner { db: Mutex::new(conn), config, fails: Mutex::new(HashMap::new()) });
    tokio::spawn(daily_backups(app.clone()));

    let addr = format!("{}:{}", app.config.bind, app.config.port);
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap_or_else(|e| {
        eprintln!("Can't use {addr} ({e}). Pick another port with MRP_PORT.");
        std::process::exit(1)
    });
    let users = db::user_count(&app.db.lock().unwrap()).unwrap_or(0);
    println!(
        "Zom's MRP Server {} on {}://{addr}  (data: {})",
        env!("CARGO_PKG_VERSION"),
        if tls_config.is_some() { "https" } else { "http" },
        data_dir.display()
    );
    if tls_config.is_none() && !app.config.trust_proxy {
        println!("Note: this is plain http. Put it behind https (the docker-compose file uses Caddy) before people sign in over the internet.");
    }
    if users == 0 {
        println!("First run: open it in a browser to create the admin account.");
    }
    let router = router(app);
    match tls_config {
        None => axum::serve(listener, router).await.expect("server"),
        Some(cfg) => tls::serve(listener, router, cfg).await,
    }
}
