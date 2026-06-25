/**
 * Drives the REAL adaptive engine against live fixture pages — through the
 * extension's production auto-reapply path.
 *
 * Why this path: the extension ships only `activeTab` + `storage` (no host
 * permissions, no `scripting`). The ALWAYS-ON content script (`<all_urls>` in
 * the manifest) is the single owner of page-side applies: on every load it reads
 * `site:<origin>` from `chrome.storage.local`, runs the pure `loadDecision`, and
 * applies the saved scheme via the REAL `applyAdaptiveScheme`. That is exactly
 * the persistence path the popup's apply also targets (popup → content message),
 * and it is what these helpers exercise.
 *
 * Faithfulness:
 *  - The palette is produced by the REAL `localPalette` generator (the
 *    extension's default offline source), imported from `src/`. Pure data.
 *  - The saved scheme shape mirrors what the popup's "Apply" persists
 *    (`schemeDetails.palette` + `intensity`), which `loadDecision` consumes.
 *  - Theming itself is done by the REAL bundled content script + engine.
 */
import type { BrowserContext, Page } from "@playwright/test";
import { localPalette } from "../../src/lib/color-source";
import type { Palette } from "../../src/lib/palette";

/** Generates a real palette from a seed + mode (default a deterministic blue triad). */
export const makePalette = (seed = "#1565c0", mode = "triad"): Palette =>
  localPalette(seed, mode);

/**
 * Seeds per-site storage for `origin` exactly as the popup's "Apply" does:
 * `{ enabled: true, savedScheme: { schemeDetails: { palette, intensity, ... } } }`.
 * After this, any load of a page on `origin` auto-themes via the content script.
 *
 * Runs from an extension-origin page (which holds the `storage` permission).
 */
export const enableSite = async (
  extPage: Page,
  origin: string,
  palette: Palette,
  intensity = 80,
): Promise<void> => {
  await extPage.evaluate(
    async ({
      origin,
      palette,
      intensity,
    }: {
      origin: string;
      palette: Palette;
      intensity: number;
    }) => {
      const savedScheme = {
        schemeDetails: {
          rootColor: palette.seed,
          colorMode: palette.mode,
          palette,
          intensity,
        },
      };
      await chrome.storage.local.set({
        [`site:${origin}`]: { enabled: true, savedScheme },
      });
    },
    { origin, palette, intensity },
  );
};

/**
 * Disables auto-reapply for `origin` (mirrors the popup's Reset clearing the
 * per-site state). The content script will not theme subsequent loads.
 */
export const disableSite = async (
  extPage: Page,
  origin: string,
): Promise<void> => {
  await extPage.evaluate(async (origin: string) => {
    await chrome.storage.local.set({
      [`site:${origin}`]: { enabled: false, savedScheme: undefined },
    });
  }, origin);
};

/**
 * Opens a page on an extension origin so storage can be seeded. Returns a Page
 * bound to the extension's popup document (any extension-origin page would do;
 * the popup is the natural one and also loads the real popup controller).
 */
export const openExtensionPage = async (
  context: BrowserContext,
  extensionId: string,
): Promise<Page> => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/src/popup/index.html`);
  return page;
};

/**
 * Waits until the content script's engine has written the single
 * `<style id="themeMaker">` onto `page`.
 */
export const waitForThemeApplied = (page: Page): Promise<unknown> =>
  page.waitForFunction(
    () => document.querySelector("style#themeMaker") !== null,
    undefined,
    { timeout: 15_000 },
  );
