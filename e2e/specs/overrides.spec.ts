import { test, expect } from "../support/fixtures";
import {
  makePalette,
  openExtensionPage,
  waitForThemeApplied,
} from "../support/apply";
import { sampleContrast } from "../support/page-helpers";
import type { Palette } from "../../src/lib/palette";

/**
 * CUSTOM-THEME OVERRIDES, end to end through the production content-script path.
 *
 * The popup's element-picker ultimately persists per-role overrides on the saved
 * scheme (`schemeDetails.overrides`). The always-on content script reads that via
 * `loadDecision` and applies them through the REAL `applyAdaptiveScheme`. This
 * spec seeds an override for the `heading` role exactly as the popup persists it,
 * loads the fixture, and asserts in-browser that:
 *   - headings get the override color (or its nearest AA-safe shade of the same
 *     hue) — i.e. the override took effect and is in the override's hue family;
 *   - a DIFFERENT role (links) is UNCHANGED vs. the no-override theme;
 *   - every sampled text element still meets WCAG AA.
 */

/** Seeds per-site storage with a saved scheme that carries `overrides`. */
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

/** The computed text color (hex) of a selector, read in-browser. */
const computedColor = (
  page: import("@playwright/test").Page,
  selector: string,
): Promise<{ r: number; g: number; b: number }> =>
  page.evaluate((sel: string) => {
    const el = document.querySelector(sel) as HTMLElement;
    const cs = getComputedStyle(el).color;
    const m = cs.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/);
    return { r: Number(m![1]), g: Number(m![2]), b: Number(m![3]) };
  }, selector);

/** Hue (0..360) of an rgb triple — for asserting "same hue family". */
const hueOf = ({ r, g, b }: { r: number; g: number; b: number }): number => {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  if (d === 0) {
    return 0;
  }
  let h = 0;
  if (max === rn) {
    h = ((gn - bn) / d) % 6;
  } else if (max === gn) {
    h = (bn - rn) / d + 2;
  } else {
    h = (rn - gn) / d + 4;
  }
  h *= 60;
  return h < 0 ? h + 360 : h;
};

const hueDist = (a: number, b: number): number => {
  const dd = Math.abs(a - b) % 360;
  return dd > 180 ? 360 - dd : dd;
};

const TEXT_SELECTORS = [
  "#title",
  "#subtitle",
  "#lead",
  "#link",
  "#caption",
  "#primary",
  "#secondary",
];

test("a heading override recolors headings; links unchanged; AA holds", async ({
  context,
  extensionId,
  server,
}) => {
  // Seed `#1565c0` triad: the generated heading is a MAGENTA (~332°), the link a
  // GREEN (~92°). Overriding the heading to BLUE proves the override took effect
  // (heading flips from magenta to blue) AND is role-scoped (link stays green).
  const palette = makePalette("#1565c0", "triad");
  const blueOverride = { r: 21, g: 101, b: 192 }; // #1565c0

  // Baseline (no overrides): capture generated heading + link colors.
  const extA = await openExtensionPage(context, extensionId);
  await enableSiteWithOverrides(extA, server.origin, palette, {});
  const basePage = await context.newPage();
  await basePage.goto(server.url("/tag-styled.html"));
  await waitForThemeApplied(basePage);
  // #subtitle is an <h2> with NO own background → classified as heading TEXT
  // (the heading ROLE). #title is an <h1> that owns a white background, so the
  // engine treats it as a SURFACE — we sample the role-bearing text element.
  const baseHeading = await computedColor(basePage, "#subtitle");
  const baseLink = await computedColor(basePage, "#link");
  await basePage.close();
  await extA.close();

  // Sanity: the generated heading is NOT already blue (else the override would
  // be invisible) — it's the palette's magenta heading.
  expect(hueDist(hueOf(baseHeading), hueOf(blueOverride))).toBeGreaterThan(60);

  // Now theme WITH a heading override → blue.
  const extB = await openExtensionPage(context, extensionId);
  await enableSiteWithOverrides(extB, server.origin, palette, {
    heading: "#1565c0",
  });
  const page = await context.newPage();
  await page.goto(server.url("/tag-styled.html"));
  await waitForThemeApplied(page);

  const heading = await computedColor(page, "#subtitle");
  const link = await computedColor(page, "#link");

  // The heading is now in the override's BLUE hue family (nudgeToAA preserves
  // hue, only relighting lightness if needed for AA).
  expect(hueDist(hueOf(heading), hueOf(blueOverride))).toBeLessThan(40);
  // The link (a DIFFERENT role) is UNCHANGED vs. the no-override theme.
  expect(link).toEqual(baseLink);

  // Every sampled text element still meets WCAG AA against its effective bg.
  const samples = await sampleContrast(page, TEXT_SELECTORS);
  expect(samples.length).toBeGreaterThanOrEqual(TEXT_SELECTORS.length - 1);
  const failures = samples.filter((s) => !s.passes);
  expect(
    failures,
    `Override contrast failures:\n${failures
      .map((f) => `  ${f.selector}: ${f.ratio} < ${f.threshold}`)
      .join("\n")}`,
  ).toEqual([]);
});
