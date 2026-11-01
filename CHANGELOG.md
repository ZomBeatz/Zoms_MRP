# Changelog

## 0.2.0

**Fleet**
- A new **Fleet** page shows every tail over time, grouped by type, with its missions, maintenance and free windows. Click a free window to book a mission there.
- A row across the top shows how many aircraft are free each day.
- **Can we take a job?** checks dates, type, pilots and training against the whole fleet and crew. It says which tails can take it, and when a busy one is free next.

**Schedule**
- Ctrl + scroll (or pinch) to zoom, anywhere from a week to a year. Drag, Shift + scroll or swipe sideways to move through time; plain scrolling moves up and down the rows.
- The Aircraft view comes first.

**Training**
- Each mission sets the training it needs. Areas are gone; older saves keep their training on the missions.
- Missions have a crew who work them, and people only need the training of the missions they work. **Who's current** shows "Not needed" for the rest, and can show just one mission's crew.
- Zom's MRP warns when training someone needs has run out without a renewal booked.

**Missions and seasons**
- A mission is now one customer's work, with its name, contact, look, training and crew in one place. Its dates are its seasons, each with its own aircraft, crew sizes, status and shifts.
- **Copy to next season** adds next year's dates in one click, ready to crew.
- Renaming a mission renames every season, and saves from earlier versions are converted automatically.

**Sharing**
- **Export to Excel** (Reports, or Settings > Your data) makes one workbook to post in Teams or open anywhere: a fleet board by week in mission colors, fleet use, seasons, the crew roster, training, maintenance and the problems Zom's MRP found.
- An online demo, with the Alaska data, that anyone can try in their browser.

**Also**
- Maintenance has its own thin row under each tail on the Fleet page, and any maintenance takes the day out of a free window.
- Click the logo to go back to the Overview.
- Zom's MRP is now the Mission Ready Planner, with a new icon: schedule bars between the headphones.
- The demo is an operator in Alaska: 12 tails, 34 pilots, 12 maintainers and 20 kinds of work, with the past 12 months as history and the next 12 months planned.

## 0.1.0

**Schedule**
- A Gantt chart of every mission, with rows by mission (and the crew on it), by aircraft, or by person.
- Show a week, 2 weeks, a month or a quarter. Click empty space on a mission or aircraft row to add a mission there.
- Each mission has its own color and pattern, so missions are easy to tell apart, even in print.
- Open pilot seats show as red dashed slots, and anything with a problem gets a red outline.

**Missions**
- A mission is one customer's job, for days or months, on one aircraft by tail number.
- Set how many pilots must be on board and how many maintainers are on call.
- Rotate pilots in hitches: **Rotate pilots every** splits the mission into hitches and picks free, qualified, current pilots for each. **Fill open seats** covers the gaps.

**Crew, aircraft and maintenance**
- Pilots and maintainers with the aircraft types they're qualified on, and time off.
- Maintenance jobs book maintainers on an aircraft, and can ground it.

**Training**
- Courses that need renewing, records for each person, and areas that require training.
- **Who's current** shows everyone's standing at a glance.

**Overview and reports**
- The overview lists every gap and conflict. Click one to fix it.
- Reports show days per mission, aircraft use, how busy each person is, and how much mission time was fully crewed. Export to CSV or print.

**Also**
- Demo data you can switch on and off in **Settings > Demo data**, kept apart from your own.
- Light and dark themes, backups, undo, and the usual ZomBeatz shortcuts.
