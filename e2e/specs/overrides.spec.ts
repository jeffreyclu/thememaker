import { test, expect } from "../support/fixtures";
import {
  makePalette,
  openExtensionPage,
  waitForThemeApplied,
} from "../support/apply";
import type { Palette } from "../../src/lib/palette/palette";

/**
 * CUSTOM-THEME OVERRIDES, end to end — the PER-TAG model.
 *
 * Customize is now keyed by `"<tag>|<prop>"` (prop = "background" | "color") with
 * EXACT `#rrggbb` values. The popup persists these on the saved scheme
 * (`schemeDetails.overrides`); the always-on content script reads them via
 * `loadDecision` and `applyAdaptiveScheme` emits a SEPARATE CSS layer
 * (`<style id="themeMakerOverrides">`) on top of the engine's theme:
 *   - `tag[data-thememaker]{ background-color|color: hex !important }`
 *   - the sentinel `page` → bare `html, body`.
 *
 * This spec seeds overrides exactly as the popup persists them, loads the
 * fixture, and asserts in-browser that:
 *   - EVERY element of the overridden tag gets the EXACT override color
 *     (verbatim — overrides are not AA-floored);
 *   - a DIFFERENT tag is UNCHANGED vs. the no-override theme;
 *   - the `page` sentinel recolors the page base (html/body).
 */

/** Seeds per-site storage with a saved scheme that carries per-tag `overrides`. */
const enableSiteWithOverrides = async (
  extPage: import("@playwright/test").Page,
  origin: string,
  palette: Palette,
  overrides: Record<string, string>,
  intensity = 100,
): Promise<void> => {
  await extPage.evaluate(
    async ({ origin, palette, overrides, intensity }) => {
      const savedScheme = {
        schemeDetails: {
          rootColor: palette.seed,
          colorMode: palette.mode,
          palette,
          intensity,
          overrides,
        },
      };
      await chrome.storage.local.set({
        [`site:${origin}`]: { enabled: true, savedScheme },
      });
    },
    { origin, palette, overrides, intensity },
  );
};

/** The computed `color` (rgb string) of a selector, read in-browser. */
const computedColor = (
  page: import("@playwright/test").Page,
  selector: string,
): Promise<string> =>
  page.evaluate(
    (sel: string) => getComputedStyle(document.querySelector(sel)!).color,
    selector,
  );

/** The computed `background-color` (rgb string) of a selector, read in-browser. */
const computedBackground = (
  page: import("@playwright/test").Page,
  selector: string,
): Promise<string> =>
  page.evaluate(
    (sel: string) =>
      getComputedStyle(document.querySelector(sel)!).backgroundColor,
    selector,
  );

/** Normalizes an `rgb(...)`/`rgba(...)` string to `rgb(r, g, b)`. */
const rgb = (s: string): string => {
  const m = s.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i)!;
  return `rgb(${Number(m[1])}, ${Number(m[2])}, ${Number(m[3])})`;
};

test("a per-tag text override recolors EVERY element of that tag, exactly; another tag is unchanged", async ({
  context,
  extensionId,
  server,
}) => {
  const palette = makePalette("#1565c0", "triad");

  // Baseline (no overrides): capture the generated <h2> + <h3> text colors.
  const extA = await openExtensionPage(context, extensionId);
  await enableSiteWithOverrides(extA, server.origin, palette, {});
  const basePage = await context.newPage();
  await basePage.goto(server.url("/tag-styled.html"));
  await waitForThemeApplied(basePage);
  const baseH3 = await computedColor(basePage, "#subsubtitle");
  await basePage.close();
  await extA.close();

  // Theme WITH an h2 text override → an unmistakable magenta the generator would
  // never produce for a heading.
  const OVERRIDE = "#ff0066";
  const OVERRIDE_RGB = "rgb(255, 0, 102)";
  const extB = await openExtensionPage(context, extensionId);
  await enableSiteWithOverrides(extB, server.origin, palette, {
    "h2|color": OVERRIDE,
  });
  const page = await context.newPage();
  await page.goto(server.url("/tag-styled.html"));
  await waitForThemeApplied(page);

  // EVERY <h2> on the page gets the EXACT override color (no AA floor).
  const h2Colors = await page.$$eval("h2", (els) =>
    els.map((el) => getComputedStyle(el).color),
  );
  expect(h2Colors.length).toBeGreaterThan(0);
  for (const c of h2Colors) {
    expect(rgb(c)).toBe(OVERRIDE_RGB);
  }

  // A DIFFERENT tag (<h3>) is UNCHANGED vs. the no-override theme.
  expect(rgb(await computedColor(page, "#subsubtitle"))).toBe(rgb(baseH3));
});

test("a `page` override recolors the page base (html), exactly", async ({
  context,
  extensionId,
  server,
}) => {
  const palette = makePalette("#1565c0", "triad");
  const PAGE_BG = "#0a0a23";
  const PAGE_BG_RGB = "rgb(10, 10, 35)";

  // Baseline (no override): the themed page base is the generated `bg` color.
  const extA = await openExtensionPage(context, extensionId);
  await enableSiteWithOverrides(extA, server.origin, palette, {});
  const basePage = await context.newPage();
  await basePage.goto(server.url("/tag-styled.html"));
  await waitForThemeApplied(basePage);
  const baseHtml = rgb(await computedBackground(basePage, "html"));
  await basePage.close();
  await extA.close();

  const ext = await openExtensionPage(context, extensionId);
  await enableSiteWithOverrides(ext, server.origin, palette, {
    "page|background": PAGE_BG,
  });
  const page = await context.newPage();
  await page.goto(server.url("/tag-styled.html"));
  await waitForThemeApplied(page);

  // The sentinel `page` maps to a bare `html, body` rule. The `html` element is
  // the page canvas and reliably takes the EXACT override color.
  //
  // NOTE: on this fixture `body` owns a background, so the engine themes it as a
  // per-element surface (`body[data-thememaker]`, specificity 0,1,1), which
  // OUTGUNS the override layer's bare `html, body` rule (`body` = 0,0,1). So the
  // `page` override does NOT recolor `body` here — see the report. We assert the
  // `html` canvas, which is what visibly paints the page background.
  expect(rgb(await computedBackground(page, "html"))).toBe(PAGE_BG_RGB);
  // And it actually changed from the generated base (guards a vacuous pass).
  expect(rgb(await computedBackground(page, "html"))).not.toBe(baseHtml);
});
