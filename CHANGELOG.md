# Changelog

## Not released yet

**Balance**
- A **Balance** page shows how busy everyone is over the next 30 days, 90 days or 6 months: each person's share of the days they can work (time off doesn't count), colored from hardly used to very busy.
- Try other crew sizes for any job (say 2 pilots down to 1) and **Rebalance**: it keeps the shifts that are there, fills open seats and starts over for the jobs you changed, or for every job. Before and after: open seat-days, conflicts and the busiest person, with a line on each bar where they are now. Nothing changes until **Apply**, which has Undo.
- Lock jobs or people to keep them as they are.

**Work limits**
- A person, a mission and a season can each have their own most days on in a row and fewest days off. The safest wins; a season can **Override** the mission and Settings, but a person's own limits always apply. The checks, Fill the schedule and Rebalance all follow them.

**Inspections and flight hours**
- An **Inspections** page with each aircraft type's maintenance program: inspections every so many flight hours and/or months, whichever comes first, how long they take and whether they ground it.
- Flight hours: type a tail's hours when you have them; in between, mission days × hours per flying day carry them forward.
- **Due** shows every tail's inspections, last done, when due and whether planned. **Plan it** books one in the latest free days before it's due; **Record last done** starts the count. Overdue and due-soon ones show under Needs attention and on an Overview tile.
- **Settings › Maintenance programs** turns it off (for anyone with another system) or plans due inspections automatically.

