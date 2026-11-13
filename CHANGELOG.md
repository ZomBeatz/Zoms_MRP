# Changelog

## Next version

**Crew**
- Each job says how many people its rotation takes, on its **Pilots** and **Maintainers** tabs and under the rotations on **Job requirements**: 2 at a time on 21 on, 7 off takes at least 3. It also says how many are rated and qualified.
- **Fill the schedule** staggers hitches when a job needs two or more at a time, so the crew don't all go off together and that many people cover every day.
- **Add a pilot** and **Add a maintainer** book one hitch from the first open day, instead of one person for the whole job. Tapping an open seat does the same from that seat.
- **Recency of experience** (Settings › Hitches and days off) has a **Check it** box to turn it off.

**Fixes**
- Fill no longer cuts a hitch short in the week the clocks change.

## 0.2.7

**Clients and jobs.** What was a job is now a **client** (the customer), and what was a season is now a **job** (one stretch of dates). Type of work is now **line of business**, and kind of contract is now **schedule limitations**. Your plan is kept as it was.

**Job requirements**
- A client's **Job requirements** tab holds the qualifications and equipment its jobs need, its schedule limitations, and the crew and rotations a new job starts with.
- Each job can use its client's requirements or have its own.
- A new client of a **line of business** starts with that line's requirements.
- Aircraft types can require qualifications: everyone rated on the type needs them.
- **Schedule limitations** cover the fewest and most days on, days off, duty hours, rest, flight hours a day and flight hours in so many days. The checks and Fill the schedule follow each job's.

**Crew**
- **Who can work it** on each job: who meets its requirements and how many of its days they're free, and what everyone else is missing. Book them onto the open days, or add them to the client's crew.

**Libraries**
- Qualifications have **nicknames** (NVG, HUET, 293), and there's a library of common ones.
- Settings › Lines of business has a library that adds a whole kind of work (fire, EMS, search and rescue, utilities, survey, tours, hangar on-call) with its qualifications, equipment and schedule limitations.
- The Qualifications page shows what every pilot and every maintainer needs.

**Fixes**
- **Updates:** the desktop app can update itself again. The 0.2.5 and 0.2.6 releases were missing their update file, so installed apps reported a JSON or offline error. Copies of 0.2.5 and 0.2.6 find 0.2.7 by themselves once it's published.
- Rotation boxes stay empty when you clear them.
- Jobs show their client's color everywhere they're listed.

## 0.2.6

The words change: a mission is now a **job**, training is **qualifications**, and maintenance items are **work orders**. Your plan is kept as it was.

**Fleet and aircraft**
- **Types & equipment** (new page): aircraft types, picked from a list when adding a tail, and the equipment each can carry (hoist, bucket, medical interior…). Each tail ticks what it has, each job what it needs, and a tail booked without it is flagged.
- Aircraft status means something now: **Airworthy**, **In maintenance** and **AOG** (with the day it went down and is expected back) keep a tail off jobs in between; **Retired** takes it out. Older saves: Ready → Airworthy, Grounded → AOG.
- Every tail has a **Log**: status changes with why, notes, and its work orders.
- The Fleet page opens on **Fleet status**: airworthy, in maintenance and AOG at a glance, and each tail's day, next booking and latest log line.

**Jobs**
- A season says **how many aircraft** it needs, each with a type, the tail when it's known, and its **own dates**.
- **Ground duty** jobs need no aircraft: hangar on-call, standby, any work on the ground.
- Customer **phone and email**, and **Documents** (PDFs and pictures show in the app).
- **Types of work** (Settings): each line of business has a color and its jobs get their own shades of it. 30 colors, your own color, and four more patterns.

**Qualifications and certificates**
- Certificates, licences, **medicals** and **check rides**, with numbers, issuer, class or ratings, scans, and expiry at the end of the month. One can be needed by every pilot or maintainer, whatever the job.
- Medicals follow the FAA periods from their class, the exam date and the pilot's **date of birth**, with limitations and special issuance.
- **Due and expired** (Qualifications) and **Certificates and medicals** (Overview) list what's missing, expired or running out.
- A certificate can be renewed by courses.

