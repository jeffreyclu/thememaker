import { test, expect } from "../support/fixtures";
import {
  makePalette,
  enableSite,
  openExtensionPage,
  waitForThemeApplied,
} from "../support/apply";
import { themeStyleCount, backgroundColorOf } from "../support/page-helpers";

/**
 * APPLY: the engine actually themes a live page.
 *
 * Proves that with a saved scheme for the origin, opening the fixture runs the
 * REAL content script + `applyAdaptiveScheme`, which writes EXACTLY ONE
 * `<style id="themeMaker">` and visibly changes the body background. This is the
 * baseline "it works on a real page" check the unit suite cannot make.
 */
test("applies a single themeMaker style and changes the body background", async ({
  context,
  extensionId,
  server,
}) => {
  // Baseline: load the fixture un-themed and record its original body bg.
  const baseline = await context.newPage();
  await baseline.goto(server.url("/tag-styled.html"));
  const originalBg = await backgroundColorOf(baseline, "body");
  expect(await themeStyleCount(baseline)).toBe(0); // no theme yet
  await baseline.close();

  // Enable the origin with a real palette, then open the fixture fresh.
  const ext = await openExtensionPage(context, extensionId);
  const palette = makePalette();
  await enableSite(ext, server.origin, palette, 80);

  const page = await context.newPage();
  await page.goto(server.url("/tag-styled.html"));
  await waitForThemeApplied(page);

  // Exactly one themeMaker style element.
  expect(await themeStyleCount(page)).toBe(1);

  // The body background actually changed.
  const themedBg = await backgroundColorOf(page, "body");
  expect(themedBg).not.toBe(originalBg);

  // And it is a real, opaque color (not transparent / unset).
  expect(themedBg).toMatch(/^rgba?\(\d+,\s*\d+,\s*\d+/);
});