**Training and problems**
- Training dates have a **Today** button.
- **Extend it** keeps training current until a later day, with a reason (someone on a long job who can't get back for the renewal). It shows as Extended wherever it does.
- Any problem can be **Ignored** with a reason; **Show ignored** lists them, with Restore.

**Missions: crew and rotations**
- A mission's **Rotations** tab shows each running or coming season's hitches in order: who, when, handovers and open seats. **Fill from the crew** uses only the people picked on its Crew tab.
- **Sub in someone else** on an open seat proposes people outside the crew who are rated, current, free and rested, for as much of it as they can legally cover, and books them in one tap, marked Sub.

**Currency and training**
- Pilot currency: days since each pilot last flew each type, from the schedule or a "last flew" date typed on their Ratings. A booking past the limit (Settings, 90 days) is a warning, and Fill won't book a pilot who isn't current. Without a record, it doesn't nag.
- The Training page has a **Needs training** list with only the people who have training missing, run out or running out, or who aren't current on a type, each opening right at the fix.

**Notes and preferences**
- Shifts can have a note ("Bring the cold-weather kit"), shown on the Schedule bar and in the season.
- Time off can be **only a preference**: they'd rather not work those days but can be booked. Fill and Rebalance book someone else when they can, it's never a problem if they're booked anyway, and it shows lighter on the Schedule.

**Swaps**
- **Trade…** on a person's Booked next opens a swap: hand the shift to someone who can legally take it (crew first), or trade it for one of theirs where each can take the other's. One tap, with Undo.

**Week sheet**
- **Week sheet** on Reports makes a one-page PDF of this week or next: each job's crew day by day (» where someone takes over), open seats in red, and time off and maintenance that week. For the crew room or Teams.

**Cost and duty days**
- Day rates on people, cost per flight hour on aircraft and charge per day on missions (all optional) give each mission's crew and flying cost, total, charge and margin on Reports and in the Excel report.
- A season can set its hours on duty in a day; longer than the most in Settings (14) is flagged.

**Drag to change dates**
- On the Schedule, drag either end of someone's shift (the cursor turns into ↔) to move their first or last day, like trimming a clip. It snaps to whole days, shows the new date while you drag, and Undo is in the message.
- Handovers move together: when one person takes over from another on the same job (marked ⇄), dragging that end moves both, so the seat stays covered. Fill the schedule links who takes over from whom, so with two pilots swapping the same day the right one moves; if it can't tell, only the dragged shift moves. Hold Alt (Option) to move just one.
- Pilots stay inside their season and every shift keeps at least a day; maintainers can come early or stay late.

**Also**
- A person's form shows where they're **booked next**, each opening right at that shift.
- **Find** anything by name (Ctrl or ⌘ K, or the search button): people, tails, missions and seasons, jobs and courses.
- A form with unsaved changes asks **Discard the changes you made?** before Cancel, ✕ or Esc throw them away.
- Balance, Reports and Inspections remember the period or tab you last picked.

**Fill the schedule follows the rules more closely**
- It never books a stretch longer than the most days on in a row, counting bookings either side; it leaves the minimum days off before and after; and it stops at the open days instead of putting more people on than there are seats.

## 0.2.2

**Fixing problems**
- Every problem has a button for its fix that opens the right form, on the right tab, scrolled to what needs changing and outlined in red: an open seat, a shift to swap someone out of, the course to record, the rating to add, the aircraft or dates to change. When there's another way out, it has its own button too ("Pick another aircraft" or "Move the maintenance").
- A season's own Problems tab fixes things in place: it switches to the tab and points instead of opening the season again.
- When nobody can take an open seat, the season says why for the people closest to it (not rated on the type, training run out, time off, off rotation) with a button to fix each.
- The Overview's problem list has **Show all** instead of stopping at ten.

**Confirming**
- **Confirm** buttons on planned seasons: on the Overview's Coming up, the Missions page and a mission's seasons, with Undo. In a season, the status is a row of buttons, and a planned one has **Confirm** at the top.

**Safer**
- **Clear all data** says exactly what it deletes, offers a backup first, and needs DELETE typed before it goes.

**Picking dates**
- Every date has a calendar beside it: a month at a time with big days to tap, the chosen days shaded, and the number of days shown. Tap the first day, then the last.
- Days that can't be picked are greyed out: the last day can't be before the first, and a pilot's shift stays inside its season.

**Aircraft**
- A season's aircraft are tail numbers to tap, grouped by type, each saying whether it's free for the season's dates or what it's busy with, instead of a drop-down.
- An aircraft's form lists every pilot and maintainer to rate on its type with a tap, so "not rated" is fixed where the aircraft is.

**Maintainers when they're needed**
- Each season picks when it needs maintainers: **All the time**, **Days a week** (like 2 days each week), **Start and end** (set-up and tear-down days), or **On call** (never a gap). Problems and **Fill the schedule** follow the choice.

**Inspections and maintenance**
- A new job offers **Start from** buttons: the jobs you've planned before, with their usual length, kind and grounding, and common starters (100 hour, annual and phase inspections, engine change, pre-flight).
- **Who's doing it** says to tap the maintainers, lists free ones rated on the aircraft first, and offers **Add a maintainer** when there are none. A job with nobody on it opens right there.
- The Guide explains how to plan an inspection and put maintainers on it.

**Safer, easier**
- Clicking outside a form no longer closes it and loses what was typed; Cancel, ✕ or Esc do.

**Desktop app**
- Saving to Downloads works: **Save a backup**, **Export to Excel** and the PDF and Excel reports all failed in the installed app, because it wasn't allowed to save there.
- **Settings › Your data** shows the folder the plan is kept in, and **Open folder** shows the file in Finder or Explorer.

## 0.2.1

**The app opens empty**
- The app (desktop, web and server) opens straight to an empty plan, with the setup steps on the Overview: aircraft, training, pilots, maintainers, missions, and a link to the Guide.
- The Guide is in the app; its hands-on lessons and tours, and the demo data, are only in the online demo for now. Any demo kept on the device is removed.

**Reports**
- **PDF report** and **Excel report** on the Reports page, for any period: the ready-made ones or **Pick dates** for your own first and last day.
- The PDF has a summary page (the numbers, days by mission, aircraft free each day and each tail's use), the fleet and crew boards colored like the app, the missions with how well each is crewed, crew workload, a training grid (people down the side, courses across), maintenance and problems. It looks the same from every version, the Mac app included.
- The Excel report has the same parts as sheets: tiles and in-cell bars on the summary, the boards colored day by day (week by week for long periods), and every sheet printing landscape, one page wide.
- The old **Print** buttons on Reports and the Schedule are gone; the reports replace them.

**Moving a plan**
- **Restore a backup** brings the plan's hitch limits and training warning days with it, so a plan moved from the desktop app to a server (or back) keeps its rules. Theme and layout stay each device's own.

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