**Settings**
- **Costs** and **maintenance programs** are off unless you use them.
- **Backups** hold attached files. The desktop app saves them to a folder you pick, and can save one there every day; Chrome and Edge ask where to save.

## 0.2.5

Install this version by hand one last time: from here on, the desktop app updates itself.

**Updates**
- The desktop app can update itself. When it opens and every few hours while it's open, it looks for a newer published release, downloads it in the background, and installs it when you press **Restart now** on the note at the top (or **Later** to put it off). It saves everything and keeps a copy of the plan first, in `backups/before-<version>.json`.
- **Settings > About** has **Check for updates**, and a switch for downloading new versions by themselves.
- On Linux, a `.deb` or `.rpm` install gets a **Download** link instead, since the package manager owns it; the AppImage updates itself.
- Versions before this one don't update themselves: install this one by hand once.

## 0.2.4

**Crew planner**
- A **Crew planner** page works out how few pilots a job takes and the rotation that does it: put in the dates, each aircraft with its type, hours staffed a day and flight hours, and the rules. It shows the arithmetic in plain words, what one rule change would save, what one more pilot would buy, and the cost.
- Each aircraft type is planned on its own, since only rated pilots can fly it, and 24-hour aircraft can ask for a night-qualified pilot (pick the course, such as NVG).
- Start from a season (or **Work out the crew** on its Pilots tab) to pick real pilots for each line and **Book** it.
- **Several jobs** adds up the coming jobs, type by type, against the pilots rated on each.

**Work limits**
- **Flight-hour limits** per pilot, as many as you need (100 in 30, 1,000 in 365). The checks flag a pilot who'd go over, and Fill, Rebalance and the planner keep under them. A shift can take the **Flight hours flown** from the logbook. The Overview asks once whether your pilots have one.
- **Rest between duty days**: a season whose duty day leaves less is flagged.
- **Kinds of contract** (Settings): named days on and off, such as EMS or fire, that a mission can pick instead of the rules for everyone.
- **Restore a backup** now brings all of the plan's rules with it: flight-hour limits, rest, kinds of contract, maintenance and preferences.

**Fixes**
- The Crew planner no longer freezes on a very tight flight-hour limit (deleting 100 to type 49 passed through 1 hour in 30 days, which took minutes to work out). It now starts from the fewest pilots that could possibly do it, and gives up on the "what would change it" ideas it hasn't tried after a moment.
- **Book** in the Crew planner no longer books a pilot over their time off or another job. A picked pilot gets only the hitches they can take; the rest go to others the way Fill the schedule picks them (rated, current, free, rested, inside every limit), and what nobody can take stays open. The message says how it went, and each line warns which hitches will be handed on.
- A page or form that fails now says so, with Undo and a way back to the Overview, instead of a blank window that came back on every reload.

**Help**
- **Find** also finds pages and the Guide's topics and How do I… answers, with a link to each one's page in the online guide at docs.zombeatzmedia.com.
- New pages (Crew planner, Balance, Inspections) show a short note on where to start, with **Show me how** and the online guide. It goes away after a few visits, or when it's closed.
- The Guide links each section to the online guide, and has answers for working out a crew, setting a flight-hour limit and kinds of contract.

## 0.2.3

**Setting up and sharing**
- **Import from Excel or CSV** (Settings › Your data): people, aircraft, training courses and who has done which. **Download the import template** gives the headings, notes on each and examples. A preview shows what's added, updated (matched by name or tail) and skipped before anything changes.
- **Record a course for several people** at once, from the Training page or a course: pick the course and day, tick who attended (those who need it first).
- **Their schedule (PDF)** on a person: their next 90 days on a page, with handovers, notes, maintenance, time off and training.

**Schedule**
- Drag the middle of a shift (mouse or pen) to move it, or drop it on another person's row to give it to them, only if they can legally take it.
- Keys: ← → move through time, T jumps to today, + and − zoom.

**Missions**
- Tick several seasons in a mission to confirm, cancel or delete them together.

**Settings**
- **Preferences:** the week starts on Monday or Sunday, the currency symbol for costs, which pages show in the menu, and what a mission's first season starts with (crew sizes and rotation).


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
