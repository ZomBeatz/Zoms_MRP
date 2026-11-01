import type { Mission, Pattern } from "./types";

/** Slot colors people can pick from (any color works; these are a starting point). */
export const SWATCHES = ["#2563eb", "#0f766e", "#15803d", "#a16207", "#c2410c", "#be123c", "#9d174d", "#6d28d9", "#1e3a8a", "#334155"];

export const PATTERNS: { id: Pattern; label: string }[] = [
  { id: "solid", label: "Solid" },
  { id: "stripes", label: "Stripes" },
  { id: "dots", label: "Dots" },
  { id: "grid", label: "Grid" },
  { id: "dashes", label: "Dashes" },
  { id: "zigzag", label: "Zigzag" },
];

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
function patternLayer(p: Pattern, ink: string): { backgroundImage?: string; backgroundSize?: string } {
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

