/**
 * Shared domain types for Thememaker.
 */

/**
 * A color mode. This is the closed, finite taxonomy the palette generator and
 * thecolorapi.com both understand — the single source of truth for
 * {@link import("./config").modes}, the palette `harmonyHues` switch, and the
 * popup mode `<select>`. Typing it as a union (not bare `string`) means typos
 * fail to compile and the `<select>` value is checked.
 */
export type ColorMode =
  | "monochrome"
  | "monochrome-dark"
  | "monochrome-light"
  | "complement"
  | "analogic-complement"
  | "triad"
  | "quad";

/**
 * How aggressively the adaptive engine repaints a page, as a dial that drives a
 * LIVE slider in the popup. The selectable range is {@link MIN_INTENSITY}–100;
 * 0 ("base only") is intentionally not selectable, because a page with only
 * html/body repainted and nothing else looks broken.
 *
 * Intensity controls surface coverage only — how many element backgrounds get
 * repainted — never text readability (which is always enforced):
 *  - `MIN_INTENSITY`: html/body + the largest page surfaces are repainted.
 *  - rising: progressively repaint smaller surface elements (the area threshold
 *           decreases as intensity rises).
 *  - `100`: repaint every detected surface and borders.
 */
export type Intensity = number;

/**
 * The lowest selectable intensity. We never go to 0 (base-only), which leaves a
 * page looking unstyled; the slider floor is this value so the far-left still
 * tints the page meaningfully.
 */
export const MIN_INTENSITY = 10;

/** The default intensity (a moderately-strong theme out of the box). */
export const DEFAULT_INTENSITY: Intensity = 80;

/** Clamps an arbitrary number into the continuous {@link MIN_INTENSITY}–100 range. */
export const clampIntensity = (n: number): Intensity =>
  Math.min(
    100,
    Math.max(
      MIN_INTENSITY,
      Math.round(Number.isFinite(n) ? n : DEFAULT_INTENSITY),
    ),
  );

/**
 * A custom-theme override map: `<tag>|<prop>` key → exact hex color. Keys are
 * `<tag>|<prop>` strings the in-page element picker emits (e.g. `div|background`,
 * `p|color`, `page|background`) — `<tag>` is a lowercase HTML tag or the
 * `page`/`html`/`body` sentinels, `<prop>` is `background` or `color`. An override
 * paints that exact color as a CSS layer on top of the generated theme; tags/props
 * absent from the map keep their generated colors.
 *
 * Kept as plain `string` keys (not a strict template-literal type): they're
 * produced at runtime from arbitrary clicked DOM elements and flow through
 * `Object.entries`/storage as strings, so the engine validates the tag + prop
 * defensively.
 */
export type RoleOverrides = Record<string, string>;

/** Options that travel with a palette to the in-page adaptive engine. */
export interface ApplyOptions {
  /** Theme-vs-original blend dial, {@link MIN_INTENSITY}–100. */
  intensity: Intensity;
  /**
   * Optional per-role color overrides (the custom-theme editor's picks), layered
   * on top of the generated palette. Absent/empty → the pure generated theme.
   */
  overrides?: RoleOverrides;
}

/** Metadata describing how a scheme was seeded/generated. */
export interface SchemeDetails {
  rootColor: string;
  colorMode: ColorMode;
  rootColorName?: string;
  /**
   * The structured palette this scheme was built from. Optional so history
   * fixtures without a palette still type-check; the popup regenerates a palette
   * from `rootColor` + `colorMode` when it is absent.
   */
  palette?: import("./lib/palette").Palette;
  /** The intensity the scheme was generated/applied with. */
  intensity?: Intensity;
  /**
   * Per-role color overrides (the custom-theme editor's picks) saved with the
   * scheme, so favorites + per-site saved schemes carry the custom theme and the
   * content-script auto-reapply restores it. Absent → no overrides.
   */
  overrides?: RoleOverrides;
  /** Whether this scheme's palette was flipped light↔dark (the Invert toggle). */
  invert?: boolean;
}

/**
 * A generated color scheme. `schemeDetails` carries the seed/palette metadata
 * the engine actually reapplies from; `colors` is a display-only map of
 * role-label → hex used by the popup's swatch/detail renderers (the in-page
 * engine paints from the palette, not from these per-label colors).
 *
 * The two concerns are split into distinct fields (rather than a single open
 * index signature) so iterating `colors` is type-safe — every value is a
 * `string` with no cast — and `schemeDetails` stays a normal typed field.
 */
export interface Scheme {
  schemeDetails: SchemeDetails;
  /** Display-only role-label → hex color map (popup swatches/details). */
  colors: Record<string, string>;
}
