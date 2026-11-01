import { useEffect, useState } from "react";
import { Download, KeyRound, LogOut, Plus, ScrollText, UserCog, Users } from "lucide-react";
import { useStore } from "../store";
import { Dialog, Field } from "../components/ui";
import { api, serverUser, type ServerUser } from "../backends/server";

/**
 * Settings in the server version: your account (password, sign out) and, for admins, who has access,
 * what's been happening, and a backup download.
 */

const ROLES: { id: ServerUser["role"]; label: string; does: string }[] = [
  { id: "admin", label: "Admin", does: "Changes the plan and manages who has access." },
  { id: "scheduler", label: "Scheduler", does: "Changes the plan." },
  { id: "viewer", label: "Viewer", does: "Looks at everything, changes nothing." },
];
const roleLabel = (r: string) => ROLES.find((x) => x.id === r)?.label ?? r;

interface Account { id: string; username: string; name: string; role: ServerUser["role"]; disabled: boolean; lastLogin: number | null }
interface Activity { at: number; username: string | null; action: string; detail: string }

const when = (t: number | null) => (t ? new Date(t * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "Never");

export function ServerSettings() {
  const me = serverUser();
  const [pw, setPw] = useState(false);
  if (!me) return null;
  const signOut = async () => {
    await api("/api/logout", { method: "POST" }).catch(() => {});
    location.reload();
  };
  return (
    <>
      <section className="panel">
        <h3><UserCog size={16} /> Your account</h3>
        <p style={{ margin: "0 0 10px" }}>
          Signed in as <b>{me.name}</b> ({me.username}), <span className="pill accent">{roleLabel(me.role)}</span>
        </p>
        <div className="row gap wrap">
          <button className="btn" onClick={() => setPw(true)}><KeyRound size={14} /> Change password…</button>
          <button className="btn" onClick={signOut}><LogOut size={14} /> Sign out</button>
        </div>
      </section>
      {me.role === "admin" && <Admin />}
      {pw && <PasswordDialog onClose={() => setPw(false)} />}
    </>
  );
}

function PasswordDialog({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    try {
      await api("/api/me/password", { method: "POST", json: { current, new: next } });
      useStore.getState().showToast("Password changed. You're signed out everywhere else.");
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <Dialog title="Change password" onClose={onClose} foot={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save} disabled={!current || next.length < 10}>Change password</button></>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Field label="Current password"><input type="password" autoComplete="current-password" autoFocus value={current} onChange={(e) => setCurrent(e.target.value)} /></Field>
        <Field label="New password" hint="At least 10 characters." error={error}><input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} /></Field>
      </div>
    </Dialog>
  );
}

function Admin() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [editing, setEditing] = useState<Account | "new" | null>(null);
  const [showLog, setShowLog] = useState(false);
  const reload = () => {
    api<Account[]>("/api/admin/users").then(setAccounts).catch(() => {});
    api<Activity[]>("/api/admin/activity?limit=100").then(setActivity).catch(() => {});
  };
  useEffect(reload, []);

  return (
    <>
      <section className="panel">
        <div className="row between" style={{ marginBottom: 10 }}>
          <h3 style={{ margin: 0 }}><Users size={16} /> People with access</h3>
          <button className="btn sm primary" onClick={() => setEditing("new")}><Plus size={14} /> Add a person…</button>
        </div>
        <table className="table" style={{ boxShadow: "none" }}>
          <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Last signed in</th></tr></thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id} onClick={() => setEditing(a)} style={a.disabled ? { opacity: 0.55 } : undefined}>
                <td className="name">{a.name}</td>
                <td>{a.username}</td>
                <td>{a.disabled ? <span className="pill">Turned off</span> : <span className={`pill ${a.role === "admin" ? "accent" : a.role === "scheduler" ? "ok" : ""}`}>{roleLabel(a.role)}</span>}</td>
                <td className="small muted">{when(a.lastLogin)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="small muted" style={{ marginBottom: 0 }}>{ROLES.map((r) => `${r.label}: ${r.does}`).join(" ")}</p>
      </section>

      <section className="panel">
        <h3><ScrollText size={16} /> Activity and backups</h3>
        <p className="small muted" style={{ marginTop: 0 }}>The server keeps a copy of everything every day (the last 30), in its data folder. You can also download one now.</p>
        <div className="row gap wrap">
          <button className="btn" onClick={() => setShowLog((x) => !x)}>{showLog ? "Hide activity" : "Show activity"}</button>
          <a className="btn" href="/api/admin/backup"><Download size={14} /> Download a backup</a>
        </div>
        {showLog && (
          <table className="table" style={{ boxShadow: "none", marginTop: 12 }}>
            <thead><tr><th>When</th><th>Who</th><th>What</th></tr></thead>
            <tbody>
              {activity.map((a, i) => (
                <tr key={i} style={{ cursor: "default" }}>
                  <td className="small muted" style={{ whiteSpace: "nowrap" }}>{when(a.at)}</td>
                  <td>{a.username ?? "Server"}</td>
                  <td>{a.action}{a.detail && <span className="muted">: {a.detail}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {editing && <AccountDialog account={editing === "new" ? null : editing} onClose={() => { setEditing(null); reload(); }} />}
    </>
  );
}

function AccountDialog({ account, onClose }: { account: Account | null; onClose: () => void }) {
  const me = serverUser();
  const [name, setName] = useState(account?.name ?? "");
  const [username, setUsername] = useState(account?.username ?? "");
  const [role, setRole] = useState<ServerUser["role"]>(account?.role ?? "scheduler");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const toast = (t: string) => useStore.getState().showToast(t);
  const run = async (fn: () => Promise<unknown>, done: string) => {
    try {
      await fn();
      toast(done);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const save = () =>
    account
      ? run(() => api(`/api/admin/users/${account.id}`, { method: "PATCH", json: { name, role, ...(password ? { password } : {}) } }), `Saved ${name}`)
      : run(() => api("/api/admin/users", { method: "POST", json: { username, name, role, password } }), `Added ${name || username}. Give them their username and password.`);
  const self = account?.id === me?.id;
  return (
    <Dialog title={account ? account.name : "Add a person"} onClose={onClose}
      foot={
        <>
          {account && !self && (
            <button className="btn danger left" onClick={() => run(() => api(`/api/admin/users/${account.id}`, { method: "DELETE" }), `Removed ${account.name}`)}>Remove</button>
          )}
          {account && !self && (
            <button className="btn" onClick={() => run(() => api(`/api/admin/users/${account.id}`, { method: "PATCH", json: { disabled: !account.disabled } }), account.disabled ? `Turned ${account.name} back on` : `Turned ${account.name} off. They're signed out.`)}>
              {account.disabled ? "Turn on" : "Turn off"}
            </button>
          )}
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={save} disabled={account ? !!password && password.length < 10 : !username || password.length < 10}>{account ? "Save" : "Add person"}</button>
        </>
      }>
      <div className="form-grid">
        <Field label="Name"><input autoFocus value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Username" hint={account ? "Usernames can't change." : "What they sign in with."}>
          <input value={username} disabled={!!account} autoComplete="off" onChange={(e) => setUsername(e.target.value)} />
        </Field>
        <Field label="Role" full hint={ROLES.find((r) => r.id === role)?.does}>
          <select value={role} onChange={(e) => setRole(e.target.value as ServerUser["role"])} disabled={self}>
            {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </Field>
        <Field label={account ? "New password" : "Password"} full hint={account ? "Leave empty to keep theirs. Setting one signs them out." : "At least 10 characters. Tell them to change it after signing in."} error={error}>
          <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}
