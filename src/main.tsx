import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { boot } from "./store";
import "./tokens.css";
import "./styles.css";

// Load the data (from this browser, this computer or the server) before the first screen draws.
void boot().then(() =>
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  ),
);
