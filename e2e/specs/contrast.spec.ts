import { test, expect } from "../support/fixtures";
import {
  makePalette,
  enableSite,
  openExtensionPage,
  waitForThemeApplied,
} from "../support/apply";
import { sampleContrast } from "../support/page-helpers";

/**
 * CONTRAST / READABILITY — the headline guarantee.
 *
 * After the engine themes the page, every sampled text element must still meet
 * WCAG AA against its EFFECTIVE rendered background: >= 4.5:1 for body text,
 * >= 3:1 for large/heading text. The ratios are recomputed INDEPENDENTLY in the
 * browser from `getComputedStyle` (see `sampleContrast`) — we verify what the
 * browser actually renders, not what the engine claims. A theme that paints a
 * page unreadable is the failure mode this whole project exists to prevent.
 */

const TEXT_SELECTORS = [
  "#title", // h1 — large
  "#subtitle", // h2 — large
  "#subsubtitle", // h3 — large
  "#lead", // body paragraph
  "#link", // hyperlink
  "#caption", // muted small text
  "#quote", // blockquote on a tinted surface
  "#code", // code block
  "#primary", // primary button label
  "#secondary", // secondary button label
  "#footer", // footer text
];

test("themed text meets WCAG AA against its effective background", async ({
  context,
  extensionId,
  server,
}) => {
  const ext = await openExtensionPage(context, extensionId);
  const palette = makePalette();
  await enableSite(ext, server.origin, palette, 80);

  const page = await context.newPage();
  await page.goto(server.url("/tag-styled.html"));
  await waitForThemeApplied(page);

  const samples = await sampleContrast(page, TEXT_SELECTORS);

  // We must actually have sampled real elements (guards against a silent
  // selector mismatch making the assertion vacuous).
  expect(samples.length).toBeGreaterThanOrEqual(TEXT_SELECTORS.length - 1);

  const failures = samples.filter((s) => !s.passes);
  // Attach a readable report so a regression points at the exact element.
  expect(
    failures,
    `Contrast failures:\n${failures
      .map(
        (f) =>
          `  ${f.selector}: ratio ${f.ratio} < ${f.threshold} ` +
          `(text ${f.color} on bg ${f.background}, large=${f.large})`,
      )
      .join("\n")}`,
  ).toEqual([]);

  // Sanity: every sample produced a positive ratio (nothing degenerate).
  for (const s of samples) {
    expect(s.ratio).toBeGreaterThan(1);
  }
});

/**
 * Contrast must hold across the intensity range, not just the default. A low
 * intensity (closer to the original) and a full-strength theme both have to stay
 * readable.
 */
for (const intensity of [10, 100]) {
  test(`themed text stays readable at intensity ${intensity}`, async ({
    context,
    extensionId,
    server,
  }) => {
    const ext = await openExtensionPage(context, extensionId);
    await enableSite(ext, server.origin, makePalette(), intensity);

    const page = await context.newPage();
    await page.goto(server.url("/tag-styled.html"));
    await waitForThemeApplied(page);

    const samples = await sampleContrast(page, TEXT_SELECTORS);
    const failures = samples.filter((s) => !s.passes);
    expect(
      failures,
      `intensity ${intensity} contrast failures:\n${failures
        .map((f) => `  ${f.selector}: ${f.ratio} < ${f.threshold}`)
        .join("\n")}`,
    ).toEqual([]);
  });
}
