export type ID = string;

/**
 * Local date-time without a zone: "2026-11-02T00:00". Missions, shifts, jobs and time off cover whole
 * days, so these are midnights and an end is the midnight after the last day.
 */
export type When = string;

export type AircraftStatus = "Ready" | "In maintenance" | "Grounded" | "Retired";

export interface Aircraft {
  id: ID;
  tail: string;          // "N412ZM"
  type: string;          // "Bell 412"
  base: string;          // "North pad"
  status: AircraftStatus;
  seats: number;         // pilot seats in the cockpit (1 or 2)
  notes: string;
  /** The last flight-hours reading: total hours on the airframe as of a day ("2026-11-04"). */
  hours?: { hours: number; on: string } | null;
  /** Average flight hours on a day it flies a mission; empty = the Settings default. */
  hoursPerDay?: number | null;
  /** What a flight hour costs (fuel, parts, reserves), for cost per mission. */
  hourCost?: number | null;
  /** Equipment this tail has or can be fitted with (a hoist, a bucket), from the equipment list. */
  equipmentIds?: ID[];
}

/**
 * A kind of aircraft ("Bell 412"), set up once under Types & equipment and picked on each tail. Tails,
 * crew ratings and maintenance programs refer to it by name, so renaming a type renames it everywhere.
 */
export interface AircraftType {
  id: ID;
  name: string;
  /** Pilot seats a new tail of this type starts with. */
  seats: number;
  /** Equipment that can go on this type; a tail of it picks from these. Empty = any equipment. */
  equipmentIds: ID[];
  notes: string;
}

/** Something an aircraft carries for a kind of work: a rescue hoist, a fire bucket, a stretcher kit. */
export interface Equipment {
  id: ID;
  name: string;
  notes: string;
}

export type Role = "Pilot" | "Maintainer";

/** A hitch pattern in days: 21 on, 14 off. */
export interface Rotation {
  on: number;
  off: number;
}

/** Someone's own fixed rotation, counted from `start` ("2026-11-02", the first day of an on stretch). */
export interface PersonRotation extends Rotation {
  start: string;
}

/** A course or certification some missions need ("NVG", "Over water"). */
export interface Training {
  id: ID;
  name: string;
  /** Months until it has to be renewed. 0 = never expires. */
  validMonths: number;
  appliesTo: Role | "Both";
  notes: string;
}

/** One person's completed training. Dates are "2026-03-14". */
export interface TrainingRecord {
  trainingId: ID;
  completed: string;
  /** null = doesn't expire. */
  expires: string | null;
  /**
   * Counted as current until this day instead (someone away on a long job who can't get back for the
   * renewal yet), with why. Empty = no extension.
   */
  extendedTo?: string | null;
  extensionNote?: string;
}

/** The day a record really runs out: its extension if it has one and it's later, else its own date. */
export const validUntil = (r: Pick<TrainingRecord, "expires" | "extendedTo">): string | null =>
  r.expires === null ? null : r.extendedTo && r.extendedTo > r.expires ? r.extendedTo : r.expires;

export interface Person {
  id: ID;
  name: string;
  role: Role;
  /** Aircraft types this person is qualified on ("Bell 412", "AS350"). */
  quals: string[];
  training: TrainingRecord[];
  /** Missions this person works. They only need the training those missions (and any they're booked on) ask for. */
  missionIds: ID[];
  /** A fixed rotation: they're only available on their on days. null = available any day. */
  rotation: PersonRotation | null;
  /** Their own work limits, if stricter than the rules. */
  limits?: Limits;
  /** What a day on duty costs (pay, per diem), for cost per mission. */
  dayRate?: number | null;
  /** The last day they flew each type outside this plan ("Bell 412" → "2026-10-02"), for currency. */
  flew?: Record<string, string>;
  base: string;
  phone: string;
  notes: string;
}

/** How a slot is filled on the schedule, on top of its color (so colors aren't the only difference). */
export type Pattern = "solid" | "stripes" | "dots" | "grid" | "dashes" | "zigzag";

export type MissionStatus = "Planned" | "Confirmed" | "Flying" | "Done" | "Cancelled";

