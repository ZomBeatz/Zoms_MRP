//! The server's rules, checked end to end through the router.

use crate::{db, router, App, AppInner, Config};
use axum::{
    body::Body,
    http::{header, Request, StatusCode},
    Router,
};
use http_body_util::BodyExt;
use std::{collections::HashMap, sync::{Arc, Mutex}};
use tower::ServiceExt;

fn app() -> (Router, App) {
    let dir = std::env::temp_dir().join(format!("mrp-test-{}", crate::random_hex(6)));
    std::fs::create_dir_all(&dir).unwrap();
    let app: App = Arc::new(AppInner {
        db: Mutex::new(db::memory()),
        config: Config { data_dir: dir, port: 0, bind: "127.0.0.1".into(), tls: false, trust_proxy: false, name: "Test".into() },
        fails: Mutex::new(HashMap::new()),
    });
    (router(app.clone()), app)
}

/// A request from the app's own page (same origin), with an optional session cookie.
async fn call(r: &Router, method: &str, path: &str, cookie: Option<&str>, body: Option<serde_json::Value>) -> (StatusCode, serde_json::Value, Option<String>, axum::http::HeaderMap) {
    let mut req = Request::builder().method(method).uri(path).header(header::HOST, "mrp.test").header(header::ORIGIN, "https://mrp.test");
    if let Some(c) = cookie {
        req = req.header(header::COOKIE, c);
    }
    let req = match body {
        Some(b) => req.header(header::CONTENT_TYPE, "application/json").body(Body::from(b.to_string())).unwrap(),
        None => req.body(Body::empty()).unwrap(),
    };
    let res = r.clone().oneshot(req).await.unwrap();
    let status = res.status();
    let headers = res.headers().clone();
    let set_cookie = headers.get(header::SET_COOKIE).and_then(|v| v.to_str().ok()).map(|v| v.split(';').next().unwrap().to_string());
    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    let json = serde_json::from_slice(&bytes).unwrap_or(serde_json::Value::Null);
    (status, json, set_cookie, headers)
}

fn plan(n: usize) -> serde_json::Value {
    serde_json::json!({ "version": 1, "missions": vec![serde_json::json!({ "id": "m" }); n], "seasons": [] })
}

/// Set up the server and return the admin's cookie.
async fn admin(r: &Router) -> String {
    let (s, _, cookie, _) = call(r, "POST", "/api/setup", None, Some(serde_json::json!({ "username": "alex", "name": "Alex", "password": "correct horse battery" }))).await;
    assert_eq!(s, StatusCode::OK);
    cookie.unwrap()
}

async fn add_user(r: &Router, admin: &str, username: &str, role: &str) -> String {
    let (s, ..) = call(r, "POST", "/api/admin/users", Some(admin), Some(serde_json::json!({ "username": username, "name": username, "role": role, "password": "a long password 1" }))).await;
    assert_eq!(s, StatusCode::OK);
    let (s, _, cookie, _) = call(r, "POST", "/api/login", None, Some(serde_json::json!({ "username": username, "password": "a long password 1" }))).await;
    assert_eq!(s, StatusCode::OK);
    cookie.unwrap()
}

#[tokio::test]
async fn first_run_setup_only_once() {
    let (r, _) = app();
    let (_, j, ..) = call(&r, "GET", "/api/session", None, None).await;
    assert_eq!(j["needsSetup"], true);
    let c = admin(&r).await;
    let (_, j, ..) = call(&r, "GET", "/api/session", Some(&c), None).await;
    assert_eq!(j["user"]["role"], "admin");
    let (s, ..) = call(&r, "POST", "/api/setup", None, Some(serde_json::json!({ "username": "eve", "name": "", "password": "another long one" }))).await;
    assert_eq!(s, StatusCode::CONFLICT);
}

