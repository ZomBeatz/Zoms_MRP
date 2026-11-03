import { Dialog } from "../components/ui";

const mac = typeof navigator !== "undefined" && /Mac/.test(navigator.platform);
const mod = mac ? "⌘" : "Ctrl";

export const SHORTCUTS: [string, string][] = [
  [`${mod} scroll`, "Zoom a chart in or out (or pinch)"],
  ["Shift scroll", "Move a chart through time (or drag it)"],
  ["N", "New mission (or a new item on its own page)"],
  [`${mod} Z`, "Undo"],
  [`${mod} Shift Z`, "Redo"],
  ["[", "Fold the sidebar"],
  ["?", "Help and shortcuts"],
  ["Esc", "Close the dialog"],
];

export function Help({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="Help" onClose={onClose} foot={<button className="btn primary" onClick={onClose}>Done</button>}>
      <h4>How it fits together</h4>
      <ul style={{ marginTop: 0, paddingLeft: 18 }}>
        <li>A <b>mission</b> is one customer's work, with its own color and pattern. Its <b>seasons</b> are the stretches of dates it's flown, on one or more aircraft (by tail number, added when they're known), with how many pilots and maintainers the job needs at any time. <b>Copy to next season</b> books next year's dates.</li>
        <li>A season can have a <b>pilot rotation</b> and a <b>maintainer rotation</b>, like 21 days on, 14 off. <b>Fill the schedule</b> rotates free, qualified, current people through the open days on that pattern. People can also have a <b>fixed rotation</b> of their own; they're only offered on their on days.</li>
        <li>Each mission sets the <b>training</b> it needs, and the crew who work it. People only need the training of the missions they work, so a fire pilot doesn't need NVG unless they also fly medevac.</li>
        <li>The <b>Fleet</b> page shows every tail over time with its free windows. <b>Can we take a job?</b> checks which tails and crew could do new work.</li>
        <li><b>Shifts</b> put people on a season. Pilots rotate in hitches: several shifts that hand over. The people offered for a shift are only those who can take it (rated, current, free, on rotation); tick <b>Show everyone</b> to see the rest.</li>
        <li><b>Maintenance jobs</b> book maintainers on an aircraft. Jobs that ground the aircraft block it from missions.</li>
        <li>The <b>Overview</b> lists every gap and conflict. Click one to fix it.</li>
      </ul>
      <h4>What Zom's MRP checks</h4>
      <ul style={{ marginTop: 0, paddingLeft: 18 }}>
        <li>Open pilot seats and missing maintainers on call</li>
        <li>People or aircraft booked twice, or booked during time off or maintenance</li>
        <li>Pilots on an aircraft type they aren't qualified on, or booked on their own days off</li>
        <li>Training that's missing, has run out, or runs out during a hitch</li>
        <li>Hitches longer than the limit, or too few days off (Settings &gt; Hitches and days off)</li>
      </ul>
      <div className="kbd-hint">
        <h4>Shortcuts</h4>
        <table className="table" style={{ boxShadow: "none" }}>
          <tbody>{SHORTCUTS.map(([k, d]) => <tr key={k} style={{ cursor: "default" }}><td style={{ width: 140 }}><kbd>{k}</kbd></td><td>{d}</td></tr>)}</tbody>
        </table>
      </div>
    </Dialog>
  );
}
