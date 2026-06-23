import { test, expect } from "../support/fixtures";
import {
  makePalette,
  enableSite,
  disableSite,
  openExtensionPage,
  waitForThemeApplied,
} from "../support/apply";
import { themeStyleCount, backgroundColorOf } from "../support/page-helpers";

/**
 * PERSISTENCE: after a site is enabled for an origin, the ALWAYS-ON content
 * script auto-reapplies the theme on every load — WITHOUT the popup being open.
 *
 * This exercises the real Phase-3 path end to end: content script reads
 * `site:<origin>` from `chrome.storage.local`, runs `loadDecision`, and themes
 * via `applyAdaptiveScheme`. We assert the theme is present on a FRESH load and
 * survives a reload, and that disabling the site stops auto-reapply.
 */

test("auto-reapplies the theme on reload without opening the popup", async ({
  context,
  extensionId,
  server,
}) => {
  // Enable the origin (this is what the popup's "Apply on this site" persists).
  const ext = await openExtensionPage(context, extensionId);
  await enableSite(ext, server.origin, makePalette(), 80);
  await ext.close(); // popup is NOT open during the loads below

  // First load: content script themes the page.
  const page = await context.newPage();
  await page.goto(server.url("/tag-styled.html"));
  await waitForThemeApplied(page);
  expect(await themeStyleCount(page)).toBe(1);
  const firstBg = await backgroundColorOf(page, "body");

  // Reload: theme must be auto-reapplied (still exactly one style element).
  await page.reload();
  await waitForThemeApplied(page);
  expect(await themeStyleCount(page)).toBe(1);
  const reloadBg = await backgroundColorOf(page, "body");

  // Deterministic palette → same themed base across loads.
  expect(reloadBg).toBe(firstBg);
});

test("a brand-new tab on the same origin is themed automatically", async ({
  context,
  extensionId,
  server,
}) => {
  const ext = await openExtensionPage(context, extensionId);
  await enableSite(ext, server.origin, makePalette(), 80);
  await ext.close();

  // Open a completely separate tab on the same origin.
  const tab = await context.newPage();
  await tab.goto(server.url("/css-vars.html"));
  await waitForThemeApplied(tab);
  expect(await themeStyleCount(tab)).toBe(1);
});

test("disabling the site stops auto-reapply on the next load", async ({
  context,
  extensionId,
  server,
}) => {
  const ext = await openExtensionPage(context, extensionId);
  await enableSite(ext, server.origin, makePalette(), 80);

  // Confirm it themes while enabled.
  const page = await context.newPage();
  await page.goto(server.url("/tag-styled.html"));
  await waitForThemeApplied(page);
  expect(await themeStyleCount(page)).toBe(1);

  // Disable, then reload: the content script must NOT theme.
  await disableSite(ext, server.origin);
  await page.reload();
  // Give the content script a chance to (not) run, then assert absence. We wait
  // for DOM ready and a microtask turn rather than an arbitrary sleep.
  await page.waitForLoadState("domcontentloaded");
  await page.waitForFunction(() => document.readyState === "complete");
  expect(await themeStyleCount(page)).toBe(0);
});
