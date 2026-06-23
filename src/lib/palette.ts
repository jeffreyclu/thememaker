/**
 * Local-first, PURE palette generation via HSL color theory.
 *
 * Given a seed hex + mode, this produces a deterministic, offline, instant
 * palette — the DEFAULT color source. `thecolorapi.com` is an OPTIONAL
 * "surprise me" source layered on top (see `color-source.ts`), which falls back
 * here when the network fails.
 *
 * No DOM, no `chrome.*`. The output is a structured `Palette` consumed by the
 * mapping core (`mapping.ts`) and surfaced in the popup as swatches.
 */
import { hexToHsl, hslToHex, luminanceOf, normalizeHex } from "./color";
import type { HSL } from "./color";
import type { ColorMode } from "../types";

/**
 * A structured palette. `surfaces` are ordered dark→light (used for luminance
 * bucketing onto the page's existing surfaces); `accents` are the harmony hues
 * for text/links/borders. `seed` is the originating color.
 */
export interface Palette {
  seed: string;
  mode: ColorMode;
  /** Harmony swatches, ordered for display (seed-derived hues). */
  swatches: string[];
  /** Background candidates, sorted ascending by luminance (dark → light). */
  surfaces: string[];
  /** Foreground/accent candidates for text, links, borders. */
  accents: string[];
}

const wrapHue = (h: number): number => ((h % 360) + 360) % 360;

/** Rotates a base HSL's hue by `deg`, returning a hex. */
const rotate = (base: HSL, deg: number): string =>
  hslToHex({ ...base, h: wrapHue(base.h + deg) });

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

  // Swatches: the harmony hues at a pleasant, readable lightness band.
  const swatches = isMono
    ? // Monochrome → one hue spread across lightness steps.
      [22, 38, 54, 70, 86].map((l) =>
        atLightness(base, Math.min(96, Math.max(8, l + monoBias))),
      )
    : hues.map((deg) => rotate(base, deg));

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
  // (Contrast enforcement in the mapping core fixes these against each surface.)
  const accents = isMono
    ? swatches
    : hues.map((deg) =>
        hslToHex({ h: wrapHue(base.h + deg), s: base.s, l: 45 }),
      );

  return { seed: seedHex, mode, swatches, surfaces, accents };
};
