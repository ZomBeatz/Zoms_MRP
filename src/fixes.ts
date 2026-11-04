import type { AppData } from "./types";
import type { Issue } from "./coverage";
import { bookings } from "./bookings";
import { dueList, planFor } from "./program";

/**
 * Where each problem is fixed: which form, on which tab, and what in it to point at. The first fix is the
 * usual one (the button on the problem); the rest are the other ways out ("Or: add the rating").
 *
 * `spot` names what the form outlines and scrolls to:
 *   "dates", "aircraft", "status", "quals", "rotation", "maintainers" (fields),
 *   "shift:<id>" (opened for editing), "gap:<midnight>" (an open seat), "training:<course id>", "pilots" (the list).
 */
export interface Fix {
  label: string;
  kind: "season" | "person" | "job" | "aircraft" | "timeOff";
  /** "new" with `defaults` opens a new one filled in (a planned inspection). */
  id: string;
  defaults?: Record<string, unknown>;
  tab?: string;
  spot?: string;
}

export function fixesFor(data: AppData, i: Issue): Fix[] {
  const type = i.id.slice(0, i.id.indexOf("-"));
  const seasons = new Map(bookings(data).map((b) => [b.id, b]));
  const person = data.people.find((p) => p.id === i.personId);
  const tail = data.aircraft.find((a) => a.id === i.aircraftId)?.tail ?? "the aircraft";
  const crewTab = person?.role === "Maintainer" ? "maintainers" : "pilots";
  const name = (id?: string) => (id ? seasons.get(id)?.name : undefined) ?? "the mission";
  const jobTitle = (id?: string) => data.jobs.find((j) => j.id === id)?.title ?? "the job";

  const season = (label: string, tab: string, spot?: string, id = i.seasonId): Fix[] => (id ? [{ label, kind: "season", id, tab, spot }] : []);
  const shift = (label: string, seasonId = i.seasonId, shiftId = i.shiftId, tab = crewTab): Fix[] =>
    seasonId ? [{ label, kind: "season", id: seasonId, tab, spot: shiftId ? `shift:${shiftId}` : undefined }] : [];
  const job = (label: string, spot: string, id = i.jobId): Fix[] => (id ? [{ label, kind: "job", id, spot }] : []);
  const who = (label: string, tab: string, spot: string): Fix[] => (i.personId ? [{ label, kind: "person", id: i.personId, tab, spot }] : []);
  /** When there's a record to extend: the same course, where Extend it is. */
  const extendIt = (): Fix[] => (person?.training.some((r) => r.trainingId === i.trainingId && r.expires) ? who("Extend it", "training", `training:${i.trainingId}`) : []);
  /** A booking that's either a season's shift or a maintenance job. */
  const booking = (label: string, seasonId?: string, shiftId?: string, jobId?: string) =>
    seasonId ? shift(label, seasonId, shiftId) : job(label, "maintainers", jobId);

  switch (type) {
    case "time": return season("Fix the dates", "details", "dates");
    case "noac": return season("Pick an aircraft", "details", "aircraft");
    case "acstat": return [
      ...season("Pick another aircraft", "details", "aircraft"),
      { label: `Change ${tail}'s status`, kind: "aircraft", id: i.aircraftId!, spot: "status" },
    ];
    case "acjob": return [
      ...season("Pick another aircraft", "details", "aircraft"),
      ...job("Move the maintenance", "dates"),
    ];
    case "acdbl": return [
      ...season(`Change ${name(i.seasonId)}'s aircraft`, "details", "aircraft"),
      ...season(`Change ${name(i.otherSeasonId)}'s aircraft`, "details", "aircraft", i.otherSeasonId),
    ];
    case "pgap": return season("Add a pilot", "pilots", `gap:${i.at}`);
    case "mgap": return season("Add a maintainer", "maintainers", `gap:${i.at}`);
    case "seats": return [
      ...season("Take a pilot off", "pilots", "pilots"),
      ...season("Add an aircraft", "details", "aircraft"),
    ];
    case "qual": return [...shift("Swap them out"), ...who("Add the rating", "work", "quals")];
    case "offrot": return [...shift("Swap them out"), ...who("Change their rotation", "details", "rotation")];
    case "outside": return [...shift("Fix the shift's dates"), ...season("Change the season's dates", "details", "dates")];
    case "stime": return shift("Fix the shift's dates");
    case "jqual": return [...job("Pick another maintainer", "maintainers"), ...who("Add the rating", "work", "quals")];
    case "dbl": return [
      ...booking(i.seasonId ? `Change ${name(i.seasonId)}` : `Change “${jobTitle(i.jobId)}”`, i.seasonId, i.shiftId, i.jobId),
      ...booking(i.otherSeasonId ? `Change ${name(i.otherSeasonId)}` : `Change “${jobTitle(i.otherJobId)}”`, i.otherSeasonId, i.otherShiftId, i.otherJobId),
    ];
    case "off": return [
      ...booking("Swap them out", i.seasonId, i.shiftId, i.jobId),
      ...(i.timeOffId ? [{ label: "Change the time off", kind: "timeOff" as const, id: i.timeOffId, spot: "dates" }] : []),
    ];
    case "duty": return booking("Rotate someone in", i.seasonId, i.shiftId, i.jobId);
    case "rest": return booking("Move this booking", i.seasonId, i.shiftId, i.jobId);
    case "train": return [...who("Record the training", "training", `training:${i.trainingId}`), ...shift("Swap them out"), ...extendIt()];
    case "lapsed": return [...who("Record the training", "training", `training:${i.trainingId}`), ...extendIt()];
    case "mxdue": {
      const due = dueList(data).find((d) => `mxdue-${d.aircraft.id}-${d.item.id}` === i.id);
      return [
        ...(due ? [{ label: "Plan it", kind: "job" as const, id: "new", defaults: { ...planFor(data, due) }, spot: "maintainers" }] : []),
        { label: "Update hours", kind: "aircraft", id: i.aircraftId!, spot: "hours" },
      ];
    }
    case "renew": return [...who("Record the renewal", "training", `training:${i.trainingId}`), ...extendIt()];
  }
  // Anything new: at least open what it's about.
  if (i.seasonId) return season("Open the season", "details");
  if (i.jobId) return job("Open the job", "dates");
  if (i.personId) return who("Open their details", "details", "");
  return [];
}
