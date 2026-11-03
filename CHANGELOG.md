# Changelog

## 0.2.0

**Rotations**
- Each season has a pilot rotation and a maintainer rotation, like 21 days on, 14 off. They can differ.
- **Fill the schedule** rotates free, rated, current people through the open days on that pattern, the mission's own crew first. **Start over** does it again from scratch.
- People can work a fixed rotation of their own (days on, days off, from a first day). They're only offered for shifts on their on days, their days off are shaded on the schedule, and booking them on one is flagged.

**Jobs**
- A season can have several aircraft, added when they're known. Pilots and maintainers needed are for the whole job at any time.
- The people offered for a shift are only those who can take it: rated on one of the job's aircraft, current on its training, free and on rotation. **Show everyone** lists the rest.

**Forms**
- Seasons, missions and people open in tabs (a season's details, pilots, maintainers and problems), with a red dot on any tab that needs a look. The title, a summary line and the Save button stay in view; only the middle scrolls.
- Each shift is one line: who and when. Tap it to change or remove it. Open seats sit in the list in date order; tap one to put someone on those days.
- Aircraft on a job are tags you add and remove, crew counts have − and + buttons, and first and last day sit side by side, even on a phone.
- A person's training is one line per course. Older records that were renewed are greyed out instead of showing as run out.
- On a phone, forms fill the screen and messages stay clear of the buttons.

**Schedule**
- Pick a mission from a list to narrow the schedule to it.
- The crew view shows open seats at the top. With a mission picked, it shows who's on the job, then who else is rated and current.

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
