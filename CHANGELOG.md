# Changelog

## 0.1.0

The first release of Zom's MRP, the Mission Ready Planner.

**Fleet**
- The **Fleet** page shows every tail over time, grouped by type: its missions, its maintenance in a row underneath, and the free windows in between. Click a free window to book a mission there.
- A row across the top shows how many aircraft are free each day.
- **Can we take a job?** checks dates, type, pilots and training against the whole fleet and crew. It says which tails can take it, and when a busy one is free next.

**Schedule**
- A Gantt chart with rows by aircraft, by mission (and the crew on it), or by person.
- Ctrl + scroll (or pinch) to zoom, anywhere from a week to a year. Drag, Shift + scroll or swipe sideways to move through time.
- Each mission has its own color and pattern. Open pilot seats show as red dashed slots, and anything with a problem gets a red outline.

**Missions and seasons**
- A mission is one customer's work, with its contact, look, the training it needs and the crew who work it.
- Its seasons are the stretches of dates it's flown, each on one aircraft (by tail number) with its own crew sizes and status. **Copy to next season** adds next year's dates in one click.
- **Rotate pilots every** splits a season into hitches and picks free, qualified, current pilots for each. **Fill open seats** covers the gaps.

**Crew, training and maintenance**
- Pilots and maintainers with the aircraft types they're qualified on, their training records, and time off.
- People only need the training of the missions they work. **Who's current** shows where everyone stands, and Zom's MRP warns before training runs out.
- Maintenance jobs book maintainers on an aircraft and can ground it.

**Overview and reports**
- The overview lists every open seat, double booking, missing qualification, expired training and too-long hitch. Click one to fix it.
- Reports show days per mission, aircraft use, how busy each person is, and how much mission time was fully crewed.
- **Export to Excel** (Reports, or Settings > Your data) makes one workbook to post in Teams or open anywhere.

**Desktop app**
- Installs on Windows, macOS and Linux with a double-click. The plan is saved in a file on that computer, with a copy kept every day for a month.
- **Settings > Excel copy for Teams** keeps an up-to-date Excel copy in a folder you pick, such as a Teams channel's folder synced by OneDrive.

**Server**
- A secure server for a team: everyone signs in to the same plan from their own browser.
- Admins add people as **Admin**, **Scheduler** (changes the plan) or **Viewer** (looks only), and see what's been happening in **Settings**.
- Two people saving at once can't overwrite each other, and changes others save show up on their own.
- Sign-in is locked for 5 minutes after 5 wrong passwords. The server keeps a copy of everything every day.
- Runs with Docker, behind Caddy for https.

**Also**
- An online demo at zombeatz.github.io/Zoms_MRP, with made-up data from an operator in Alaska.
- Demo data you can switch on and off in **Settings > Demo data**, kept apart from your own.
- Light and dark themes, backups, undo, and the usual ZomBeatz shortcuts.
