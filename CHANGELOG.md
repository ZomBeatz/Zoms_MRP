# Changelog

## 0.2.1

**The app opens empty**
- The app (desktop, web and server) opens straight to an empty plan, with the setup steps on the Overview: aircraft, training, pilots, maintainers, missions, and a link to the Guide.
- The Guide is in the app; its hands-on lessons and tours, and the demo data, are only in the online demo for now. Any demo kept on the device is removed.

**Reports**
- **PDF report** and **Excel report** on the Reports page, for any period: the ready-made ones or **Pick dates** for your own first and last day.
- The PDF has a summary page (the numbers, days by mission, aircraft free each day and each tail's use), the fleet and crew boards colored like the app, the missions with how well each is crewed, crew workload, a training grid (people down the side, courses across), maintenance and problems. It looks the same from every version, the Mac app included.
- The Excel report has the same parts as sheets: tiles and in-cell bars on the summary, the boards colored day by day (week by week for long periods), and every sheet printing landscape, one page wide.
- The old **Print** buttons on Reports and the Schedule are gone; the reports replace them.

**Mac**
- One Mac app for Apple silicon and Intel, macOS 10.15 or later. It's ad-hoc signed, so it opens after **Privacy & Security > Open Anyway** once; the README explains how, and how to sign and notarize it with an Apple Developer account.

**Learn it step by step** (in the online demo)
- Six hands-on lessons in the Guide: add a training course, add an aircraft, add a pilot, a customer calls with dates, a pilot calls in sick, and a job needs another aircraft. Each step says what to tap and moves on once it's done; **Do it for me** does it instead.
- Finished lessons and tours are ticked off, and each lesson ends with **Take a break** or the next one.
- Every lesson and tour starts on a fresh demo and puts it back when it's over.
- On a phone the lesson card is small: just what to tap and the buttons, with **Why?** for the explanation.
- The page can be scrolled and used while a tour runs, and its card can be made small to see what's under it.

**Easier to use**
- Save is never greyed out: if something's missing, it says what. Delete asks once more.
- A mission's Crew tab shows who's on it, who could join, and folds away people not rated on its aircraft.
- On a phone: the demo banner is one slim line, summary numbers sit two to a row, and time off, training courses and maintenance show as lists.
- The Guide adds a setup checklist for your own data, a list of the words Zom's MRP uses, and how to undo mistakes.
- "Can we take a job?" no longer repeats a reason.
- The Guide has a **How do I…** section with step-by-step answers to everyday jobs (more days for a customer, swapping a pilot, someone off sick, a broken aircraft, a renewed course, next year's booking, sharing the plan, getting around on a phone) and a key to what the colors mean.

**Fixes**
- Going from a mission's form into one of its seasons (or from a person into their time off) and back no longer loses what you'd typed, and it comes back on the tab you were on.
- When nobody qualified is free for an open seat, the message says how to pick someone anyway.
- On a phone, buttons, tabs, chips and tick boxes are big enough to tap, and text boxes no longer make the phone zoom in.
- Number boxes can be cleared and typed again; they settle when you leave them instead of jumping to 1 while you type.
- The − and + buttons beside numbers in forms were squeezed thin; they're full size again.
- A month the chart only shows a few days of gets a short name instead of a cut-off one.
- "Click" is now "Tap" where it's about pressing something on screen.
- On a tablet, missions, crew, maintenance and training show as cards two across instead of cramped tables, and the demo banner fits on one line.
- With nothing set up yet, the Overview has a **Getting started** card that leads to the setup steps.
- The demo banner says **Guide and lessons**.
- A phone turned sideways gets the phone layout too: the menu button, full-screen forms and the small lesson card.
- The Fleet page draws about three times faster.
- On a phone or tablet, opening a form no longer jumps into its first text box and pops up the keyboard.

## 0.2.0

**Rotations**
- Each season has a pilot rotation and a maintainer rotation, like 21 days on, 14 off. They can differ.
- **Fill the schedule** rotates free, rated, current people through the open days on that pattern, the mission's own crew first. **Start over** does it again from scratch.
- People can work a fixed rotation of their own (days on, days off, from a first day). They're only offered for shifts on their on days, their days off are shaded on the schedule, and booking them on one is flagged.

**Jobs**
- A season can have several aircraft, added when they're known. Pilots and maintainers needed are for the whole job at any time.
- The people offered for a shift are only those who can take it: rated on one of the job's aircraft, current on its training, free and on rotation. **Show everyone** lists the rest.

**Guide and walkthroughs**
- A **Guide** page explains how every part works and how Zom's MRP is meant to be used, from setting up the fleet to a customer calling with dates. Press **?** to open it.
- Seven tours run over the demo data and show one thing at a time: the big picture, adding a mission, taking a new job, crewing a job on a rotation, closing coverage gaps, keeping training current and planning maintenance.

**Forms**
- Seasons, missions and people open in tabs (a season's details, pilots, maintainers and problems), with a red dot on any tab that needs a look. The title, a summary line and the Save button stay in view; only the middle scrolls.
- Each shift is one line: who and when. Tap it to change or remove it. Open seats sit in the list in date order; tap one to put someone on those days.
- Aircraft on a job are tags you add and remove, crew counts have − and + buttons, and first and last day sit side by side, even on a phone.
- A person's training is one line per course. Older records that were renewed are greyed out instead of showing as run out.
- On a phone, forms fill the screen and messages stay clear of the buttons.
- The back button (a phone's too) steps back through what you opened: from a season to its mission, then to the page before, instead of leaving the app.

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
