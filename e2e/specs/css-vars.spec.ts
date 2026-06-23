import { test, expect } from "../support/fixtures";
import {
  makePalette,
  enableSite,
  openExtensionPage,
  waitForThemeApplied,
} from "../support/apply";
import { rootVar, sampleContrast } from "../support/page-helpers";

/**
 * CSS VARIABLES: the engine detects a variable-driven page and REMAPS the
 * `:root` custom properties in place (rather than only repainting tags).
 *
 * The fixture's design is sourced entirely from `:root` vars. After theming, the
 * surface/text/border vars must hold NEW values (overridden in the engine's
 * `<style id="themeMaker">`), and the elements that consume them must still be
 * readable.
 */

/** The custom properties the fixture declares on :root. */
const SURFACE_VARS = ["--bg", "--surface", "--surface-alt"];
const TEXT_VARS = ["--color-text", "--text-muted", "--heading", "--link"];
const BORDER_VARS = ["--border"];
const ALL_VARS = [...SURFACE_VARS, ...TEXT_VARS, ...BORDER_VARS];

test("overrides :root custom properties on a variable-driven page", async ({
  context,
  extensionId,
  server,
}) => {
  // Record the ORIGINAL resolved values before theming.
  const baseline = await context.newPage();
  await baseline.goto(server.url("/css-vars.html"));
  const before: Record<string, string> = {};
  for (const name of ALL_VARS) {
    before[name] = await rootVar(baseline, name);
  }
  await baseline.close();

  // Theme the origin and reload the fixture fresh.
  const ext = await openExtensionPage(context, extensionId);
  await enableSite(ext, server.origin, makePalette(), 80);

  const page = await context.newPage();
  await page.goto(server.url("/css-vars.html"));
  await waitForThemeApplied(page);

  const after: Record<string, string> = {};
  for (const name of ALL_VARS) {
    after[name] = await rootVar(page, name);
  }

  // Every surface + text + border var must have been overridden to a new value.
  const unchanged = ALL_VARS.filter(
    (name) => after[name] && after[name] === before[name],
  );
  expect(
    unchanged,
    `These :root vars were NOT remapped (before === after):\n${unchanged
      .map((n) => `  ${n}: ${before[n]}`)
      .join("\n")}`,
  ).toEqual([]);

  // Each overridden var must be a real color value (the engine writes hex).
  for (const name of ALL_VARS) {
    expect(after[name], `${name} resolved empty after theming`).not.toBe("");
    expect(after[name]).toMatch(/#|rgb/);
  }
});

test("variable-driven elements remain readable after remap", async ({
  context,
  extensionId,
  server,
}) => {
  const ext = await openExtensionPage(context, extensionId);
  await enableSite(ext, server.origin, makePalette(), 80);

  const page = await context.newPage();
  await page.goto(server.url("/css-vars.html"));
  await waitForThemeApplied(page);

  const samples = await sampleContrast(page, [
    "#title",
    "#card-title",
    "#card-body",
    "#link",
    "#muted",
  ]);
  const failures = samples.filter((s) => !s.passes);
  expect(
    failures,
    `var-driven contrast failures:\n${failures
      .map((f) => `  ${f.selector}: ${f.ratio} < ${f.threshold}`)
      .join("\n")}`,
  ).toEqual([]);
});
