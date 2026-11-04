import { addMonths, format } from "date-fns";
import type { Aircraft, AppData, MaintenanceJob, ProgramItem } from "./types";
import { dayUser } from "./fleet";
import { dayAt, ms, toWhen, today, uid } from "./time";

/**
 * Maintenance programs: each aircraft type's inspections, every so many flight hours and/or months,
 * whichever comes first. Flight hours come from the last reading typed in for a tail, carried forward
 * (or back) by its mission days × average hours per flying day. An inspection was last done when a job
 * with the same name on that tail finished (ticked Finished, or its last day has passed).
 */

const DAY_LIMIT = 3 * 366;
const sameTitle = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Average flight hours on a day the tail flies a mission. */
export const hoursPerDay = (data: AppData, a: Aircraft) => (a.hoursPerDay && a.hoursPerDay > 0 ? a.hoursPerDay : data.settings.maintenance.hoursPerDay);

/** Flight hours on the airframe at midnight `t`, or null without a reading. Rounded to tenths. */
export function flightHours(data: AppData, a: Aircraft, t: number): number | null {
  if (!a.hours) return null;
  const read = ms(`${a.hours.on}T00:00`);
  const use = dayUser(data, a);
  const rate = hoursPerDay(data, a);
  const [from, to, sign] = t >= read ? [read, t, 1] : [t, read, -1];
  let flying = 0;
  for (let d = from, n = 0; d < to && n < DAY_LIMIT; d = dayAt(d, 1), n++) if (use(d).kind === "mission") flying++;
  return Math.round((a.hours.hours + sign * flying * rate) * 10) / 10;
}

/** The first midnight after `from` when the tail reaches `target` hours, counting its mission days (booked ones ahead), within three years. */
function whenHours(data: AppData, a: Aircraft, target: number, from: number, start: number): number | null {
  const use = dayUser(data, a);
  const rate = hoursPerDay(data, a);
  let h = start;
  for (let d = from, n = 0; n < DAY_LIMIT; d = dayAt(d, 1), n++) {
    if (use(d).kind === "mission") h += rate;
    if (h >= target) return dayAt(d, 1);
  }
  return null;
}

export type DueState = "overdue" | "soon" | "planned" | "ok" | "unknown";

export interface Due {
  aircraft: Aircraft;
  item: ProgramItem;
  /** The last finished job with this name on the tail. */
  last?: MaintenanceJob;
  /** A job with this name coming up (not finished, not over). */
  planned?: MaintenanceJob;
  /** When it's due, and what makes it due first. */
  at: number | null;
  by: "hours" | "months" | null;
  hoursNow: number | null;
  hoursDue: number | null;
  state: DueState;
}

const cache = new WeakMap<AppData, Due[]>();

/** Every tail's program items: last done, when due, and where it stands. */
export function dueList(data: AppData): Due[] {
  const hit = cache.get(data);
  if (hit) return hit;
  const now = today().getTime();
  const soon = dayAt(now, data.settings.maintenance.dueSoonDays);
  const out: Due[] = [];
  for (const a of data.aircraft.filter((x) => x.status !== "Retired")) {
    for (const item of data.programs.filter((p) => p.type === a.type)) {
      const jobs = data.jobs.filter((j) => j.aircraftId === a.id && sameTitle(j.title, item.title));
      const last = jobs.filter((j) => j.done || ms(j.end) <= now).sort((x, y) => ms(y.end) - ms(x.end))[0];
      const planned = jobs.filter((j) => !j.done && ms(j.end) > now).sort((x, y) => ms(x.start) - ms(y.start))[0];
      const hoursNow = flightHours(data, a, now);
      let at: number | null = null, by: Due["by"] = null, hoursDue: number | null = null;
      if (last) {
        const doneAt = ms(last.end);
        if (item.everyMonths) {
          at = addMonths(doneAt, item.everyMonths).getTime();
          by = "months";
        }
        if (item.everyHours) {
          const h0 = flightHours(data, a, doneAt);
          if (h0 !== null) {
            hoursDue = Math.round((h0 + item.everyHours) * 10) / 10;
            const t = whenHours(data, a, hoursDue, doneAt, h0);
            if (t !== null && (at === null || t < at)) {
              at = t;
              by = "hours";
            }
          }
        }
      }
      const state: DueState = !last ? (planned ? "planned" : "unknown")
        : planned && (at === null || ms(planned.start) <= at) ? "planned"
        : at === null ? "ok"
        : at < now ? "overdue"
        : at <= soon ? "soon" : "ok";
      out.push({ aircraft: a, item, last, planned, at, by, hoursNow, hoursDue, state });
    }
  }
  out.sort((x, y) => (x.at ?? Infinity) - (y.at ?? Infinity) || x.aircraft.tail.localeCompare(y.aircraft.tail));
  cache.set(data, out);
  return out;
}

/**
 * A job for a due inspection, in the tail's best free stretch: the latest one that still finishes
 * before it's due (so it flies as long as possible), else the first one from today.
 */
export function planFor(data: AppData, due: Due): MaintenanceJob {
  const { aircraft: a, item } = due;
  const now = today().getTime();
  const use = dayUser(data, a);
  const free = (d: number) => use(d).kind === "free";
  const fits = (start: number) => {
    for (let k = 0; k < item.days; k++) if (!free(dayAt(start, k))) return false;
    return true;
  };
  let start: number | null = null;
  if (due.at !== null && due.at > now)
    for (let d = dayAt(due.at, -item.days); d >= now; d = dayAt(d, -1))
      if (fits(d)) {
        start = d;
        break;
      }
  if (start === null)
    for (let d = now, n = 0; n < 366; d = dayAt(d, 1), n++)
      if (fits(d)) {
        start = d;
        break;
      }
  const s = start ?? now;
  return {
    id: uid(), aircraftId: a.id, title: item.title, kind: "Inspection", start: toWhen(s), end: toWhen(dayAt(s, item.days)),
    maintainerIds: [], grounds: item.grounds, done: false, notes: `Planned from the ${a.type} maintenance program${due.at !== null ? `; due ${format(due.at, "MMM d, yyyy")}` : ""}.`,
  };
}

/** Jobs to add for inspections overdue or due soon that aren't planned yet (for automatic planning). */
export function autoPlans(data: AppData): MaintenanceJob[] {
  if (!data.settings.maintenance.enabled || !data.settings.maintenance.autoPlan) return [];
  return dueList(data).filter((d) => d.state === "overdue" || d.state === "soon").map((d) => planFor(data, d));
}
