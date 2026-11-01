import { useStore } from "../store";
import { Wordmark } from "../components/Logo";
import { isServerBuild } from "../platform";

/** First start: try the demo, or start with nothing. */
export function Welcome() {
  const start = useStore((s) => s.start);
  return (
    <div className="page">
      <div className="welcome">
        <Wordmark />
        <h1 style={{ marginBottom: 8 }}>Schedule missions, crews and maintenance</h1>
        <p>
          Plan missions for days or months, put aircraft on them by tail number, rotate pilots through hitches, book maintainers and keep training current.
          Zom's MRP shows you every gap and conflict before it becomes a problem.
        </p>
        <p className="small muted">{isServerBuild ? "The plan is saved on this server, for everyone you add." : "Everything is saved on this computer."}</p>
        <div className="row gap" style={{ justifyContent: "center", marginTop: 20 }}>
          <button className="btn" onClick={() => start(false)}>Start empty</button>
          <button className="btn primary" onClick={() => start(true)}>Try it with demo data</button>
        </div>
      </div>
    </div>
  );
}
