# Security

Zom's MRP Server holds a team's operating plan: aircraft, crew, training records and contacts. This is what it does to keep that to the people who should see it.

## Signing in

- Accounts are made by an admin. There's no sign-up page. The first account (the admin) is made on a brand-new server by whoever opens it first, so **open it and create the admin as soon as it's running**.
- Passwords are at least 10 characters and stored only as Argon2id hashes.
- After 5 wrong passwords, that username can't sign in for 5 minutes. Unknown usernames take as long to answer as known ones.
- Sessions are random 256-bit tokens, stored on the server only as hashes. The cookie is `HttpOnly`, `SameSite=Strict`, and `Secure` over https. You're signed out after 14 days without using it, and after 60 days in any case.
- Changing a password, an admin setting a new one, or turning an account off signs that person out everywhere.

## Roles

| Role | Can |
|---|---|
| Admin | Everything, plus who has access, the activity log and backups |
| Scheduler | Change the plan |
| Viewer | Look only |

The server checks the role on every request; hiding buttons in the app is only a convenience. There's always at least one admin: the last one can't be removed, turned off or demoted.

## In the browser

- Changes are only accepted from the server's own pages (same-origin check on top of `SameSite` cookies).
- A strict content policy allows only the server's own scripts, plus the one small inline script that picks light or dark before the page draws (allowed by its hash). The page can't be framed by other sites.
- `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` and, over https, `Strict-Transport-Security` are set on every response. API answers are never cached.

## https

Run it behind https. The included `docker-compose.yml` puts Caddy in front, which gets and renews a Let's Encrypt certificate by itself; Zom's MRP itself isn't exposed. You can also give the server your own certificate files (`MRP_TLS=files`). Over plain http, the server says so when it starts.

## Data

- One SQLite database in the data folder (the `mrp-data` Docker volume), with a copy made every day (the last 30 kept) in `backups`. Admins can download a copy from Settings.
- Saves carry a version number, so two people saving at once can't overwrite each other.
- The activity log records sign-ins, wrong passwords, account changes and who changed the plan.

## Reporting a problem

Please email info@zombeatzmedia.com rather than opening a public issue.
