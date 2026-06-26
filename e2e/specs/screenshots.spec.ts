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
import { mkdirSync, writeFileSync } from "node:fs";
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

  // Store-ready 1280x800: frame the popup over a themed page (the panel in
  // context, top-right like a real toolbar popup). The raw popup.png is the wrong
  // aspect ratio for the store; this composite is exactly 1280x800.
  writeFileSync(
    resolve(OUT, "frame.html"),
    `<!doctype html><html><head><meta charset="utf-8" /><style>
      html, body { margin: 0; }
      .stage { position: relative; width: 1280px; height: 800px; overflow: hidden; }
      .bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
      .pop { position: absolute; top: 44px; right: 52px; width: 318px;
        border-radius: 12px; box-shadow: 0 20px 56px rgba(0,0,0,.5); }
    </style></head><body>
      <div class="stage"><img class="bg" src="dark-dashboard.png" /><img class="pop" src="popup.png" /></div>
    </body></html>`,
  );
  const framed = await context.newPage();
  await framed.setViewportSize(SIZE);
  await framed.goto(`file://${resolve(OUT, "frame.html")}`, {
    waitUntil: "networkidle",
  });
  await framed.waitForTimeout(300);
  await framed.screenshot({
    path: resolve(OUT, "popup-framed.png"),
    clip: { x: 0, y: 0, width: 1280, height: 800 },
  });
  await framed.close();
});
