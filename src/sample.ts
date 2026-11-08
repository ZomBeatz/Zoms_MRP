import { addMonths, format } from "date-fns";
import type { Aircraft, AircraftType, AppData, Booking, Equipment, MaintenanceJob, Mission, Pattern, Person, ProgramItem, Season, Settings, Shift, TimeOff, Training, TrainingRecord } from "./types";
import { booking } from "./bookings";
import { shadeAt } from "./look";
import { expiryFor, medicalExpiry } from "./certificates";
import { onRotationFor } from "./rotation";
import { DAY, dayAt, overlaps, toWhen, today } from "./time";

export const defaultSettings = (): Settings => ({
  theme: "system",
  rules: { maxDaysOn: 21, minDaysOff: 7 },
  sidebarCollapsed: false,
  scheduleSpan: 30,
  scheduleGroup: "aircraft",
  expiryWarningDays: 30,
  currencyDays: 90,
  maxDutyHours: 14,
  flightLimits: [],
  minRestHours: 10,
  ruleSets: [],
  asked: [],
  weekStart: 1,
  hiddenPages: [],
  seasonDefaults: { pilots: 1, maintainers: 0, pilotRotation: null, dutyHours: null },
  costs: false,
  currencySymbol: "$",
  maintenance: { enabled: false, autoPlan: false, hoursPerDay: 3, dueSoonDays: 30 },
});

export const emptyData = (): AppData => ({
  version: 1,
  aircraft: [],
  aircraftTypes: [],
  equipment: [],
  workTypes: [],
  trainings: [],
  people: [],
  missions: [],
  seasons: [],
  shifts: [],
  jobs: [],
  programs: [],
  ignored: [],
  timeOff: [],
  settings: defaultSettings(),
});

