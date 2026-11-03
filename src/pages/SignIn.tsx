import { useState } from "react";
import { Wordmark } from "../components/Logo";
import { Field, autoFocusBox } from "../components/ui";
import { api } from "../backends/server";

/**
 * The server version's front door: sign in, or (on a brand-new server) make the first admin account.
 * After either, the page reloads into the app.
 */
export function SignIn({ needsSetup, serverName }: { needsSetup: boolean; serverName: string }) {
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (needsSetup && password !== again) return setError("The two passwords don't match.");
    setBusy(true);
    try {
      await api(needsSetup ? "/api/setup" : "/api/login", { method: "POST", json: needsSetup ? { username, name, password } : { username, password } });
      location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't reach the server. Check the connection and try again.");
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <form className="signin panel" onSubmit={submit}>
        <Wordmark />
        <h1 style={{ fontSize: 22, margin: "4px 0 6px" }}>{needsSetup ? "Set up this server" : `Sign in to ${serverName}`}</h1>
        <p className="small muted" style={{ marginTop: 0 }}>
          {needsSetup
            ? "You're the first one here. Make the admin account; you'll add everyone else from Settings."
            : "Use the username and password your admin gave you."}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Field label="Username">
            <input autoFocus={autoFocusBox} autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
          </Field>
          {needsSetup && (
            <Field label="Your name" hint="As others will see it.">
              <input autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
          )}
          <Field label="Password" hint={needsSetup ? "At least 10 characters." : undefined}>
            <input type="password" autoComplete={needsSetup ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
          {needsSetup && (
            <Field label="Password again">
              <input type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} required />
            </Field>
          )}
          {error && <div className="small" style={{ color: "var(--zb-danger)" }} role="alert">{error}</div>}
          <button className="btn primary big" type="submit" disabled={busy || !username || !password}>
            {busy ? "One moment…" : needsSetup ? "Make the admin account" : "Sign in"}
          </button>
        </div>
        {!needsSetup && <p className="small muted" style={{ marginBottom: 0 }}>Forgot your password? Ask an admin to set a new one.</p>}
      </form>
    </div>
  );
}
