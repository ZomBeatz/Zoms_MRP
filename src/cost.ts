import type { AppData, Booking } from "./types";
import { hoursPerDay } from "./program";
import { DAY, ms } from "./time";

/**
 * What a season costs over a period, and what it brings in: crew days × each person's day rate, flying
 * days × hours per flying day × each aircraft's cost per flight hour, and the mission's charge per day.
 * Rates are optional; anything without one counts as nothing.
 */

const clip = (a: number, b: number, from: number, to: number) => Math.max(0, Math.min(b, to) - Math.max(a, from));

export interface SeasonCost { crew: number; flying: number; total: number; charged: number | null; margin: number | null }

export function seasonCost(data: AppData, b: Booking, from: number, to: number): SeasonCost {
  const people = new Map(data.people.map((p) => [p.id, p]));
  let crew = 0;
  // Whole days, so a day the clocks change still counts as one.
  const days_ = (a: number, b_: number) => Math.round(clip(a, b_, from, to) / DAY);
  for (const s of data.shifts) if (s.seasonId === b.id) crew += days_(ms(s.start), ms(s.end)) * (people.get(s.personId)?.dayRate ?? 0);
  const days = days_(ms(b.start), ms(b.end));
  let flying = 0;
  for (const id of b.aircraftIds) {
    const a = data.aircraft.find((x) => x.id === id);
    if (a?.hourCost) flying += days * hoursPerDay(data, a) * a.hourCost;
  }
  const rate = data.missions.find((m) => m.id === b.missionId)?.dayCharge;
  const charged = rate ? days * rate : null;
  const total = Math.round(crew + flying);
  return { crew: Math.round(crew), flying: Math.round(flying), total, charged: charged === null ? null : Math.round(charged), margin: charged === null ? null : Math.round(charged - total) };
}

/** Whether any rate is set at all (so cost columns only show when they mean something). */
export const hasRates = (data: AppData) => !!data.settings.costs && (data.people.some((p) => p.dayRate) || data.aircraft.some((a) => a.hourCost) || data.missions.some((m) => m.dayCharge));

/** "$12,400" */
export const money = (n: number, symbol = "$") => `${n < 0 ? "−" : ""}${symbol}${Math.abs(n).toLocaleString("en-US")}`;
