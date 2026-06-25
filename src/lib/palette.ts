/**
 * Local-first, PURE palette generation via HSL color theory.
 *
 * Given a seed hex + mode, this produces a deterministic, offline, instant
 * palette — the DEFAULT color source. `thecolorapi.com` is an OPTIONAL
 * "surprise me" source layered on top (see `color-source.ts`), which falls back
 * here when the network fails.
 *
 * No DOM, no `chrome.*`. The output is a structured `Palette` consumed by the
 * in-page adaptive engine (`inject.ts`) and surfaced in the popup as swatches.
 *
 * ## Semantic roles (the anti-monochrome fix)
 *
 * Raw `surfaces`/`accents` ramps are NOT enough: painting every background from
 * one desaturated surface ramp and every text run from `accents[0]` collapses a
 * 5-color palette to two visible colors. So we ALSO derive a `roles` object that
 * spends the WHOLE harmony by assigning DISTINCT colors to DISTINCT SEMANTIC
 * ROLES (heading / link / body / primary button / …). Multi-hue modes pull
 * DIFFERENT harmony hues for different roles (e.g. triad: heading=hue A,
 * link=hue B, primary=hue C); monochrome modes differentiate roles by lightness
 * / saturation steps so hierarchy stays clear. Backgrounds remain tinted, mostly
 * neutral "paper"; links / buttons / headings carry the saturated accent hues.
 * The in-page engine (`inject.ts`) then enforces AA on every pair.
 */
import { hexToHsl, hslToHex, luminanceOf, normalizeHex } from "./color";
import type { HSL } from "./color";
import { deriveRoles, wrapHue, type PaletteRoles } from "./palette-roles";
import { themeSwatches, type ThemeColor } from "./palette-swatches";
import type { ColorMode } from "../types";

// Re-exported so existing consumers keep importing the palette's public types
// from `./palette` (the `Palette` interface below references both).
export type { PaletteRoles, ThemeColor };

/**
 * A structured palette. `surfaces` are ordered dark→light (used for luminance
 * bucketing onto the page's existing surfaces); `accents` are the harmony hues
 * for text/links/borders. `seed` is the originating color. `roles` is the
 * concrete semantic mapping the engine actually paints from.
 */
export interface Palette {
  seed: string;
  mode: ColorMode;
  /**
   * The SOURCE-OF-TRUTH swatches: the DISTINCT colors actually painted on the
   * page, in display order (primary/root first), de-duplicated. This is what the
   * popup shows — a swatch is always a real painted color, and the count matches
   * the theme's real number of distinct colors.
   */
  swatches: string[];
  /** Background candidates, sorted ascending by luminance (dark → light). */
  surfaces: string[];
  /** Foreground/accent candidates for text, links, borders. */
  accents: string[];
  /** Concrete semantic role → color mapping (the anti-monochrome layer). */
  roles: PaletteRoles;
  /**
   * The labeled SOURCE-OF-TRUTH color list (role + hex), in display order. The
   * popup renders these (label + swatch) so what the user sees is exactly what
   * is painted. `swatches` is just the hex projection of this list.
   */
  themeColors: ThemeColor[];
}

/** Sets a base HSL's lightness, returning a hex. */
const atLightness = (base: HSL, l: number): string => hslToHex({ ...base, l });

/**
 * Builds an evenly-spread set of surfaces from a base hue across the lightness
 * range, so bucketing always has a dark, medium, and light option available.
 */
const surfaceRamp = (base: HSL): string[] => {
  // Slightly desaturate surfaces so backgrounds read as tinted neutrals, not
  // fully saturated blocks — this is what makes themed pages look intentional.
  const s = Math.min(base.s, 40);
  return [10, 22, 50, 78, 92].map((l) => hslToHex({ h: base.h, s, l }));
};

