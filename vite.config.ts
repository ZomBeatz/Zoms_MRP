/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";

export default defineConfig({
  plugins: [react()],
  base: process.env.MRP_BASE ?? "/",
  // Shown in Settings > About.
  define: { __APP_VERSION__: JSON.stringify(JSON.parse(fs.readFileSync("package.json", "utf8")).version) },
  clearScreen: false,
  server: { port: 1430, strictPort: true },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