/**
 * One customer's kind of work: "Interior Fire Service", "Mat-Su Medevac". It holds what stays the same
 * every time: who to call, how it looks on the schedule, the training it needs. The dates live on its seasons.
 */
export interface Mission {
  id: ID;
  name: string;
  /** Who to call at the customer. */
  contact: string;
  location: string;
  /** Training everyone on this mission needs (NVG, mountain flying…). */
  requiredTrainingIds: ID[];
  /** Equipment every aircraft on this mission needs (a hoist for rescue, a bucket for fire). */
  requiredEquipmentIds?: ID[];
  /** How its slots look on the schedule. */
  color: string;
  pattern: Pattern;
  notes: string;
  /** Work limits for this customer's jobs, if stricter than the rules. */
  limits?: Limits;
  /** What the customer is charged per day of a season, for the margin. */
  dayCharge?: number | null;
  /** The kind of contract (a rule set in Settings), whose limits replace Settings' for this mission. */
  ruleSetId?: ID | null;
}

/**
 * One stretch of dates a mission is flown: a fire season, a year of medevac standby. It can have
 * several aircraft, picked when they're known. Crew numbers are for the whole job at any time.
 */
export interface Season {
  id: ID;
  missionId: ID;
  start: When;
  end: When;
  aircraftIds: ID[];
  /** Pilots working the job at every moment (across all its aircraft). */
  pilotsNeeded: number;
  /** Maintainers on the job at once, when they're needed. 0 = none. */
  maintainersNeeded: number;
  /** When maintainers are needed (missing = all the time). */
  maintainerNeed?: MaintainerNeed;
  /** Work limits for this season; with `override`, these replace the mission's and Settings'. */
  limits?: Limits;
  /** Hours on duty in a day on this job (for the duty-hours limit in Settings). Empty = not tracked. */
  dutyHours?: number | null;
  /** How pilots and maintainers rotate through the job (they can differ). null = no set pattern. */
  pilotRotation: Rotation | null;
  maintainerRotation: Rotation | null;
  status: MissionStatus;
  notes: string;
}

/**
 * When a season needs its maintainers: all the time, some days each week (`days` a week), for set-up and
 * tear-down (`days` at each end), or on call (booked when needed, never a gap).
 */
export interface MaintainerNeed {
  mode: "always" | "weekly" | "ends" | "oncall";
  days: number;
}

/**
 * A season together with its mission's details, which is what the schedule, the fleet and the checks
 * work with (see `bookings` in src/bookings.ts). Its `id` is the season's.
 */
export type Booking = Season & Pick<Mission, "name" | "contact" | "location" | "requiredTrainingIds" | "requiredEquipmentIds" | "color" | "pattern">;

/** One person covering part of a season. Pilots rotate by adding several of these. */
export interface Shift {
  id: ID;
  seasonId: ID;
  personId: ID;
  start: When;
  end: When;
  /** The shift this one takes over from (a handover on the same job), so dragging one end moves the right person. */
  after?: ID;
  /** A note for whoever's on it ("Bring the cold-weather kit"), shown on the schedule. */
  note?: string;
  /** Flight hours actually flown on it, typed in afterwards. Used instead of the planned flying for flight-hour limits. */
  flown?: number | null;
}

export type JobKind = "Inspection" | "Repair" | "Pre-flight" | "Other";

export interface MaintenanceJob {
  id: ID;
  aircraftId: ID;
  title: string;
  kind: JobKind;
  start: When;
  end: When;
  maintainerIds: ID[];
  /** The aircraft can't fly while this job is open. */
  grounds: boolean;
  done: boolean;
  notes: string;
}

export interface TimeOff {
  id: ID;
  personId: ID;
  start: When;
  end: When;
  reason: string;
  /**
   * Only a preference: they'd rather not work these days but can. Fill and Rebalance book someone else
   * when they can; it's never a problem if they're booked anyway.
   */
  soft?: boolean;
}

/**
 * Work limits that can be stricter than Settings for one person, one mission or one season. Empty fields
 * follow the level above. The safest wins: the fewest days on, the most days off.
 */
