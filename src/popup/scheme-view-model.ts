/**
 * Scheme → VIEW-MODEL derivations (D10): pure functions that turn a `Scheme`
 * into the display rows/labels/swatches the popup renders.
 *
 * These read only `scheme.colors` / `scheme.schemeDetails` and never touch the
 * DOM or `chrome.*`, so the view + the state selectors share ONE set of
 * derivations instead of each re-grouping `scheme.colors`.
 */
import { describeColor } from "../lib/color-names";
import type { Scheme } from "../types";

/** @returns the friendly label for a scheme history entry. */
export const historyLabel = (scheme: Scheme, index: number): string => {
  const { rootColorName, rootColor, colorMode } = scheme.schemeDetails;
  // Fall back to naming the root color on the fly so legacy entries (saved
  // before names were stored) show a real name instead of "scheme".
  const name = rootColorName ?? describeColor(rootColor);
  return `${index + 1}. ${name} (${colorMode})`;
};

/**
 * @returns details rows for the current scheme: a list of "tag,tag: #hex"
 * grouped by color (the same grouping the legacy details panel showed).
 */
export const schemeDetailRows = (
  scheme: Scheme,
): Array<{ tags: string; color: string }> => {
  const byColor: Record<string, string[]> = {};
  // Guard: a malformed/hand-edited storage entry without `colors` degrades to
  // "no detail rows" instead of white-screening the popup (render runs in dispatch).
  for (const [label, color] of Object.entries(scheme.colors ?? {})) {
    (byColor[color] ??= []).push(label);
  }
  return Object.entries(byColor).map(([color, tags]) => ({
    tags: tags.join(","),
    color,
  }));
};

/**
 * @returns the distinct painted colors for a scheme (up to 5), de-duplicated in
 * display order — the swatch strip shown on history + favorites rows.
 */
export const schemeSwatches = (scheme: Scheme | null): string[] => {
  if (!scheme) {
    return [];
  }
  const seen: string[] = [];
  // Guard: a malformed/hand-edited storage entry without `colors` degrades to
  // "no swatches" instead of white-screening the popup (render runs in dispatch).
  for (const color of Object.values(scheme.colors ?? {})) {
    if (!seen.includes(color)) {
      seen.push(color);
    }
  }
  return seen.slice(0, 5);
};

/**
 * @returns the default favorite name for a scheme: its color name + mode (the
 * same friendly label the details/history derive), e.g. "Brandy Rose
 * (analogic-complement)". Used to pre-fill the save-favorite input.
 */
export const defaultFavoriteName = (scheme: Scheme): string => {
  const { rootColorName, rootColor, colorMode } = scheme.schemeDetails;
  const name = rootColorName ?? describeColor(rootColor);
  return `${name} (${colorMode})`;
};
