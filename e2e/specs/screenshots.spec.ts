/**
 * Store-screenshot capture (not part of the assertion suite).
 *
 * Loads the BUILT extension into real Chromium (via the shared fixtures), themes
 * the demo fixture pages through the production auto-reapply path, and writes
 * before/after PNGs + a popup shot into `screenshots/`. Run explicitly:
 *
 *   npm run build
 *   SHOTS=1 npx playwright test e2e/specs/screenshots.spec.ts
 */
import { test, REPO_ROOT } from "../support/fixtures";
import {
  makePalette,
  enableSite,
  openExtensionPage,
  waitForThemeApplied,
} from "../support/apply";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

test.skip(!process.env.SHOTS, "store-screenshot capture — run with SHOTS=1");

const OUT = resolve(REPO_ROOT, "screenshots");
const SIZE = { width: 1280, height: 800 };
const PAGES = [
  { path: "/demo-blog.html", name: "blog" },
  { path: "/demo-dashboard.html", name: "dashboard" },
];

test("capture store screenshots", async ({ context, extensionId, server }) => {
  mkdirSync(OUT, { recursive: true });

  // Originals (un-themed).
  for (const { path, name } of PAGES) {
    const page = await context.newPage();
    await page.setViewportSize(SIZE);
    await page.goto(server.url(path), { waitUntil: "networkidle" });
    await page.screenshot({ path: resolve(OUT, `original-${name}.png`) });
    await page.close();
  }

  // Two themes via the always-on content script: a vibrant light triad and a
  // clean dark monochrome. Enabling the origin is the popup's "Apply on this site".
  const THEMES = [
    { tag: "themed", palette: makePalette("#7c3aed", "triad"), intensity: 90 },
    {
      tag: "dark",
      palette: makePalette("#3b82f6", "monochrome-dark"),
      intensity: 92,
    },
  ];
  for (const { tag, palette, intensity } of THEMES) {
    const ext = await openExtensionPage(context, extensionId);
    await enableSite(ext, server.origin, palette, intensity);
    await ext.close();
    for (const { path, name } of PAGES) {
      const page = await context.newPage();
      await page.setViewportSize(SIZE);
      await page.goto(server.url(path), { waitUntil: "networkidle" });
      await waitForThemeApplied(page);
      await page.waitForTimeout(1200); // let the time-sliced surface walk finish
      await page.screenshot({ path: resolve(OUT, `${tag}-${name}.png`) });
      await page.close();
    }
  }

  // The popup control surface (initial state), cropped tight to the panel.
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 318, height: 540 });
  await popup.goto(`chrome-extension://${extensionId}/src/popup/index.html`, {
    waitUntil: "networkidle",
  });
  await popup.waitForTimeout(800);
  await popup.screenshot({ path: resolve(OUT, "popup.png") });
  await popup.close();
});
