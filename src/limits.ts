import type { AppData, FlightLimit, Limits, Mission, Person, Rotation, RuleSet, Rules, Season } from "./types";

/**
 * How long someone can work in a row, and how many days off they need between, for one booking.
 *
 * Settings set the rule, or a mission's kind of contract (a rule set in Settings) sets it instead; a mission
 * and a season can be stricter, and so can a person. The safest wins:
 * the fewest days on, the most days off. A season with `override` uses its own numbers instead of the
 * mission's and Settings' (to allow a longer hitch on that one job, say), but a person's own limits
 * still apply to them.
 */

const pick = (a: number, b: number | null | undefined, take: (x: number, y: number) => number) => (b == null || !(b > 0) ? a : take(a, b));

/** Apply a level's limits on top of `base`, keeping the safer of each. */
export function stricter(base: Rules, l?: Limits | null): Rules {
  if (!l) return base;
  return { maxDaysOn: pick(base.maxDaysOn, l.maxDaysOn, Math.min), minDaysOff: Math.max(base.minDaysOff, l.minDaysOff && l.minDaysOff > 0 ? l.minDaysOff : 0) };
}

/** The rules a mission starts from: its kind of contract's, or Settings'. */
export function baseRules(data: AppData, mission?: Pick<Mission, "ruleSetId"> | null, rules: Rules = data.settings.rules): Rules {
  const set = mission?.ruleSetId ? data.settings.ruleSets?.find((r) => r.id === mission.ruleSetId) : undefined;
  return set ? { maxDaysOn: set.maxDaysOn, minDaysOff: set.minDaysOff } : rules;
}

/** The schedule limitations a job follows: its own, else its client's, else none (Settings'). */
export function ruleSetOf(data: AppData, season?: Pick<Season, "missionId" | "ruleSetId"> | null): RuleSet | undefined {
  if (!season) return undefined;
  const id = season.ruleSetId ?? data.missions.find((m) => m.id === season.missionId)?.ruleSetId;
  return id ? data.settings.ruleSets?.find((r) => r.id === id) : undefined;
}

/** The rules for a season, before the person: Settings, then the mission, then the season (or the season alone, with override). */
export function seasonRules(data: AppData, season?: Pick<Season, "missionId" | "limits" | "ruleSetId"> | null, rules: Rules = data.settings.rules): Rules {
  if (!season) return rules;
  const mission = data.missions.find((m) => m.id === season.missionId);
  const set = ruleSetOf(data, season);
  const base = set ? { maxDaysOn: set.maxDaysOn, minDaysOff: set.minDaysOff } : baseRules(data, mission, rules);
  if (season.limits?.override)
    return { maxDaysOn: season.limits.maxDaysOn || base.maxDaysOn, minDaysOff: season.limits.minDaysOff ?? base.minDaysOff };
  return stricter(stricter(base, mission?.limits), season.limits);
}

/** The rules for one person on one season (or on maintenance, with no season). */
export function rulesFor(data: AppData, person: Pick<Person, "limits"> | undefined, season?: Pick<Season, "missionId" | "limits"> | null, rules: Rules = data.settings.rules): Rules {
  return stricter(seasonRules(data, season, rules), person?.limits);
}

/**
 * The hitch a job's crew in this role work: its rotation (or, without one, the most days on), never longer
 * than the most days on allowed and with at least the fewest days off. Fill the schedule rotates people on it.
 */
export function jobHitch(data: AppData, season: Pick<Season, "missionId" | "limits" | "ruleSetId" | "pilotRotation" | "maintainerRotation">, role: Person["role"]): Rotation {
  const base = seasonRules(data, season);
  const rot = role === "Pilot" ? season.pilotRotation : season.maintainerRotation;
  return { on: Math.max(1, Math.min(rot?.on || base.maxDaysOn, base.maxDaysOn)), off: Math.max(0, rot?.off ?? base.minDaysOff, base.minDaysOff) };
}

/**
 * The fewest people who can keep `seats` filled on every one of `days` days, each working at most `on` days
 * in a row with `off` days between: 1 at a time on 21 on, 7 off takes 2, and 2 at a time takes 3. No one
 * can work more than `on` days in every `on + off`, so fewer can't cover it; staggered starts make this many enough.
 */
export function crewFor(seats: number, hitch: Rotation, days: number): number {
  if (seats <= 0 || days <= 0) return 0;
  const on = Math.max(1, hitch.on), cycle = on + Math.max(0, hitch.off);
  const full = Math.floor(days / cycle);
  const most = full * on + Math.min(on, days - full * cycle);
  return Math.ceil((seats * days) / most - 1e-9);
}

/** "14 days on, 10 off", for showing what applies. */
export const fmtRules = (r: Rules) => `${r.maxDaysOn} days on, ${r.minDaysOff} off`;

/** The other limits a job follows: its schedule limitations' where they set one, else Settings'. 0 or empty = not checked. */
export interface JobLimits {
  minDaysOn: number;
  maxDutyHours: number;
  minRestHours: number;
  maxFlightHoursPerDay: number;
  flightLimits: FlightLimit[];
}

export function jobLimits(data: AppData, season?: Pick<Season, "missionId" | "ruleSetId"> | null): JobLimits {
  const set = ruleSetOf(data, season);
  const st = data.settings;
  const n = (x: number | null | undefined, d: number) => (x != null && x > 0 ? x : d);
  return {
    minDaysOn: n(set?.minDaysOn, 0),
    maxDutyHours: n(set?.maxDutyHours, st.maxDutyHours ?? 0),
    minRestHours: n(set?.minRestHours, st.minRestHours ?? 0),
    maxFlightHoursPerDay: n(set?.maxFlightHoursPerDay, 0),
    flightLimits: (set?.flightLimits?.length ? set.flightLimits : st.flightLimits ?? []).filter((l) => l.hours > 0 && l.days > 0),
  };
}

/** "14 on, 2 off · duty 14 h · 8 flight h a day · 42 h in 6 days" */
export const fmtRuleSet = (r: RuleSet) => [
  `${r.minDaysOn ? `${r.minDaysOn} to ` : ""}${r.maxDaysOn} on, ${r.minDaysOff} off`,
  r.maxDutyHours ? `duty ${r.maxDutyHours} h` : "", r.minRestHours ? `rest ${r.minRestHours} h` : "",
  r.maxFlightHoursPerDay ? `${r.maxFlightHoursPerDay} flight h a day` : "", ...(r.flightLimits ?? []).map((l) => `${l.hours} h in ${l.days} days`),
].filter(Boolean).join(" · ");

