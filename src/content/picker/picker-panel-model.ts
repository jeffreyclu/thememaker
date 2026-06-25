/**
 * PURE model for the in-page floating picker control (per-TAG custom overrides).
 *
 * Customize is per-TAG and decoupled from the generated scheme: picking an
 * element records an override keyed by `<tag>|<prop>` (prop = "background" |
 * "color"), so picking a <div> recolors every themed <div>, an <h3> every <h3>,
 * etc. Values are EXACT `#rrggbb` (no AA floor — a deliberate manual choice).
 *
 * This module holds only the panel's pure logic (rows + map transitions) so it
 * is unit-testable with no DOM and no `chrome.*`. The content script applies the
 * map as a CSS layer (`<tag>[data-thememaker]{ prop: color !important }`, or a
 * bare `html`/`body` rule for the page base) and persists it on the scheme.
 */
import { isHexColor, normalizeHex } from "../../lib/color/color";
import {
  FALLBACK_COLOR,
  labelForOverrideKey,
  overrideRows as overrideRowsBase,
  type OverrideRow,
} from "../../lib/override-keys";
import type { RoleOverrides } from "../../types";

export { FALLBACK_COLOR };
export type { OverrideRow };

/** A human label for a `<tag>|<prop>` override key, e.g. "div · background". */
export const roleLabel = (key: string): string =>
  labelForOverrideKey(key, { pageLabel: "Page · background" });

/** Rows to render, one per active override, in insertion order. */
export const overrideRows = (overrides: RoleOverrides): OverrideRow[] =>
  overrideRowsBase(overrides, roleLabel, true);

/**
 * Records a pick: ensures `key` (`<tag>|<prop>`) has an override, SEEDING it with
 * the element's CURRENT color so the row appears with no visible jump, ready to
 * tweak. Re-picking the same key keeps its value. Pure — returns a NEW map.
 */
export const withPickedRole = (
  overrides: RoleOverrides,
  key: string,
  currentColor: string,
): RoleOverrides => {
  if (key in overrides) {
    return overrides;
  }
  const seed = isHexColor(currentColor)
    ? normalizeHex(currentColor)
    : FALLBACK_COLOR;
  return { ...overrides, [key]: seed };
};

/** Sets `key` to an explicit color (a color-input edit). Invalid hex ignored. */
export const withRoleColor = (
  overrides: RoleOverrides,
  key: string,
  color: string,
): RoleOverrides => {
  if (!isHexColor(color)) {
    return overrides;
  }
  return { ...overrides, [key]: normalizeHex(color) };
};

/** Removes `key`'s override. Pure — returns a NEW map. */
export const withoutRole = (
  overrides: RoleOverrides,
  key: string,
): RoleOverrides => {
  if (!(key in overrides)) {
    return overrides;
  }
  const next = { ...overrides };
  delete next[key];
  return next;
};