export interface Limits {
  maxDaysOn?: number | null;
  minDaysOff?: number | null;
  /** On a season only: use these instead of the mission's and Settings' (a person's own still apply). */
  override?: boolean;
}

/**
 * One inspection in an aircraft type's maintenance program: every so many flight hours and/or months,
 * whichever comes first. It takes `days` and usually grounds the aircraft.
 */
export interface ProgramItem {
  id: ID;
  /** The aircraft type it's for ("Bell 412"). */
  type: string;
  title: string;
  everyHours: number | null;
  everyMonths: number | null;
  days: number;
  grounds: boolean;
}

export interface IgnoredIssue {
  /** The problem's id (see src/coverage.ts). */
  id: string;
  /** What it said, for the list of ignored problems. */
  title: string;
  note: string;
  /** When it was ignored ("2026-11-04"). */
  on: string;
}

export interface Rules {
  /** Most days in a row someone can be on assignment (a hitch). */
  maxDaysOn: number;
  /** Fewest days off between two assignments. */
  minDaysOff: number;
}

export interface FlightLimit { hours: number; days: number }

/** Work limits for a kind of contract, picked on a mission. */
export interface RuleSet extends Rules {
  id: ID;
  name: string;
}

export interface Settings {
  theme: "system" | "light" | "dark";
  rules: Rules;
  sidebarCollapsed: boolean;
  /** Days shown on the schedule, 7 to 365. */
  scheduleSpan: number;
  scheduleGroup: "missions" | "aircraft" | "people";
  /** Warn this many days before training expires. */
  expiryWarningDays: number;
  /** A pilot is current on a type if they flew it within this many days. 0 = don't check. */
  currencyDays: number;
  /** Most hours on duty in a day; a season with longer days is flagged. 0 = don't check. */
  maxDutyHours: number;
  /** Most flight hours a pilot can fly in any `days` days (100 in 30, 300 in 90, 1,000 in 365). Empty = don't check. */
  flightLimits: FlightLimit[];
  /** Fewest hours off between two duty days (10). A duty day longer than 24 minus this is flagged. 0 = don't check. */
  minRestHours: number;
  /** Named work limits for kinds of contract (EMS, Fire); a mission that picks one uses it instead of the rules above. */
  ruleSets: RuleSet[];
  /** One-time questions already answered on the Overview ("flightLimit"), asked at setup or after an update. */
  asked: string[];
  /** The first day of the week in calendars and the week sheet: 1 Monday, 0 Sunday. */
  weekStart: 0 | 1;
  /** Pages left out of the menu (an operator that doesn't use them). */
  hiddenPages: Page[];
  /** What a new season starts with when its mission has none before it. */
  seasonDefaults: { pilots: number; maintainers: number; pilotRotation: Rotation | null; dutyHours: number | null };
  /** Shown before amounts ($, €, £, kr). */
  currencySymbol: string;
  /** Maintenance programs and flight hours (off for anyone who tracks them in another system). */
  maintenance: {
    enabled: boolean;
    /** Plan due inspections into free days on their own. */
    autoPlan: boolean;
    /** Flight hours on a day an aircraft flies a mission, unless the aircraft has its own. */
    hoursPerDay: number;
    /** "Due soon" this many days ahead. */
    dueSoonDays: number;
  };
}

export interface AppData {
  version: 1;
  aircraft: Aircraft[];
  /** Kinds of aircraft, picked on each tail. */
  aircraftTypes: AircraftType[];
  /** Equipment aircraft can carry and missions can need. */
  equipment: Equipment[];
  trainings: Training[];
  people: Person[];
  missions: Mission[];
  seasons: Season[];
  shifts: Shift[];
  jobs: MaintenanceJob[];
  timeOff: TimeOff[];
  /** Maintenance programs, item by item for each aircraft type. */
  programs: ProgramItem[];
  /** Problems someone chose to ignore, with why. They stay ignored while the same problem is there. */
  ignored: IgnoredIssue[];
  settings: Settings;
}

export type Page = "overview" | "schedule" | "missions" | "aircraft" | "types" | "people" | "maintenance" | "training" | "inspections" | "balance" | "planner" | "reports" | "settings" | "guide";
