/**
 * Shared domain types for Thememaker.
 *
 * These are intentionally permissive (behavior-preserving migration). The
 * adaptive engine in later phases will tighten them.
 */

/** A color mode accepted by thecolorapi.com (e.g. "monochrome", "triad"). */
export type ColorMode = string;

/**
 * How aggressively the adaptive engine repaints a page, as a dial that drives a
 * LIVE slider in the popup. The selectable range is {@link MIN_INTENSITY}–100;
 * 0 ("base only") is intentionally NOT selectable, because a page with only
 * html/body repainted and nothing else looks broken.
 *
 * Intensity controls SURFACE COVERAGE only — how many element backgrounds get
 * repainted — never text readability (which is always enforced):
 *  - `MIN_INTENSITY`: html/body + the largest page surfaces are repainted.
 *  - rising: progressively repaint smaller surface elements (the area threshold
 *           DECREASES as intensity rises).
 *  - `100`: repaint every detected surface AND borders.
 */
export type Intensity = number;

/**
 * The lowest SELECTABLE intensity. We never go to 0 (base-only), which leaves a
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

/** Options that travel with a palette to the in-page adaptive engine. */
export interface ApplyOptions {
  /** Theme-vs-original blend dial, {@link MIN_INTENSITY}–100. */
  intensity: Intensity;
}

/**
 * Buckets of HTML tag names grouped by the role they play when themed.
 * Each value is an array of tag names.
 */
export type HtmlElements = Record<string, string[]>;

/** Metadata describing how a scheme was seeded/generated. */
export interface SchemeDetails {
  rootColor: string;
  colorMode: ColorMode;
  rootColorName?: string;
  /**
   * The structured palette this scheme was built from (Phase 2). Optional so
   * legacy/history fixtures without a palette still type-check; the popup
   * regenerates a palette from `rootColor` + `colorMode` when it is absent.
   */
  palette?: import("./lib/palette").Palette;
  /** The intensity the scheme was generated/applied with. */
  intensity?: Intensity;
}

/**
 * A generated color scheme: a map of tag name -> hex color, plus the
 * `schemeDetails` metadata key. The dynamic tag keys make this loosely typed
 * on purpose.
 */
export interface Scheme {
  schemeDetails: SchemeDetails;
  [tagName: string]: string | SchemeDetails | undefined;
}
