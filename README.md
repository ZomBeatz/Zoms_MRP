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

**Just want to look around?** Start it and pick **Try it with demo data**.

1. Install [Node.js](https://nodejs.org) 22 or newer.
2. In this folder, run `npm install`, then `npm run dev`.
3. Open http://localhost:1430 and choose **Start empty** or **Try it with demo data**.

Everything is saved in your browser on this computer.

## What it does

Like a fleet board, a crew roster and a Gantt chart in one, with the checks built in.

| | |
|---|---|
| **Fleet** | Every tail over time, grouped by type: its missions, maintenance and free windows, how many aircraft are free each day, and **Can we take a job?** to see which tails and crew could do new work. |
| **Schedule** | A Gantt chart by aircraft, mission or person. Drag to move through time, and Ctrl + scroll (or pinch) to zoom from a week to a year. Each mission has its own color and pattern. |
| **Missions** | One customer's work, with the training it needs and the crew who work it. Its seasons hold the dates, aircraft (by tail number), pilots on board and maintainers on call. **Copy to next season** books next year in one click. |
| **Rotations** | Pilots rotate in hitches. **Rotate pilots every** splits a season into hitches and picks free, qualified, current pilots. |
| **Crew** | Pilots and maintainers, the aircraft types they're qualified on, time off, and their training records. |
| **Training** | Courses that need renewing, set by each mission. People only need what their missions ask for, and "Who's current" shows where everyone stands. |
| **Maintenance** | Jobs on an aircraft with the maintainers on them. A job can ground the aircraft. |
| **Overview** | Every open seat, double booking, missing qualification, expired training and too-long hitch, with a click to fix it. |
| **Reports** | Days per mission, aircraft use, how busy each person is, and how much mission time was fully crewed. Export to CSV or print. |

## What people use it for

| | |
|---|---|
| **Contracts** | Fire season standby, medevac standby, utility patrol, survey work, lifts |
| **Crew** | 14-day hitches, seat coverage, days off, qualifications by type |
| **Fleet** | Who's flying which tail, inspections, repairs, aircraft use |
| **Training** | NVG, mountain flying, over water, renewals coming up |

## Questions

<details>
<summary><b>Where is my data saved?</b></summary>

In your browser's storage on this computer. Use **Settings > Your data > Save a backup** now and then. Clearing the browser's site data removes it.
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

Not yet. For now it runs on one device.
</details>

## For developers

<details>
<summary><b>Running from source, tests and project layout</b></summary>

```bash
npm install
npm run dev      # http://localhost:1430
npm test         # coverage and conflict checks
npm run build    # type-check and build into dist/
```

- `src/types.ts`: the data model. `src/store.ts`: state, saving, undo and the demo slot. `src/migrate.ts`: opens saves from older versions.
- `src/bookings.ts`: each season joined with its mission, which the pages and checks work with.
- `src/coverage.ts`: every check (gaps, conflicts, qualifications, training, hitches), with tests next to it.
- `src/fleet.ts`: what each tail is doing day by day, free windows, and whether the fleet can take a job (tests next to it).
- `src/components/timeline.tsx`: the drag, scroll and zoom shared by the Schedule and the Fleet page.
- `src/pages/`: Overview, Fleet, Schedule (the Gantt chart), Missions, Crew, Maintenance, Training, Reports, Settings.
- `src/sample.ts`: the demo, an operator in Alaska over the past and next 12 months.
- `src/dialogs.tsx`: the forms for each kind of item.
- `src/tokens.css`: the ZomBeatz design tokens.
</details>

## License

MIT. See [LICENSE](LICENSE).

## Contact

info@zombeatzmedia.com
