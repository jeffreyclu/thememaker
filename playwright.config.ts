import { defineConfig } from "@playwright/test";

/**
 * Playwright config for the Thememaker MV3 extension e2e suite.
 *
 * The suite loads the BUILT extension from `dist/` into a real Chromium via a
 * persistent context (see `e2e/support/fixtures.ts`) and asserts the adaptive
 * theming engine's REAL behavior on live pages — the thing the Vitest unit suite
 * can't prove. Run `npm run build` first so `dist/` exists.
 *
 * Notes:
 *  - Single worker: each test owns a persistent browser context with the
 *    extension loaded; running them serially keeps the (heavy) contexts and the
 *    shared static server predictable.
 *  - No global `use.headless` here — headless is set per-context in the fixture
 *    because MV3 service workers require the "chromium" channel + new headless.
 */
export default defineConfig({
  testDir: "./e2e/specs",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
});
