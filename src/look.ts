import type { AppData, Mission, Pattern } from "./types";

/** Slot colors people can pick from (any color works; these are a starting point): deep ones, then lighter ones. */
export const SWATCHES = [
  "#2563eb", "#0f766e", "#15803d", "#a16207", "#c2410c", "#be123c", "#9d174d", "#6d28d9", "#1e3a8a", "#334155",
  "#0891b2", "#0d9488", "#65a30d", "#ca8a04", "#ea580c", "#dc2626", "#db2777", "#9333ea", "#4f46e5", "#78716c",
  "#7dd3fc", "#5eead4", "#86efac", "#fde047", "#fdba74", "#fca5a5", "#f9a8d4", "#c4b5fd", "#a5b4fc", "#cbd5e1",
];

export const PATTERNS: { id: Pattern; label: string }[] = [
  { id: "solid", label: "Solid" },
  { id: "stripes", label: "Stripes" },
  { id: "dots", label: "Dots" },
  { id: "grid", label: "Grid" },
  { id: "dashes", label: "Dashes" },
  { id: "zigzag", label: "Zigzag" },
  { id: "crosshatch", label: "Crosshatch" },
  { id: "pinstripes", label: "Pinstripes" },
  { id: "checks", label: "Checks" },
  { id: "rings", label: "Rings" },
];

// ---------------------------------------------------------------- shades for types of work

function toHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", "").padEnd(6, "0").slice(0, 6), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => c / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s * 100, l * 100];
}

function toHex(h: number, s: number, l: number): string {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (k: number) => {
    const x = (k + h / 30) % 12;
    const c = l / 100 - a * Math.max(-1, Math.min(x - 3, 9 - x, 1));
    return Math.round(c * 255).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/**
 * The `i`th shade of a color: the color itself, then lighter and darker by turns, so the jobs of one type
 * of work look related but each can be told apart (with its pattern too).
 */
export function shadeAt(hex: string, i: number): string {
  if (i === 0) return hex.toLowerCase();
  const [h, s, l] = toHsl(hex);
  const step = Math.ceil(i / 2) * 11 * (i % 2 ? 1 : -1);
  // Past the ends, wrap around inside a readable range.
  let x = l + step;
  while (x > 82) x -= 64;
  while (x < 18) x += 64;
  return toHex(h, s, x);
}

/** A few shades of a color, for the picker. */
export const shadesOf = (hex: string, n = 8) => Array.from({ length: n }, (_, i) => shadeAt(hex, i));

/** The first shade of a type of work's color that none of its other jobs uses. */
export function nextShade(data: Pick<AppData, "missions" | "workTypes">, workTypeId: string, exceptJob?: string): string {
  const t = data.workTypes.find((x) => x.id === workTypeId);
  if (!t) return SWATCHES[0];
  const used = new Set(data.missions.filter((m) => m.workTypeId === workTypeId && m.id !== exceptJob).map((m) => m.color.toLowerCase()));
  for (let i = 0; i < 40; i++) if (!used.has(shadeAt(t.color, i))) return shadeAt(t.color, i);
  return t.color;
}

/** Every job of a type of work in a shade of its color, in the order they were added. */
export function reshade(missions: Mission[], workTypeId: string, color: string): Mission[] {
  let i = 0;
  return missions.map((m) => (m.workTypeId === workTypeId ? { ...m, color: shadeAt(color, i++) } : m));
}

/** Dark text on light colors, white on dark ones (DESIGN.md: keep text on user colors readable). */
export function textOn(hex: string): string {
  const n = parseInt(hex.replace("#", "").padEnd(6, "0").slice(0, 6), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? "#14171f" : "#ffffff";
}

/** The pattern as a CSS layer drawn over the slot color, in the text color at low opacity. */
function patternLayer(p: Pattern, ink: string): { backgroundImage?: string; backgroundSize?: string; backgroundPosition?: string } {
  const c = ink === "#ffffff" ? "rgba(255,255,255,.22)" : "rgba(0,0,0,.18)";
  switch (p) {
    case "stripes":
      return { backgroundImage: `repeating-linear-gradient(135deg, ${c} 0 6px, transparent 6px 14px)` };
    case "dots":
      return { backgroundImage: `radial-gradient(${c} 1.6px, transparent 2px)`, backgroundSize: "9px 9px" };
    case "grid":
      return { backgroundImage: `linear-gradient(${c} 1px, transparent 1px), linear-gradient(90deg, ${c} 1px, transparent 1px)`, backgroundSize: "10px 10px" };
    case "dashes":
      return { backgroundImage: `repeating-linear-gradient(90deg, ${c} 0 8px, transparent 8px 14px)`, backgroundSize: "100% 4px", };
    case "zigzag":
      return {
        backgroundImage: `linear-gradient(135deg, ${c} 25%, transparent 25%), linear-gradient(225deg, ${c} 25%, transparent 25%)`,
        backgroundSize: "12px 12px",
      };
    case "crosshatch":
      return { backgroundImage: `repeating-linear-gradient(45deg, ${c} 0 2px, transparent 2px 9px), repeating-linear-gradient(-45deg, ${c} 0 2px, transparent 2px 9px)` };
    case "pinstripes":
      return { backgroundImage: `repeating-linear-gradient(90deg, ${c} 0 2px, transparent 2px 8px)` };
    case "checks":
      return {
        backgroundImage: `linear-gradient(45deg, ${c} 25%, transparent 25%, transparent 75%, ${c} 75%), linear-gradient(45deg, ${c} 25%, transparent 25%, transparent 75%, ${c} 75%)`,
        backgroundSize: "12px 12px", backgroundPosition: "0 0, 6px 6px",
      };
    case "rings":
      return { backgroundImage: `radial-gradient(circle, transparent 2px, ${c} 2.5px, ${c} 3.5px, transparent 4px)`, backgroundSize: "12px 12px" };
    default:
      return {};
  }
}

export interface SlotLook { color: string; pattern: Pattern }

export const missionLook = (m: Mission): SlotLook => ({ color: m.color || SWATCHES[0], pattern: m.pattern || "solid" });

export function slotStyle(look: SlotLook): React.CSSProperties {
  const ink = textOn(look.color);
  const layer = patternLayer(look.pattern, ink);
  return { backgroundColor: look.color, color: ink, ...layer, ...(look.pattern === "dashes" ? { backgroundRepeat: "repeat-x", backgroundPosition: "0 100%" } : {}) };
}

