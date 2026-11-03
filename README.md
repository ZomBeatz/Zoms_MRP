<p align="center">
  <img src="branding/mrp-icon.svg" width="120" alt="Zom's MRP by ZomBeatz Media">
</p>

<h1 align="center">Zom's MRP</h1>

<p align="center">
  Zom's MRP (Mission Ready Planner) schedules helicopter missions, crews and maintenance in one place.<br>
  Put aircraft on missions by tail number, rotate pilots through hitches, and keep training current.<br>
  Zom's MRP shows every gap and conflict before it becomes a problem.
</p>

## Quick start

**Just want to look around?** Try the [online demo](https://zombeatz.github.io/Zoms_MRP/). It runs in your browser with made-up data.

1. Download Zom's MRP for your computer from the [latest release](https://github.com/ZomBeatz/Zoms_MRP/releases/latest): **Windows** (`.exe`), **Mac** (`.dmg`) or **Linux** (`.deb`, `.rpm` or `.AppImage`).
2. Install it with a double-click and open it.
3. Choose **Try it with demo data** to look around, or **Start empty** to plan your own operation.

The **Guide** in the sidebar (or **?**) explains every part, and its walkthroughs take you through the demo one step at a time.

Everything stays on that computer. For a team, see [Server](#server) below.

## What it does

Like a fleet board, a crew roster and a Gantt chart in one, with the checks built in.

| | |
|---|---|
| **Fleet** | Every tail over time, grouped by type: its missions, maintenance and free windows, how many aircraft are free each day, and **Can we take a job?** to see which tails and crew could do new work. |
| **Schedule** | A Gantt chart by aircraft, mission or person, narrowed to one mission from a list. The crew view puts open seats on top, with who's on the job and who else is rated and current. Drag to move through time, and Ctrl + scroll (or pinch) to zoom from a week to a year. Each mission has its own color and pattern. |
| **Missions** | One customer's work, with the training it needs and the crew who work it. Its seasons hold the dates, one or more aircraft (by tail number), and how many pilots and maintainers the job needs at any time. **Copy to next season** books next year in one click. |
| **Rotations** | Each job has a pilot and a maintainer rotation (say 21 on, 14 off); **Fill the schedule** rotates free, rated, current people through it. People can have a fixed rotation of their own and are only offered on their on days. |
| **Crew** | Pilots and maintainers, the aircraft types they're qualified on, time off, and their training records. |
| **Training** | Courses that need renewing, set by each mission. People only need what their missions ask for, and "Who's current" shows where everyone stands. |
| **Maintenance** | Jobs on an aircraft with the maintainers on them. A job can ground the aircraft. |
| **Overview** | Every open seat, double booking, missing qualification, expired training and too-long hitch, with a click to fix it. |
| **Reports** | Days per mission, aircraft use, how busy each person is, and how much mission time was fully crewed. Print it, or **Export to Excel** to share in Teams. |

## What people use it for

| | |
|---|---|
| **Contracts** | Fire season standby, medevac standby, utility patrol, survey work, lifts |
| **Crew** | 14-day hitches, seat coverage, days off, qualifications by type |
| **Fleet** | Who's flying which tail, inspections, repairs, aircraft use |
| **Training** | NVG, mountain flying, over water, renewals coming up |

## Server

For a team: everyone signs in to the same plan from their own browser. Admins decide who has access.

- Accounts with roles: **Admin** (manages people), **Scheduler** (changes the plan), **Viewer** (looks only).
- Two people saving at once can't overwrite each other, and changes others make show up on their own.
- Locked after repeated wrong passwords, an activity log, and a copy of everything every day.
- **Export to Excel** for anyone who'd rather see it in Teams.

**With Docker** (any Linux server or VPS, with a domain name pointed at it): put your domain in `deploy/Caddyfile`, then

```bash
docker compose up -d
```

Open `https://your-domain` and create the admin account right away. Caddy gets the https certificate by itself. More in [SECURITY.md](SECURITY.md).

## Questions

<details>
<summary><b>Where is my data saved?</b></summary>

In the desktop app, in a file in the app's data folder on that computer, with a copy kept every day for a month. On the server, in the server's database. In a browser, in that browser's storage. Use **Settings > Your data > Save a backup** now and then.
</details>

<details>
<summary><b>How do I share the plan in Teams?</b></summary>

**Export to Excel** (Reports or Settings) makes a workbook to post in a channel. In the desktop app, **Settings > Excel copy for Teams** keeps one up to date in a folder: pick a Teams channel's folder that OneDrive syncs, and the team always has the latest.
</details>

<details>
<summary><b>Windows or macOS warns about the installer</b></summary>

The installers aren't signed with a paid certificate yet. On Windows choose **More info > Run anyway**; on a Mac, right-click the app and choose **Open**.
</details>

<details>
<summary><b>Does the demo touch my own data?</b></summary>

No. The demo is kept apart. Turn it off in **Settings > Demo data** (or **Use my own data** on the banner) and your own data comes back as you left it.
</details>

<details>
<summary><b>How does it decide someone can't fly a mission?</b></summary>

They need to be qualified on the aircraft's type, free (not booked elsewhere or on time off), and current on the training the mission needs, for the whole of their hitch. Hitch length and days off come from **Settings > Hitches and days off**.
</details>

<details>
<summary><b>Can several people use it at once?</b></summary>

Yes, with the server (above). Everyone signs in to the same plan. On one computer, use the app on its own and **Export to Excel** to share it.
</details>

<details>
<summary><b>I forgot the admin password</b></summary>

On the server, run `docker exec -it mrp zoms-mrp-server reset-password <username>` and type a new one.
</details>

## For developers

<details>
<summary><b>Running from source, tests and project layout</b></summary>

```bash
npm install
npm run dev      # http://localhost:1430
npm test         # coverage and conflict checks
npm run build    # type-check and build into dist/
npm run build:server && cargo test --manifest-path server/Cargo.toml   # the server
```

- `src/types.ts`: the data model. `src/store.ts`: state, saving, undo and the demo slot. `src/migrate.ts`: opens saves from older versions.
- `src/bookings.ts`: each season joined with its mission, which the pages and checks work with.
- `src/coverage.ts`: every check (gaps, conflicts, qualifications, training, hitches), with tests next to it.
- `src/fleet.ts`: what each tail is doing day by day, free windows, and whether the fleet can take a job (tests next to it).
- `src/components/timeline.tsx`: the drag, scroll and zoom shared by the Schedule and the Fleet page.
- `src/pages/`: Overview, Fleet, Schedule (the Gantt chart), Missions, Crew, Maintenance, Training, Reports, Settings.
- `src/tour.tsx`: the walkthroughs over the demo. `src/pages/Guide.tsx`: the guide.
- `src/sample.ts`: the demo, an operator in Alaska over the past and next 12 months.
- `src/dialogs.tsx`: the forms for each kind of item.
- `src/tokens.css`: the ZomBeatz design tokens.
- `src/backends/`: where the data is kept: this browser, this computer (desktop app) or the server.
- `src/excel.ts`: **Export to Excel**.
- `server/`: the server (Rust: axum and SQLite), with the web app built in. `Dockerfile` and `docker-compose.yml` package it with Caddy.
- `src-tauri/`: the desktop app (Tauri 2). `npm run app` runs it; `npm run bundle` makes the installer.
</details>

## License

MIT. See [LICENSE](LICENSE).

## Contact

info@zombeatzmedia.com
