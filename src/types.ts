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
}

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
  /** How its slots look on the schedule. */
  color: string;
  pattern: Pattern;
  notes: string;
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
  /** Maintainers on the job at every moment. 0 = none. */
  maintainersNeeded: number;
  /** How pilots and maintainers rotate through the job (they can differ). null = no set pattern. */
  pilotRotation: Rotation | null;
  maintainerRotation: Rotation | null;
  status: MissionStatus;
  notes: string;
}

/**
 * A season together with its mission's details, which is what the schedule, the fleet and the checks
 * work with (see `bookings` in src/bookings.ts). Its `id` is the season's.
 */
export type Booking = Season & Pick<Mission, "name" | "contact" | "location" | "requiredTrainingIds" | "color" | "pattern">;

/** One person covering part of a season. Pilots rotate by adding several of these. */
export interface Shift {
  id: ID;
  seasonId: ID;
  personId: ID;
  start: When;
  end: When;
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
}

export interface Rules {
  /** Most days in a row someone can be on assignment (a hitch). */
  maxDaysOn: number;
  /** Fewest days off between two assignments. */
  minDaysOff: number;
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
}

export interface AppData {
  version: 1;
  aircraft: Aircraft[];
  trainings: Training[];
  people: Person[];
  missions: Mission[];
  seasons: Season[];
  shifts: Shift[];
  jobs: MaintenanceJob[];
  timeOff: TimeOff[];
  settings: Settings;
}

export type Page = "overview" | "schedule" | "missions" | "aircraft" | "people" | "maintenance" | "training" | "reports" | "settings";