/** A small seeded random, so the demo comes out the same every time. */
function seeded(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HITCH = 14; // days per hitch in the demo

/**
 * Made-up demo data for a helicopter operator in Alaska (names, tails and customers are invented,
 * per DESIGN.md "Demo"). It covers the past 12 months as history and the next 12 months as plans,
 * with seasonal contracts (fire, survey, tours, fisheries, North Slope winters) and year-round ones
 * (medevac). Crew rotations are generated from each mission's regular crew, respecting type ratings,
 * training, time off and days off, so the gaps that remain are real ones. A few problems are left on purpose.
 */
export function sampleData(settings = defaultSettings()): AppData {
  const rnd = seeded(907);
  const t0 = today().getTime();
  const windowFrom = dayAt(t0, -365), windowTo = dayAt(t0, 365);
  const date = (y: number, m: number, d: number) => new Date(y, m - 1, d).getTime();
  const iso = (t: number) => format(t, "yyyy-MM-dd");

  // ---- training
  const course = (name: string, validMonths: number, appliesTo: Training["appliesTo"]): Training =>
    ({ id: `t-${name.toLowerCase().replace(/\W+/g, "-")}`, name, validMonths, appliesTo, notes: "" });
  const tMtn = course("Mountain flying", 12, "Pilot");
  const tFire = course("Fire bucket operations", 12, "Pilot");
  const tWater = course("Over water and HUET", 24, "Pilot");
  const tNvg = course("Night vision goggles (NVG)", 12, "Pilot");
  const tHoist = course("Hoist rescue", 12, "Pilot");
  const tArctic = course("Arctic survival", 24, "Both");
  const tCold = course("Cold weather maintenance", 24, "Maintainer");
  const tFuel = course("Fuel and hazmat handling", 24, "Maintainer");
  // Certificates, medicals and check rides: everyone in the role needs them, whatever the job.
  const cert = (name: string, kind: Training["kind"], validMonths: number, appliesTo: Training["appliesTo"], more: Partial<Training> = {}): Training =>
    ({ ...course(name, validMonths, appliesTo), kind, everyone: true, ...more });
  const cPilot = cert("Commercial pilot certificate", "certificate", 0, "Pilot");
  const cMedical = cert("Medical certificate", "medical", 12, "Pilot", { endOfMonth: true, privileges: "commercial" });
  const cCheck = cert("Part 135 competency check", "check", 12, "Pilot", { endOfMonth: true });
  const cMechanic = cert("Mechanic certificate (A&P)", "certificate", 0, "Maintainer");
  const cHazmat = cert("Hazmat handler card", "certificate", 24, "Maintainer", { everyone: false, renewedBy: [tFuel.id] });
  const trainings = [tMtn, tFire, tWater, tNvg, tHoist, tArctic, tCold, tFuel, cPilot, cMedical, cCheck, cMechanic, cHazmat];

  // ---- fleet: twelve tails, three of each type
  const ac = (tail: string, type: string, seats: number, base: string): Aircraft => ({ id: `a-${tail}`, tail, type, seats, base, status: "Airworthy", notes: "" });
  const B412 = "Bell 412", AW = "AW139", AS = "AS350 B3", B407 = "Bell 407";
  const n412 = ac("N412AK", B412, 2, "Anchorage");
  const n413 = ac("N413AK", B412, 2, "Fairbanks");
  const n414 = ac("N414AK", B412, 2, "Deadhorse");
  const n139 = ac("N139AK", AW, 2, "Palmer");
  const n140 = ac("N140AK", AW, 2, "Bethel");
  const n141 = ac("N141AK", AW, 2, "Nome");
  const n350 = ac("N350AK", AS, 1, "Fairbanks");
  const n351 = ac("N351AK", AS, 1, "Juneau");
  const n352 = ac("N352AK", AS, 1, "Dillingham");
  const n407 = ac("N407AK", B407, 1, "Kodiak");
  const n408 = ac("N408AK", B407, 1, "Anchorage");
  const n409 = ac("N409AK", B407, 1, "Sitka");
  const aircraft = [n412, n413, n414, n139, n140, n141, n350, n351, n352, n407, n408, n409];

  // ---- equipment, the types it fits, and what each tail has. Sitka's Bell 407 has no floats yet, on purpose.
  const gear = (name: string): Equipment => ({ id: `e-${name.toLowerCase().replace(/\W+/g, "-")}`, name, notes: "" });
  const eHoist = gear("Rescue hoist"), eBucket = gear("Fire bucket"), eMed = gear("Medical interior"), eHook = gear("Cargo hook"), eFloats = gear("Emergency floats");
  const equipment = [eHoist, eBucket, eMed, eHook, eFloats];
  const kind = (name: string, seats: number, fits: Equipment[]): AircraftType => ({ id: `ty-${name.toLowerCase().replace(/\W+/g, "-")}`, name, seats, equipmentIds: fits.map((e) => e.id), notes: "" });
  const aircraftTypes = [
    kind(B412, 2, [eHoist, eBucket, eHook, eFloats]), kind(AW, 2, [eHoist, eMed, eFloats]),
    kind(AS, 1, [eBucket, eHook]), kind(B407, 1, [eHook, eFloats, eMed]),
  ];
  const fit = (tails: Aircraft[], ...items: Equipment[]) => { for (const a of tails) a.equipmentIds = [...(a.equipmentIds ?? []), ...items.map((e) => e.id)]; };
  fit([n412, n413, n414, n350, n351, n352, n407, n408, n409], eHook);
  fit([n413, n350], eBucket);
  fit([n139, n140, n141], eMed, eFloats);
  fit([n139], eHoist);
  fit([n407], eFloats);

  // ---- crew: 34 pilots, 12 maintainers
  const person = (name: string, role: Person["role"], quals: string[], base: string): Person =>
    ({ id: `p-${name.split(" ")[0].toLowerCase()}`, name, role, quals, training: [], missionIds: [], rotation: null, base, phone: "", notes: "" });
  const P = {
    alex: person("Alex Rivera", "Pilot", [B412, AW], "Anchorage"),
    maya: person("Maya Chen", "Pilot", [B412, AS], "Fairbanks"),
    sam: person("Sam Patel", "Pilot", [B412, AW, B407], "Anchorage"),
    jamie: person("Jamie Ortiz", "Pilot", [B412, AW], "Anchorage"),
    owen: person("Owen Larsen", "Pilot", [B412], "Deadhorse"),
    priya: person("Priya Nair", "Pilot", [B412, AW], "Fairbanks"),
    eli: person("Eli Swanson", "Pilot", [B412, AS], "Fairbanks"),
    tess: person("Tess Johansen", "Pilot", [B412, B407], "Kodiak"),
    riley: person("Riley Brooks", "Pilot", [AW], "Palmer"),
    quinn: person("Quinn Hayes", "Pilot", [AW, B412], "Palmer"),
    marcus: person("Marcus Reyes", "Pilot", [AW, AS], "Bethel"),
    hana: person("Hana Sato", "Pilot", [AW, AS], "Bethel"),
    jordan: person("Jordan Okafor", "Pilot", [AS, B407], "Fairbanks"),
    casey: person("Casey Morgan", "Pilot", [AS, B407], "Anchorage"),
    ezra: person("Ezra Whitfield", "Pilot", [AS, B407], "Juneau"),
    mia: person("Mia Kowalski", "Pilot", [AS, B407, B412], "Juneau"),
    leah: person("Leah Tanaka", "Pilot", [AW, B412], "Nome"),
    noah: person("Noah Ahlberg", "Pilot", [AW], "Nome"),
    nora: person("Nora Fitzgerald", "Pilot", [AW, B412], "Nome"),
    ivy: person("Ivy Lindqvist", "Pilot", [B412, AW], "Deadhorse"),
    grace: person("Grace Muller", "Pilot", [AS, B407], "Dillingham"),
    ruben: person("Ruben Castro", "Pilot", [AS], "Dillingham"),
    victor: person("Victor Kim", "Pilot", [B407, AS], "Sitka"),
    ana: person("Ana Volkov", "Pilot", [B407], "Sitka"),
    dana: person("Dana Okonkwo", "Pilot", [AW, B412], "Anchorage"),
    theo: person("Theo Martin", "Pilot", [B412, AS], "Fairbanks"),
    sofia: person("Sofia Haugen", "Pilot", [AW, B412], "Bethel"),
    luke: person("Luke Brennan", "Pilot", [AS, B407], "Juneau"),
    iris: person("Iris Delacroix", "Pilot", [B407, AS], "Kodiak"),
    paul: person("Paul Nakamura", "Pilot", [AW, B412], "Palmer"),
    wes: person("Wes Carter", "Pilot", [B412, AW], "Deadhorse"),
    elena: person("Elena Rossi", "Pilot", [B412, AW], "Deadhorse"),
    kofi: person("Kofi Mensah", "Pilot", [B412, AW], "Anchorage"),
    liam: person("Liam O'Neill", "Pilot", [B412, AW], "Palmer"),
    taylor: person("Taylor Nguyen", "Maintainer", [B412, AW], "Anchorage"),
    morgan: person("Morgan Lee", "Maintainer", [AS, B407], "Fairbanks"),
    drew: person("Drew Santos", "Maintainer", [B412, AS, B407], "Anchorage"),
    kai: person("Kai Peterson", "Maintainer", [AW, B412], "Palmer"),
    rosa: person("Rosa Delgado", "Maintainer", [AS, B407, AW], "Juneau"),
    ben: person("Ben Ivanoff", "Maintainer", [B412, AW], "Bethel"),
    lena: person("Lena Holt", "Maintainer", [AW, B412], "Nome"),
    felix: person("Felix Romero", "Maintainer", [AS, B407], "Sitka"),
    aiden: person("Aiden Clarke", "Maintainer", [AW, B412], "Bethel"),
    june: person("June Park", "Maintainer", [AS, B407], "Kodiak"),
    omar: person("Omar Haddad", "Maintainer", [B412, AW], "Deadhorse"),
    sasha: person("Sasha Petrov", "Maintainer", [AS, B407, B412], "Dillingham"),
  };
  const people = Object.values(P);
  // Two of the North Slope crew work a fixed rotation of their own, from the start of last winter's season.
  for (const p of [P.wes, P.elena]) p.rotation = { on: 14, off: 14, start: iso(date(new Date(t0).getFullYear() - 1, 11, 15)) };

  // ---- customers and their seasons. A mission is one customer's job for one season.
  interface Contract {
    name: string; contact: string; color: string; pattern: Pattern; tails: Aircraft[]; pilots: number; maint: number;
    training: Training[]; location: string; crew: Person[];
    /** Equipment its aircraft need. */
    needs?: Equipment[];
    /** Ground duty: no aircraft (hangar on-call). */
    ground?: boolean;
    /** The seasons in a given year: [first day, midnight after the last day, label]. */
    seasons: (y: number) => [number, number, string][];
  }
  const season = (sm: number, sd: number, em: number, ed: number) => (y: number): [number, number, string][] => [[date(y, sm, sd), date(y, em, ed + 1), `${y}`]];
  const winter = (sm: number, sd: number, em: number, ed: number) => (y: number): [number, number, string][] =>
    [[date(y, sm, sd), date(y + 1, em, ed + 1), `winter ${y}-${String(y + 1).slice(2)}`]];
  const named = (...parts: [number, number, number, number, string][]) => (y: number) =>
    parts.map(([sm, sd, em, ed, label]): [number, number, string] => [date(y, sm, sd), date(y, em, ed + 1), `${label} ${y}`]);
  const contracts: Contract[] = [
    // One job on two aircraft: the Bell 412 for the bucket and the AS350 for initial attack, three pilots at a time.
    { name: "Interior Fire Service", contact: "Fire dispatch, (907) 555-0142", color: "#c2410c", pattern: "stripes", tails: [n413, n350], pilots: 3, maint: 1, training: [tMtn, tFire], needs: [eBucket],
      location: "Fairbanks and Interior fire zones", crew: [P.maya, P.jamie, P.priya, P.tess, P.eli, P.theo, P.owen, P.dana, P.mia, P.kofi, P.jordan, P.casey, P.luke, P.taylor, P.drew, P.omar], seasons: season(5, 15, 9, 15) },
    { name: "North Slope Energy", contact: "Logistics desk, (907) 555-0177", color: "#0f766e", pattern: "solid", tails: [n412], pilots: 2, maint: 1, training: [tArctic, tCold],
      location: "Deadhorse", crew: [P.wes, P.elena, P.kofi, P.alex, P.sam, P.owen, P.quinn, P.ivy, P.dana, P.sofia, P.paul, P.drew, P.ben, P.omar, P.lena], seasons: winter(11, 15, 4, 30) },
    { name: "Prudhoe pipeline patrol", contact: "Pipeline control, (907) 555-0181", color: "#115e59", pattern: "dashes", tails: [n414], pilots: 1, maint: 0, training: [tArctic],
      location: "Prudhoe Bay to Atigun Pass", crew: [P.ivy, P.nora, P.owen, P.leah, P.mia, P.dana, P.wes, P.elena], seasons: named([2, 1, 5, 31, "spring"], [9, 1, 10, 31, "fall"]) },
    { name: "Alaska Range Survey", contact: "Survey office, (907) 555-0119", color: "#a16207", pattern: "grid", tails: [n412], pilots: 1, maint: 0, training: [tMtn],
      location: "Talkeetna", crew: [P.alex, P.sam, P.owen, P.mia, P.dana], seasons: season(6, 15, 8, 31) },
    { name: "Denali Park research", contact: "Research station, (907) 555-0128", color: "#4d7c0f", pattern: "dots", tails: [n414], pilots: 1, maint: 0, training: [tMtn],
      location: "Denali backcountry", crew: [P.ivy, P.nora, P.jamie, P.owen, P.theo], seasons: season(6, 10, 8, 25) },
    { name: "Kenai Electric line patrol", contact: "Line crew lead, (907) 555-0163", color: "#854d0e", pattern: "dashes", tails: [n413], pilots: 1, maint: 0, training: [tMtn],
      location: "Kenai Peninsula", crew: [P.maya, P.priya, P.tess, P.eli, P.theo], seasons: season(1, 10, 3, 31) },
    { name: "Mat-Su Medevac", contact: "Flight desk, (907) 555-0150", color: "#be123c", pattern: "solid", tails: [n139], pilots: 2, maint: 1, training: [tNvg, tHoist], needs: [eMed, eHoist],
      location: "Palmer", crew: [P.riley, P.quinn, P.marcus, P.paul, P.liam, P.alex, P.dana, P.hana, P.leah, P.kai, P.taylor, P.aiden, P.lena], seasons: season(1, 5, 12, 20) },
    { name: "YK Delta Health", contact: "Transport desk, (907) 555-0188", color: "#1e3a8a", pattern: "zigzag", tails: [n140], pilots: 2, maint: 0, training: [tNvg, tArctic, tWater], needs: [eMed],
      location: "Bethel and villages", crew: [P.hana, P.marcus, P.sofia, P.priya, P.sam, P.jamie], seasons: season(1, 5, 12, 20) },
    { name: "Nome Regional Medevac", contact: "Dispatch, (907) 555-0193", color: "#9f1239", pattern: "stripes", tails: [n141], pilots: 2, maint: 0, training: [tNvg, tArctic, tWater], needs: [eMed],
      location: "Nome and Seward Peninsula", crew: [P.leah, P.noah, P.nora, P.ivy, P.sofia, P.paul, P.liam, P.kofi], seasons: season(1, 5, 12, 20) },
    { name: "Tanana Wildlife Survey", contact: "Field biologist, (907) 555-0124", color: "#15803d", pattern: "dots", tails: [n350], pilots: 1, maint: 0, training: [],
      location: "Tanana Flats", crew: [P.jordan, P.casey, P.marcus, P.luke], seasons: named([4, 1, 5, 10, "spring"], [9, 20, 10, 31, "fall"]) },
    { name: "Copper River seismic survey", contact: "Survey lead, (907) 555-0135", color: "#57534e", pattern: "grid", tails: [n350], pilots: 1, maint: 0, training: [tMtn],
      location: "Copper River basin", crew: [P.jordan, P.maya, P.eli, P.theo], seasons: season(2, 1, 3, 15) },
    { name: "Juneau Icefield Tours", contact: "Tour office, (907) 555-0131", color: "#0369a1", pattern: "stripes", tails: [n351], pilots: 1, maint: 0, training: [tMtn, tWater],
      location: "Juneau Icefield", crew: [P.ezra, P.mia, P.casey, P.luke, P.iris], seasons: season(5, 15, 9, 15) },
    { name: "Southeast Avalanche Program", contact: "Avalanche center, (907) 555-0109", color: "#6d28d9", pattern: "grid", tails: [n351], pilots: 1, maint: 0, training: [tMtn],
      location: "Juneau and Haines", crew: [P.ezra, P.mia, P.jordan, P.luke], seasons: winter(12, 1, 3, 31) },
    { name: "Bristol Bay Fisheries Survey", contact: "Fisheries office, (907) 555-0146", color: "#0891b2", pattern: "zigzag", tails: [n352], pilots: 1, maint: 0, training: [tWater],
      location: "Bristol Bay", crew: [P.grace, P.ruben, P.victor, P.iris], seasons: season(6, 10, 8, 20) },
    { name: "Bristol Bay hunting charters", contact: "Lodge office, (907) 555-0158", color: "#78350f", pattern: "solid", tails: [n352], pilots: 1, maint: 0, training: [],
      location: "Dillingham", crew: [P.ruben, P.grace, P.iris], seasons: season(9, 1, 10, 15) },
    { name: "Kodiak Fisheries Patrol", contact: "Patrol office, (907) 555-0156", color: "#0e7490", pattern: "dashes", tails: [n407], pilots: 1, maint: 0, training: [tWater], needs: [eFloats],
      location: "Kodiak Island", crew: [P.tess, P.sam, P.ezra, P.casey, P.iris], seasons: season(6, 1, 9, 30) },
    { name: "Sitka Search and Rescue support", contact: "SAR coordinator, (907) 555-0115", color: "#b91c1c", pattern: "dots", tails: [n409], pilots: 1, maint: 0, training: [tWater], needs: [eFloats],
      location: "Sitka Sound", crew: [P.ana, P.victor, P.grace, P.iris], seasons: season(1, 5, 12, 20) },
    { name: "Chugach Power line patrol", contact: "Grid operations, (907) 555-0170", color: "#9d174d", pattern: "solid", tails: [n408], pilots: 1, maint: 0, training: [],
      location: "Anchorage to Seward", crew: [P.jordan, P.casey, P.tess, P.sam, P.victor, P.luke],
      seasons: (y) => [3, 6, 9, 12].map((m): [number, number, string] => [date(y, m, 1), date(y, m, 22), format(date(y, m, 1), "MMM yyyy")]) },
    // Ground duty: a maintainer on call in the hangar every day of the year for a state contract.
    { name: "State hangar on-call", contact: "Facilities desk, (907) 555-0107", color: "#475569", pattern: "dots", tails: [], pilots: 0, maint: 1, training: [tFuel], ground: true,
      location: "Anchorage hangar", crew: [P.drew, P.kai, P.rosa, P.sasha, P.felix], seasons: season(1, 1, 12, 31) },
    { name: "Kachemak Bay film shoot", contact: "Production office, (907) 555-0102", color: "#c026d3", pattern: "stripes", tails: [n408], pilots: 1, maint: 0, training: [tWater],
      location: "Homer", crew: [P.casey, P.victor, P.ana], seasons: season(7, 1, 7, 12) },
  ];

  // ---- missions: one per customer, with every season that falls in the two-year window
  const y0 = new Date(t0).getFullYear();
  const missionList: Mission[] = [];
  const seasons: Season[] = [];
  const contractOf = new Map<string, Contract>(); // by mission id and by season id
  for (const c of contracts) {
    // "Fire dispatch, (907) 555-0142": who, and their phone; the email is made up from the customer's name.
    const [who, phone] = c.contact.split(", ");
    const mission: Mission = {
      id: `m-${missionList.length + 1}`, name: c.name, contact: who, phone: phone ?? "", email: `${who.toLowerCase().replace(/\W+/g, ".")}@${c.name.split(" ")[0].toLowerCase()}.example.com`,
      location: c.location, notes: "", ...(c.ground ? { kind: "ground" as const } : {}),
      requiredTrainingIds: c.training.map((t) => t.id), requiredEquipmentIds: (c.needs ?? []).map((e) => e.id), color: c.color, pattern: c.pattern,
    };
    missionList.push(mission);
    contractOf.set(mission.id, c);
    for (const p of c.crew) p.missionIds.push(mission.id);
    for (const y of [y0 - 2, y0 - 1, y0, y0 + 1])
      for (const [a0, b0] of c.seasons(y)) {
        const a = Math.max(a0, windowFrom), b = Math.min(b0, windowTo);
        if (b - a < 3 * DAY) continue;
        const status: Season["status"] = b <= t0 ? "Done" : a <= t0 ? "Flying" : a - t0 < 60 * DAY ? "Confirmed" : "Planned";
        const season: Season = {
          id: `se-${seasons.length + 1}`, missionId: mission.id, start: toWhen(a), end: toWhen(b), aircraftIds: c.tails.map((t) => t.id),
          // The demo rotates everyone 14 days on, 7 off.
          pilotRotation: { on: HITCH, off: settings.rules.minDaysOff }, maintainerRotation: c.maint ? { on: HITCH, off: settings.rules.minDaysOff } : null,
          pilotsNeeded: c.pilots, maintainersNeeded: c.maint, status, notes: "",
        };
        seasons.push(season);
        contractOf.set(season.id, c);
      }
  }
  // ---- types of work: each customer's job is a shade of its line of business's color.
  const kinds: [string, string, string[]][] = [
    ["Fire", "#c2410c", ["Interior Fire Service"]],
    ["Medevac and SAR", "#be123c", ["Mat-Su Medevac", "YK Delta Health", "Nome Regional Medevac", "Sitka Search and Rescue support"]],
    ["Energy and utilities", "#0f766e", ["North Slope Energy", "Prudhoe pipeline patrol", "Kenai Electric line patrol", "Chugach Power line patrol"]],
    ["Survey and research", "#a16207", ["Alaska Range Survey", "Denali Park research", "Tanana Wildlife Survey", "Copper River seismic survey", "Bristol Bay Fisheries Survey", "Kodiak Fisheries Patrol"]],
    ["Tours and charters", "#2563eb", ["Juneau Icefield Tours", "Southeast Avalanche Program", "Bristol Bay hunting charters", "Kachemak Bay film shoot"]],
    ["Ground duty", "#475569", ["State hangar on-call"]],
  ];
  const workTypes = kinds.map(([name, color], i) => ({ id: `wt-${i + 1}`, name, color }));
  kinds.forEach(([, color, names], i) => names.forEach((n, k) => {
    const m = missionList.find((x) => x.name === n);
    if (m) Object.assign(m, { workTypeId: workTypes[i].id, color: shadeAt(color, k) });
  }));

  // The coming fire season wants a third aircraft, a Bell 412 for July and August only, its tail not picked yet.
  for (const x of seasons.filter((y) => missionList.find((m) => m.id === y.missionId)?.name === "Interior Fire Service" && y.status === "Planned")) {
    const y0 = new Date(x.start).getFullYear();
    x.slots = [
      ...x.aircraftIds.map((id) => ({ id: `${x.id}-${id}`, type: aircraft.find((a) => a.id === id)!.type, aircraftId: id })),
      { id: `${x.id}-extra`, type: B412, aircraftId: null, start: toWhen(date(y0, 7, 1)), end: toWhen(date(y0, 9, 1)) },
    ];
  }
  seasons.sort((x, y) => x.start.localeCompare(y.start));
  // The seasons with their mission's details, for the steps below.
  const missions: Booking[] = seasons.map((x) => booking(missionList.find((m) => m.id === x.missionId)!, x));

  // ---- training records: a chain of courses so everyone is current across the window, with the
  // next renewal already booked, except a few left to show what MRP warns about.
  const unbooked = new Set([`${P.riley.id}:${tNvg.id}`, `${P.casey.id}:${tWater.id}`, `${P.owen.id}:${tArctic.id}`, `${P.morgan.id}:${tFuel.id}`, `${P.noah.id}:${tNvg.id}`]);
  for (const p of people) {
    const needed = new Set<Training>(p.role === "Maintainer" ? [tFuel] : []);
    for (const id of p.missionIds)
      for (const t of contractOf.get(id)!.training) if (t.appliesTo === "Both" || t.appliesTo === p.role) needed.add(t);
    for (const t of needed) {
      // The most recent course, 20 to 300 days ago, with a few set up to run out.
      let done = dayAt(t0, -20 - Math.floor(rnd() * 280));
      if (p === P.owen && t === tArctic) done = dayAt(t0, -t.validMonths * 30 - 15); // has run out
      if (p === P.riley && t === tNvg) done = dayAt(t0, -350); // runs out in about two weeks
      if (p === P.noah && t === tNvg) done = dayAt(t0, -300); // runs out in about two months
      if (p === P.casey && t === tWater) done = dayAt(t0, -705);
      const rec = (d: number): TrainingRecord => ({ trainingId: t.id, completed: iso(d), expires: iso(addMonths(d, t.validMonths).getTime()) });
      p.training.push(rec(addMonths(done, -t.validMonths).getTime() + 10 * DAY), rec(done));
      // The next one is booked a couple of weeks before this one runs out.
      const next = addMonths(done, t.validMonths).getTime() - 14 * DAY;
      if (next < windowTo && !unbooked.has(`${p.id}:${t.id}`)) p.training.push(rec(next));
    }
  }
  // Certificate records, from their own seeded numbers so the rest of the demo comes out as before.
  const rc = seeded(4242);
  const num = () => String(1_000_000 + Math.floor(rc() * 8_999_999));
  people.forEach((p, i) => {
    if (p.role === "Pilot") {
      // Born 27 to 58 years ago, so the medical rules that depend on age have something to go on.
      p.born = iso(dayAt(t0, -Math.floor((27 + rc() * 31) * 365.25)));
      p.training.push({ trainingId: cPilot.id, completed: iso(dayAt(t0, -400 - Math.floor(rc() * 3000))), expires: null, number: num(), issuedBy: "FAA", grade: "Commercial, rotorcraft-helicopter, instrument helicopter" });
      // A few hold first class medicals; two have limitations, and one flies on a special issuance.
      const medical = (completed: string): TrainingRecord => {
        const r: TrainingRecord = { trainingId: cMedical.id, completed, medicalClass: i % 7 === 0 ? 1 : 2, expires: null, issuedBy: "Dr. Okafor, AME", number: num() };
        if (i % 9 === 4) r.limitations = "Must wear corrective lenses";
        if (p === P.marcus) { r.limitations = "Valid only with annual cardiac evaluation"; r.specialIssuanceUntil = iso(dayAt(new Date(`${completed}T00:00`).getTime(), 420)); }
        return { ...r, expires: medicalExpiry(r, p.born, cMedical.privileges) };
      };
      for (const c of [cMedical, cCheck]) {
        // Done 1 to 11 months ago; the next one booked two weeks before it runs out. On purpose, Elena's
        // check ride runs out within a few weeks with nothing booked yet.
        const late = c === cCheck && p === P.elena;
        const done = late ? iso(dayAt(t0, -350)) : iso(dayAt(t0, -30 - Math.floor(rc() * 300)));
        const make = (completed: string): TrainingRecord => (c === cMedical ? medical(completed) : { trainingId: c.id, completed, expires: expiryFor(c, completed), issuedBy: "Check airman J. Reyes" });
        const rec = make(done);
        // The one before it, so the past year is covered too.
        const before = format(addMonths(new Date(`${rec.completed}T00:00`), 1 - c.validMonths), "yyyy-MM-dd");
        p.training.push({ ...make(before), number: rec.number }, rec);
        const next = dayAt(new Date(`${rec.expires}T00:00`).getTime(), -14);
        if (!late && next < windowTo) p.training.push(make(iso(next)));
      }
    } else {
      p.training.push({ trainingId: cMechanic.id, completed: iso(dayAt(t0, -500 - i * 97)), expires: null, number: num(), issuedBy: "FAA", grade: "Airframe and powerplant" });
      // The hazmat card is renewed by the fuel and hazmat course: one record for each time they did it.
      for (const r of p.training.filter((x) => x.trainingId === tFuel.id)) p.training.push({ trainingId: cHazmat.id, completed: r.completed, expires: expiryFor(cHazmat, r.completed), renewedFrom: tFuel.id });
    }
  });

  const trainedFor = (p: Person, m: Booking, a: number, b: number) =>
    m.requiredTrainingIds.every((id) => {
      const t = trainings.find((x) => x.id === id)!;
      if (t.appliesTo !== "Both" && t.appliesTo !== p.role) return true;
      return p.training.some((r) => r.trainingId === id && new Date(`${r.completed}T00:00`).getTime() <= a && (!r.expires || new Date(`${r.expires}T00:00`).getTime() >= b));
    });

  // ---- time off: two breaks a year for everyone
  const timeOff: TimeOff[] = [];
  const reasons = ["Vacation", "Family time", "Vacation", "Training course", "Medical", "Vacation"];
  people.forEach((p, i) => {
    for (const offset of [-330 + ((i * 37) % 300), 25 + ((i * 29) % 300)]) {
      const a = dayAt(t0, offset);
      timeOff.push({ id: `o-${timeOff.length + 1}`, personId: p.id, start: toWhen(a), end: toWhen(dayAt(a, 7 + Math.floor(rnd() * 8))), reason: reasons[(i + timeOff.length) % reasons.length] });
    }
  });

  // Everyone's bookings so far, so the generated roster never double books anyone.
  const booked = new Map<string, [number, number][]>(people.map((p) => [p.id, []]));
  for (const o of timeOff) booked.get(o.personId)!.push([new Date(o.start).getTime(), new Date(o.end).getTime()]);
  const worked = new Map<string, number>(people.map((p) => [p.id, 0]));
  const rest = settings.rules.minDaysOff;
  const free = (p: Person, a: number, b: number, gap = rest) => !booked.get(p.id)!.some(([x, y]) => overlaps(dayAt(a, -gap), dayAt(b, gap), x, y));
  const book = (p: Person, a: number, b: number) => {
    booked.get(p.id)!.push([a, b]);
    worked.set(p.id, worked.get(p.id)! + (b - a) / DAY);
  };

  // ---- maintenance: an annual and a 100 hour inspection for each tail every year, in its quiet time
  const jobs: MaintenanceJob[] = [];
  const time = (w: string) => new Date(w).getTime();
  const tailBusy = (a: Aircraft, from: number, to: number) =>
    missions.some((m) => m.aircraftIds.includes(a.id) && overlaps(from, to, time(m.start), time(m.end))) ||
    jobs.some((j) => j.aircraftId === a.id && j.grounds && overlaps(dayAt(from, -5), dayAt(to, 5), time(j.start), time(j.end)));
  const addJob = (a: Aircraft, title: string, kind: MaintenanceJob["kind"], from: number, days: number, grounds = true) => {
    const to = dayAt(from, days);
    const who = people
      .filter((p) => p.role === "Maintainer" && p.quals.includes(a.type) && free(p, from, to, grounds ? rest : 2))
      .sort((x, y) => worked.get(x.id)! - worked.get(y.id)!)
      .slice(0, days > 3 ? 2 : 1);
    who.forEach((p) => book(p, from, to));
    jobs.push({ id: `j-${jobs.length + 1}`, aircraftId: a.id, title, kind, start: toWhen(from), end: toWhen(to), maintainerIds: who.map((p) => p.id), grounds, done: to <= t0, notes: "" });
  };
  /** The longest stretch in [from, to) when the tail has no mission or grounding job. */
  const longestQuiet = (a: Aircraft, from: number, to: number): [number, number] | null => {
    let best: [number, number] | null = null, runStart = -1;
    for (let d = from; d <= to; d = dayAt(d, 1)) {
      const quiet = d < to && !tailBusy(a, d, dayAt(d, 1));
      if (quiet && runStart < 0) runStart = d;
      if (!quiet && runStart >= 0) {
        if (!best || d - runStart > best[1] - best[0]) best = [runStart, d];
        runStart = -1;
      }
    }
    return best;
  };
  for (const a of aircraft)
    for (const [from, to] of [[windowFrom, t0], [t0, windowTo]])
      for (const [title, days] of [["Annual inspection", 7], ["100 hour inspection", 2]] as const) {
        const quiet = longestQuiet(a, from, to);
        if (quiet && quiet[1] - quiet[0] >= (days + 6) * DAY)
          addJob(a, title, "Inspection", dayAt(quiet[0], Math.floor(((quiet[1] - quiet[0]) / DAY - days) / 2)), days);
      }
  // On purpose: a gearbox overhaul that lands in the middle of the North Slope season.
  const slope = missions.find((m) => m.name === "North Slope Energy" && time(m.end) > t0)!;
  addJob(n412, "Tail rotor gearbox overhaul", "Repair", dayAt(time(slope.start), 10), 3);

  // ---- rotations: hitches of 14 days, filled in date order across all missions, from each mission's
  // regular crew first, then anyone else rated on the type and current on its training
  const shifts: Shift[] = [];
  const hitches: { m: Booking; a: number; b: number }[] = [];
  for (const m of missions)
    for (let h = time(m.start); h < time(m.end); h = dayAt(h, HITCH)) hitches.push({ m, a: h, b: Math.min(time(m.end), dayAt(h, HITCH)) });
  hitches.sort((x, y) => x.a - y.a || contractOf.get(x.m.id)!.crew.length - contractOf.get(y.m.id)!.crew.length);
  for (const { m, a: h, b: he } of hitches) {
    const types = m.aircraftIds.map((id) => aircraft.find((x) => x.id === id)!.type);
    const regulars = contractOf.get(m.id)!.crew;
    for (const role of ["Pilot", "Maintainer"] as const) {
      const need = role === "Pilot" ? m.pilotsNeeded : m.maintainersNeeded;
      const pick = people
        .filter((p) => p.role === role && (!types.length || types.some((t) => p.quals.includes(t))) && trainedFor(p, m, h, he) && free(p, h, he) && onRotationFor(p, h, he))
        .sort((x, y) => Number(regulars.includes(y)) - Number(regulars.includes(x)) || worked.get(x.id)! - worked.get(y.id)! || x.name.localeCompare(y.name))
        .slice(0, need);
      for (const p of pick) {
        book(p, h, he);
        if (!p.missionIds.includes(m.missionId)) p.missionIds.push(m.missionId);
        // A handover: take over from someone on this job whose shift ends today, not already handed over.
        const prev = shifts.find((x) => x.seasonId === m.id && x.end === toWhen(h) && people.find((q) => q.id === x.personId)?.role === role && !shifts.some((y) => y.after === x.id));
        shifts.push({ id: `s-${shifts.length + 1}`, seasonId: m.id, personId: p.id, start: toWhen(h), end: toWhen(he), ...(prev ? { after: prev.id } : {}) });
      }
    }
  }

  // Maintenance programs for the demo's types, and an hour-meter reading on each tail from a few weeks ago.
  const programs: ProgramItem[] = [...new Set(aircraft.map((a) => a.type))].flatMap((type, i) => [
    { id: `pg-${i}-100`, type, title: "100 hour inspection", everyHours: 100, everyMonths: null, days: 2, grounds: true },
    { id: `pg-${i}-ann`, type, title: "Annual inspection", everyHours: null, everyMonths: 12, days: 7, grounds: true },
    ...(type === "AW139" ? [{ id: `pg-${i}-ph`, type, title: "Phase inspection", everyHours: 300, everyMonths: 24, days: 4, grounds: true }] : []),
  ]);
  const read = format(dayAt(t0, -20), "yyyy-MM-dd");
  for (const a of aircraft) {
    a.hours = { hours: Math.round(1800 + rnd() * 4000), on: read };
    // About what the demo's inspection jobs allow for (a 100 hour inspection every few months).
    a.hoursPerDay = 1.2;
  }

  // ---- status and logs: one tail AOG waiting on a part, one in for planned work, and a few log lines.
  const ymd = (n: number) => iso(dayAt(t0, n));
  let logId = 0;
  const log = (a: Aircraft, on: number, kind: "status" | "note", text: string) => (a.log = [...(a.log ?? []), { id: `lg-${++logId}`, on: ymd(on), kind, text }]);
  for (const a of aircraft) log(a, -360, "status", "Added to the fleet, airworthy.");
  Object.assign(n352, { status: "AOG", statusSince: ymd(-3), backOn: ymd(12) });
  log(n352, -3, "status", `Airworthy → AOG. Expected back ${format(dayAt(t0, 12), "MMM d, yyyy")}. Main rotor damper leaking, part on order.`);
  Object.assign(n408, { status: "In maintenance", statusSince: ymd(-1), backOn: ymd(5) });
  log(n408, -1, "status", `Airworthy → In maintenance. Expected back ${format(dayAt(t0, 5), "MMM d, yyyy")}. Avionics upgrade.`);
  log(n412, -40, "note", "Bird strike on approach to Anchorage. Inspected, no damage.");
  log(n139, -12, "note", "Hoist cable replaced, load tested.");

  return { version: 1, aircraft, aircraftTypes, equipment, workTypes, trainings, people, missions: missionList, seasons, shifts, jobs, timeOff, programs, ignored: [], settings };
}
