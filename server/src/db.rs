//! Storage: one SQLite file (`mrp.db` in the data folder).
//!
//! The plan is the same JSON document the app uses (one row, with a version number so two people
//! saving at once can't overwrite each other). The server adds what it alone decides: accounts,
//! sessions, and a log of who did what.

use rusqlite::{params, Connection, OptionalExtension};

pub fn open(path: &std::path::Path) -> rusqlite::Result<Connection> {
    let db = Connection::open(path)?;
    setup(&db)?;
    Ok(db)
}

/// A database in memory, for tests.
#[cfg(test)]
pub fn memory() -> Connection {
    let db = Connection::open_in_memory().unwrap();
    setup(&db).unwrap();
    db
}

fn setup(db: &Connection) -> rusqlite::Result<()> {
    db.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;
         PRAGMA foreign_keys = ON;
         PRAGMA busy_timeout = 5000;
         CREATE TABLE IF NOT EXISTS users (
           id TEXT PRIMARY KEY,
           username TEXT NOT NULL UNIQUE COLLATE NOCASE,
           display_name TEXT NOT NULL,
           pass_hash TEXT NOT NULL,
           role TEXT NOT NULL CHECK (role IN ('admin', 'scheduler', 'viewer')),
           disabled INTEGER NOT NULL DEFAULT 0,
           created INTEGER NOT NULL,
           last_login INTEGER
         );
         CREATE TABLE IF NOT EXISTS sessions (
           token_hash TEXT PRIMARY KEY,
           user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
           created INTEGER NOT NULL,
           last_seen INTEGER NOT NULL,
           agent TEXT
         );
         CREATE TABLE IF NOT EXISTS plan (
           id INTEGER PRIMARY KEY CHECK (id = 1),
           version INTEGER NOT NULL,
           data TEXT NOT NULL,
           updated INTEGER NOT NULL,
           updated_by TEXT
         );
         CREATE TABLE IF NOT EXISTS activity (
           id INTEGER PRIMARY KEY AUTOINCREMENT,
           at INTEGER NOT NULL,
           username TEXT,
           action TEXT NOT NULL,
           detail TEXT NOT NULL DEFAULT ''
         );",
    )
}

#[derive(Clone, Debug)]
pub struct User {
    pub id: String,
    pub username: String,
    pub display_name: String,
    pub role: String,
}

impl User {
    pub fn can_edit(&self) -> bool {
        self.role == "admin" || self.role == "scheduler"
    }
    pub fn is_admin(&self) -> bool {
        self.role == "admin"
    }
    pub fn json(&self) -> serde_json::Value {
        serde_json::json!({ "id": self.id, "username": self.username, "name": self.display_name, "role": self.role })
    }
}

pub fn user_count(db: &Connection) -> rusqlite::Result<i64> {
    db.query_row("SELECT COUNT(*) FROM users", [], |r| r.get(0))
}

pub fn admin_count(db: &Connection) -> rusqlite::Result<i64> {
    db.query_row("SELECT COUNT(*) FROM users WHERE role = 'admin' AND disabled = 0", [], |r| r.get(0))
}

pub fn user_by_session(db: &Connection, token_hash: &str) -> rusqlite::Result<Option<User>> {
    db.query_row(
        "SELECT u.id, u.username, u.display_name, u.role FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND u.disabled = 0",
        [token_hash],
        |r| Ok(User { id: r.get(0)?, username: r.get(1)?, display_name: r.get(2)?, role: r.get(3)? }),
    )
    .optional()
}

/// The plan and its version (0 and no data before anyone has saved).
pub fn plan(db: &Connection) -> rusqlite::Result<(i64, Option<String>, Option<i64>, Option<String>)> {
    Ok(db
        .query_row("SELECT version, data, updated, updated_by FROM plan WHERE id = 1", [], |r| Ok((r.get(0)?, Some(r.get(1)?), Some(r.get(2)?), r.get(3)?)))
        .optional()?
        .unwrap_or((0, None, None, None)))
}

pub fn log(db: &Connection, username: Option<&str>, action: &str, detail: &str) {
    let _ = db.execute(
        "INSERT INTO activity (at, username, action, detail) VALUES (?, ?, ?, ?)",
        params![crate::now(), username, action, detail],
    );
    // Keep the last 5000 entries.
    let _ = db.execute("DELETE FROM activity WHERE id <= (SELECT MAX(id) FROM activity) - 5000", []);
}