/** Generates the harmony hue offsets (relative to the seed) for a given mode. */
const harmonyHues = (mode: ColorMode): number[] => {
  switch (mode) {
    case "complement":
      return [0, 180];
    case "analogic-complement":
      return [0, 30, -30, 180];
    case "triad":
      return [0, 120, 240];
    case "quad":
      return [0, 90, 180, 270];
    case "monochrome":
    case "monochrome-dark":
    case "monochrome-light":
    default:
      return [0];
  }
};

/**
 * Generates a `Palette` from a seed color + mode using HSL harmony.
 *
 * Pure & deterministic: same inputs → same palette. Always returns valid hex.
 */
export const generatePalette = (seed: string, mode: ColorMode): Palette => {
  const seedHex = normalizeHex(seed);
  const base = hexToHsl(seedHex);

  const isMono = mode.startsWith("monochrome");
  // Monochrome variants bias the whole palette dark or light.
  const monoBias =
    mode === "monochrome-dark" ? -18 : mode === "monochrome-light" ? 18 : 0;

  const hues = harmonyHues(mode);

  // Surfaces: a lightness ramp on the seed hue, biased per mono variant.
  const surfaceBase: HSL = {
    h: base.h,
    s: base.s,
    l: Math.min(96, Math.max(4, base.l + monoBias)),
  };
  const surfaces = [...surfaceRamp(surfaceBase)].sort(
    (a, b) => luminanceOf(a) - luminanceOf(b),
  );

  // Accents: harmony hues at a mid lightness, used as text/link/border seeds.
  // (Contrast enforcement in the in-page engine fixes these against each surface.)
  const accents = isMono
    ? [22, 38, 54, 70, 86].map((l) =>
        atLightness(base, Math.min(96, Math.max(8, l + monoBias))),
      )
    : hues.map((deg) =>
        hslToHex({ h: wrapHue(base.h + deg), s: base.s, l: 45 }),
      );

  const roles = deriveRoles(base, hues, isMono, monoBias);

  // SOURCE OF TRUTH: the distinct colors the engine actually paints. `swatches`
  // is the hex projection of this labeled list, so the popup display == the DOM.
  const themeColors = themeSwatches(roles);
  const swatches = themeColors.map((tc) => tc.color);

  return {
    seed: seedHex,
    mode,
    swatches,
    surfaces,
    accents,
    roles,
    themeColors,
  };
};

/** Flips a single hex's LIGHTNESS (l → 100 − l), keeping its hue + saturation. */
const invertLightness = (hex: string): string => {
  const c = hexToHsl(normalizeHex(hex));
  return hslToHex({ h: c.h, s: c.s, l: 100 - c.l });
};

/**
 * Maps `fn` over every color in a {@link PaletteRoles}, preserving its fixed key
 * set. Type-safe with NO `as unknown as` round-trip: the accumulator is typed as
 * a partial `PaletteRoles` and the keys are narrowed to `keyof PaletteRoles`, so
 * the result is a full `PaletteRoles` once every role is visited.
 */
const mapRoles = (
  roles: PaletteRoles,
  fn: (color: string) => string,
): PaletteRoles => {
  const out = {} as Record<keyof PaletteRoles, string>;
  for (const key of Object.keys(roles) as (keyof PaletteRoles)[]) {
    out[key] = fn(roles[key]);
  }
  return out;
};

/**
 * Returns a NEW palette with every derived color's lightness flipped — turning a
 * light theme into a dark one (and vice versa) while keeping hues. `seed`/`mode`
 * are untouched (the root-color identity stays). Self-inverse (mod rounding).
 */
export const invertPalette = (palette: Palette): Palette => ({
  ...palette,
  surfaces: palette.surfaces.map(invertLightness),
  accents: palette.accents.map(invertLightness),
  swatches: palette.swatches.map(invertLightness),
  roles: mapRoles(palette.roles, invertLightness),
  themeColors: palette.themeColors.map((tc) => ({
    ...tc,
    color: invertLightness(tc.color),
  })),
});
