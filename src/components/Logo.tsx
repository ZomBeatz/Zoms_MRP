import { useId } from "react";

/** The MRP mark: the ZomBeatz headphones around three schedule bars (same art as branding/mrp-icon.svg). */
export function LogoMark({ size = 28 }: { size?: number }) {
  // Each copy needs its own gradient ids: the page has two (sidebar and phone bar), and a gradient
  // borrowed from the hidden one draws nothing.
  const id = useId().replace(/:/g, "");
  const bg = `mrp-bg-${id}`, blue = `mrp-blue-${id}`;
  return (
    <svg width={size} height={size} viewBox="48 48 928 928" aria-hidden="true">
      <defs>
        <linearGradient id={bg} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#232833" />
          <stop offset="1" stopColor="#12151b" />
        </linearGradient>
        <linearGradient id={blue} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4fb0ec" />
          <stop offset="1" stopColor="#2580c3" />
        </linearGradient>
      </defs>
      <rect x="48" y="48" width="928" height="928" rx="208" fill={`url(#${bg})`} stroke="#ffffff" strokeOpacity=".14" strokeWidth="16" />
      <path d="M 214 600 A 298 298 0 0 1 810 600" fill="none" stroke="#0a0c10" strokeWidth="64" strokeLinecap="round" />
      <path d="M 214 600 A 298 298 0 0 1 810 600" fill="none" stroke="#ec6a3f" strokeWidth="30" strokeLinecap="round" />
      <rect x="196" y="500" width="84" height="264" rx="30" fill="#ec6a3f" />
      <rect x="150" y="522" width="86" height="220" rx="30" fill="#0a0c10" />
      <rect x="744" y="500" width="84" height="264" rx="30" fill="#ec6a3f" />
      <rect x="788" y="522" width="86" height="220" rx="30" fill="#0a0c10" />
      <rect x="326" y="398" width="284" height="110" rx="55" fill={`url(#${blue})`} />
      <rect x="404" y="530" width="320" height="110" rx="55" fill={`url(#${blue})`} opacity=".88" />
      <rect x="320" y="668" width="250" height="110" rx="55" fill={`url(#${blue})`} opacity=".75" />
      <rect x="364" y="436" width="96" height="34" rx="17" fill="#ffffff" opacity=".85" />
      <rect x="444" y="568" width="96" height="34" rx="17" fill="#ffffff" opacity=".85" />
      <rect x="360" y="706" width="96" height="34" rx="17" fill="#ffffff" opacity=".85" />
      <circle cx="566" cy="453" r="24" fill="#ec6a3f" />
    </svg>
  );
}

/** Icon, then "Zom's" in the text color and "MRP" in the accent, with the tagline under it. */
export function Wordmark({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div className="brand">
      <LogoMark size={40} />
      {!collapsed && (
        <div className="brand-words">
          <div className="brand-name">
            <span>Zom's</span> MRP
          </div>
          <div className="brand-tag">MISSION READY PLANNER</div>
        </div>
      )}
    </div>
  );
}
