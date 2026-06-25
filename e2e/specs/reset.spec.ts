import { test, expect } from "../support/fixtures";
import type { Page } from "@playwright/test";
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
 * The production reset is now a CONTENT-MESSAGE: the popup sends `RESET_SCHEME`
 * to the ACTIVE tab's always-on content script (`chrome.tabs.sendMessage`),
 * which calls the real `removeSchemeStyle` in the page (no more background
 * `executeScript`). This spec drives that EXACT channel and the SAME active-tab
 * resolution the popup uses (`{ active: true, lastFocusedWindow: true }`): it
 * brings the themed fixture tab to front, sends `RESET_SCHEME` from an
 * extension-origin page, and asserts the style is gone + a second reset is
 * idempotent — the same outcomes as before, now through the real transport.
 */

/**
 * Sends `RESET_SCHEME` to the ACTIVE tab's content script (the popup's exact
 * resolution), returning the handler's `applied` flag (false on success).
 */
const resetActiveTab = (extPage: Page): Promise<boolean | undefined> =>
  extPage.evaluate(async (): Promise<boolean | undefined> => {
    const [tab] = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });
    if (!tab || tab.id == null) {
      throw new Error("no active tab for RESET_SCHEME");
    }
    const resp = await new Promise<{ ok?: boolean; applied?: boolean }>(
      (resolve) => {
        chrome.tabs.sendMessage(
          tab.id as number,
          { type: "RESET_SCHEME" },
          (r) => {
            void chrome.runtime.lastError;
            resolve(r ?? {});
          },
        );
      },
    );
    return resp.applied;
  });

test("reset removes the themeMaker style element (via the content channel)", async ({
  context,
  extensionId,
  server,
}) => {
  // Theme the page first via the real content-script auto-reapply path.
  const ext = await openExtensionPage(context, extensionId);
  await enableSite(ext, server.origin, makePalette(), 80);

  const page = await context.newPage();
  await page.goto(server.url("/tag-styled.html"));
  await waitForThemeApplied(page);
  expect(await themeStyleCount(page)).toBe(1);

  // Make the themed fixture the active tab (as it is when the popup opens over
  // it), then drive the REAL reset: RESET_SCHEME → content script →
  // removeSchemeStyle. A reset leaves nothing applied (`applied: false`).
  await page.bringToFront();
  const applied = await resetActiveTab(ext);
  expect(applied).toBe(false);
  expect(await themeStyleCount(page)).toBe(0);

  // Re-running reset on a clean page is idempotent (still nothing applied).
  await page.bringToFront();
  const appliedAgain = await resetActiveTab(ext);
  expect(appliedAgain).toBe(false);
  expect(await themeStyleCount(page)).toBe(0);
});
