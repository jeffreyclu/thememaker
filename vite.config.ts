/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";

import manifest from "./src/manifest.config";

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  build: {
    // Emit a clean, loadable unpacked extension into dist/.
    outDir: "dist",
    emptyOutDir: true,
  },
  // The icons live at the repo root; expose them as static assets so they
  // land in dist/ and the manifest can reference them by bare filename.
  publicDir: "public",
  test: {
    environment: "jsdom",
    globals: true,
    include: ["tests/**/*.test.{ts,tsx}"],
    setupFiles: ["tests/setup.ts"],
  },
});
