import { test, expect } from "../support/fixtures";
import type { Page } from "@playwright/test";
import { removeSchemeStyle } from "../../src/lib/inject";
import {
  makePalette,
  enableSite,
  openExtensionPage,
  waitForThemeApplied,
} from "../support/apply";
import { themeStyleCount } from "../support/page-helpers";

/**
 * RESET: removing the theme deletes the `<style id="themeMaker">`.
 *
 * The production reset is `removeSchemeStyle` — a SELF-CONTAINED page function the
 * background ships to the tab via `chrome.scripting.executeScript` on RESET_SCHEME
 * (no imports, no `chrome.*`; verified in `src/lib/inject.ts`). Headless MV3 can't
 * drive that executeScript seam against an arbitrary tab (no host grant without an
 * action-button gesture), and a regular http page can't import the extension's
 * bundle. So we run the EXACT production function source — imported here from
 * `src/` and serialized the SAME WAY executeScript serializes it (`func.toString()`)
 * — directly in the themed fixture page. The reset logic under test is genuine and
 * unmodified; only the delivery seam differs.
 */

/** Serializes the real `removeSchemeStyle` and runs it in `page` (as executeScript would). */
const runRealReset = (page: Page): Promise<boolean> =>
  page.evaluate((source: string) => {
    // Reconstruct the function from its source (exactly how Chrome reconstructs
    // an executeScript `func`) and invoke it against this page's DOM.
    // eslint-disable-next-line no-new-func
    const fn = new Function(`return (${source})`)() as () => boolean;
    return fn();
  }, removeSchemeStyle.toString());

test("reset removes the themeMaker style element", async ({
  context,
  extensionId,
  server,
}) => {
  // Theme the page first via the real content-script path.
  const ext = await openExtensionPage(context, extensionId);
  await enableSite(ext, server.origin, makePalette(), 80);

  const page = await context.newPage();
  await page.goto(server.url("/tag-styled.html"));
  await waitForThemeApplied(page);
  expect(await themeStyleCount(page)).toBe(1);

  // Run the REAL production reset function against the themed DOM.
  const removed = await runRealReset(page);

  // It reported a removal, and the style is gone.
  expect(removed).toBe(true);
  expect(await themeStyleCount(page)).toBe(0);

  // Re-running reset on a clean page reports "nothing removed" (idempotent).
  expect(await runRealReset(page)).toBe(false);
});