#[tokio::test]
async fn nothing_without_signing_in() {
    let (r, _) = app();
    admin(&r).await;
    let (s, ..) = call(&r, "GET", "/api/plan", None, None).await;
    assert_eq!(s, StatusCode::UNAUTHORIZED);
    let (s, ..) = call(&r, "GET", "/api/admin/users", None, None).await;
    assert_eq!(s, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn wrong_passwords_lock_the_name_for_a_while() {
    let (r, _) = app();
    admin(&r).await;
    for _ in 0..5 {
        let (s, ..) = call(&r, "POST", "/api/login", None, Some(serde_json::json!({ "username": "alex", "password": "nope nope nope" }))).await;
        assert_eq!(s, StatusCode::UNAUTHORIZED);
    }
    // Even the right password waits now.
    let (s, ..) = call(&r, "POST", "/api/login", None, Some(serde_json::json!({ "username": "alex", "password": "correct horse battery" }))).await;
    assert_eq!(s, StatusCode::TOO_MANY_REQUESTS);
}

#[tokio::test]
async fn saves_need_the_latest_version() {
    let (r, _) = app();
    let c = admin(&r).await;
    let (s, j, ..) = call(&r, "PUT", "/api/plan", Some(&c), Some(serde_json::json!({ "version": 0, "data": plan(1) }))).await;
    assert_eq!((s, j["version"].as_i64()), (StatusCode::OK, Some(1)));
    // A second save from the same starting point is refused, with the newer version.
    let (s, j, ..) = call(&r, "PUT", "/api/plan", Some(&c), Some(serde_json::json!({ "version": 0, "data": plan(2) }))).await;
    assert_eq!((s, j["version"].as_i64()), (StatusCode::CONFLICT, Some(1)));
    let (_, j, ..) = call(&r, "GET", "/api/plan", Some(&c), None).await;
    assert_eq!(j["data"]["missions"].as_array().unwrap().len(), 1);
    assert_eq!(j["updatedBy"], "Alex");
    // Not a plan at all.
    let (s, ..) = call(&r, "PUT", "/api/plan", Some(&c), Some(serde_json::json!({ "version": 1, "data": "hello" }))).await;
    assert_eq!(s, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn roles_decide_who_can_change_what() {
    let (r, _) = app();
    let a = admin(&r).await;
    let viewer = add_user(&r, &a, "sam", "viewer").await;
    let scheduler = add_user(&r, &a, "maya", "scheduler").await;
    let (s, ..) = call(&r, "GET", "/api/plan", Some(&viewer), None).await;
    assert_eq!(s, StatusCode::OK);
    let (s, ..) = call(&r, "PUT", "/api/plan", Some(&viewer), Some(serde_json::json!({ "version": 0, "data": plan(1) }))).await;
    assert_eq!(s, StatusCode::FORBIDDEN);
    let (s, ..) = call(&r, "PUT", "/api/plan", Some(&scheduler), Some(serde_json::json!({ "version": 0, "data": plan(1) }))).await;
    assert_eq!(s, StatusCode::OK);
    let (s, ..) = call(&r, "GET", "/api/admin/users", Some(&scheduler), None).await;
    assert_eq!(s, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn the_last_admin_stays() {
    let (r, app) = app();
    let a = admin(&r).await;
    let id: String = app.db.lock().unwrap().query_row("SELECT id FROM users WHERE username = 'alex'", [], |r| r.get(0)).unwrap();
    let (s, ..) = call(&r, "PATCH", &format!("/api/admin/users/{id}"), Some(&a), Some(serde_json::json!({ "role": "viewer" }))).await;
    assert_eq!(s, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn turning_someone_off_signs_them_out() {
    let (r, app) = app();
    let a = admin(&r).await;
    let viewer = add_user(&r, &a, "sam", "viewer").await;
    let id: String = app.db.lock().unwrap().query_row("SELECT id FROM users WHERE username = 'sam'", [], |r| r.get(0)).unwrap();
    call(&r, "PATCH", &format!("/api/admin/users/{id}"), Some(&a), Some(serde_json::json!({ "disabled": true }))).await;
    let (s, ..) = call(&r, "GET", "/api/plan", Some(&viewer), None).await;
    assert_eq!(s, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn other_sites_cant_post() {
    let (r, _) = app();
    let req = Request::builder()
        .method("POST")
        .uri("/api/login")
        .header(header::HOST, "mrp.test")
        .header(header::ORIGIN, "https://evil.example")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(r#"{"username":"a","password":"b"}"#))
        .unwrap();
    assert_eq!(r.clone().oneshot(req).await.unwrap().status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn cookies_and_headers_are_strict() {
    let (r, _) = app();
    let req = Request::builder().method("POST").uri("/api/setup").header(header::HOST, "mrp.test").header(header::ORIGIN, "https://mrp.test")
        .header(header::CONTENT_TYPE, "application/json")
        .body(Body::from(r#"{"username":"alex","name":"Alex","password":"correct horse battery"}"#)).unwrap();
    let res = r.clone().oneshot(req).await.unwrap();
    let cookie = res.headers().get(header::SET_COOKIE).unwrap().to_str().unwrap().to_string();
    assert!(cookie.contains("HttpOnly") && cookie.contains("SameSite=Strict"));
    assert!(res.headers().get("content-security-policy").unwrap().to_str().unwrap().contains("frame-ancestors 'none'"));
    assert_eq!(res.headers().get("x-frame-options").unwrap(), "DENY");
}
