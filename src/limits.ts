import type { AppData, Limits, Person, Rules, Season } from "./types";

/**
 * How long someone can work in a row, and how many days off they need between, for one booking.
 *
 * Settings set the rule; a mission and a season can be stricter, and so can a person. The safest wins:
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

/** The rules for a season, before the person: Settings, then the mission, then the season (or the season alone, with override). */
export function seasonRules(data: AppData, season?: Pick<Season, "missionId" | "limits"> | null, rules: Rules = data.settings.rules): Rules {
  if (!season) return rules;
  if (season.limits?.override)
    return { maxDaysOn: season.limits.maxDaysOn || rules.maxDaysOn, minDaysOff: season.limits.minDaysOff ?? rules.minDaysOff };
  const mission = data.missions.find((m) => m.id === season.missionId);
  return stricter(stricter(rules, mission?.limits), season.limits);
}

/** The rules for one person on one season (or on maintenance, with no season). */
export function rulesFor(data: AppData, person: Pick<Person, "limits"> | undefined, season?: Pick<Season, "missionId" | "limits"> | null, rules: Rules = data.settings.rules): Rules {
  return stricter(seasonRules(data, season, rules), person?.limits);
}

/** "14 days on, 10 off", for showing what applies. */
export const fmtRules = (r: Rules) => `${r.maxDaysOn} days on, ${r.minDaysOff} off`;
