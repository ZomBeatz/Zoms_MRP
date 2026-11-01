import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { boot } from "./store";
import { isServerBuild } from "./platform";
import "./tokens.css";
import "./styles.css";

const render = (node: ReactNode) => createRoot(document.getElementById("root")!).render(<StrictMode>{node}</StrictMode>);

async function start() {
  // The server version: nothing shows until you're signed in.
  if (isServerBuild) {
    const { getSession, setServerUser } = await import("./backends/server");
    const session = await getSession().catch(() => null);
    if (!session) {
      document.getElementById("root")!.innerHTML = '<p style="padding:40px;font:16px system-ui">Couldn\'t reach the server. Check the connection, then reload.</p>';
      return;
    }
    if (!session.user) {
      const { SignIn } = await import("./pages/SignIn");
      return render(<SignIn needsSetup={session.needsSetup} serverName={session.name} />);
    }
    setServerUser(session.user);
  }
  // Load the data (from this browser, this computer or the server) before the first screen draws.
  await boot();
  render(<App />);
}

void start();
