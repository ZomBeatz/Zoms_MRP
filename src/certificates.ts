import { addMonths, format, startOfMonth } from "date-fns";
import type { AppData, Person, Training, TrainingRecord } from "./types";
import { neededTraining } from "./coverage";
import { validUntil } from "./types";

/**
 * Certificates, licences, medicals and check rides: qualifications with a number, an issuer, scans and an
 * expiry (on the day, at the end of the month, or never). They live with the courses, so jobs can need them
 * and every check, Fill and the Qualifications grid count them; `everyone` makes one needed by a whole role.
 */

export const KINDS: Record<NonNullable<Training["kind"]>, string> = {
  course: "Course",
  certificate: "Certificate or licence",
  medical: "Medical",
  check: "Check ride",
};
export const kindOf = (t: Pick<Training, "kind">) => t.kind ?? "course";

/**
 * The day a record done on `completed` runs out (the first day it no longer counts), or null if it never
 * does. At the end of the month: it counts through the last day of the month it falls due in.
 */
export function expiryFor(t: Pick<Training, "validMonths" | "endOfMonth">, completed: string): string | null {
  if (!t.validMonths) return null;
  const due = addMonths(new Date(`${completed}T00:00`), t.validMonths);
  return format(t.endOfMonth ? startOfMonth(addMonths(due, 1)) : due, "yyyy-MM-dd");
}

/** A new record, and the records of every certificate the course renews, done the same day. */
export function withRenewals(data: Pick<AppData, "trainings">, rec: TrainingRecord): TrainingRecord[] {
  const renewed = data.trainings.filter((t) => t.id !== rec.trainingId && (t.renewedBy ?? []).includes(rec.trainingId));
  return [rec, ...renewed.map((t) => ({ trainingId: t.id, completed: rec.completed, expires: expiryFor(t, rec.completed), renewedFrom: rec.trainingId }))];
}

export type DueState = "missing" | "expired" | "soon" | "ok";

export interface DueRow {
  person: Person;
  training: Training;
  /** Their newest record of it, if any. */
  record?: TrainingRecord;
  /** When it stops counting (extension included); null = never. */
  until: string | null;
  state: DueState;
  /** Needed: for everyone in their role, or for jobs they work (named). */
  needed: boolean;
  jobs: string[];
}

/**
 * Every qualification each person holds or needs, with where it stands: missing (needed, no record),
 * expired, running out within `days`, or fine. A renewal already on record (done later) counts.
 */
export function dueList(data: AppData, days: number, now = Date.now()): DueRow[] {
  const today = format(now, "yyyy-MM-dd");
  const soon = format(now + days * 86_400_000, "yyyy-MM-dd");
  const rows: DueRow[] = [];
  for (const p of data.people) {
    const needs = neededTraining(data, p);
    const ids = new Set([...needs.keys(), ...p.training.map((r) => r.trainingId)]);
    for (const id of ids) {
      const t = data.trainings.find((x) => x.id === id);
      if (!t) continue;
      const recs = p.training.filter((r) => r.trainingId === id).sort((a, b) => a.completed.localeCompare(b.completed));
      const record = recs.at(-1);
      const until = recs.some((r) => !validUntil(r)) ? null : recs.map((r) => validUntil(r)!).sort().at(-1) ?? null;
      const state: DueState = !record ? "missing" : until === null ? "ok" : until <= today ? "expired" : until <= soon ? "soon" : "ok";
      rows.push({ person: p, training: t, record, until, state, needed: needs.has(id), jobs: (needs.get(id) ?? []).map((m) => m.name) });
    }
  }
  const rank = { missing: 0, expired: 1, soon: 2, ok: 3 };
  return rows.sort((a, b) => rank[a.state] - rank[b.state] || (a.until ?? "9999").localeCompare(b.until ?? "9999") || a.person.name.localeCompare(b.person.name));
}

/** "every pilot", "every maintainer", "everyone" */
export const everyoneWord = (t: Pick<Training, "appliesTo">) => (t.appliesTo === "Pilot" ? "every pilot" : t.appliesTo === "Maintainer" ? "every maintainer" : "everyone");
