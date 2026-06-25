/**
 * The palette's SWATCH-FOLD logic: turns the derived `roles` into the labeled
 * SOURCE-OF-TRUTH color list the popup shows, folding near-duplicate swatches
 * (same hue family, or both near-neutral) so the count reflects the theme's real
 * number of distinct colors. Split out of `palette.ts` to keep each concern
 * small; pure HSL math, no DOM.
 */
import { hexToHsl } from "../color/color";
import type { PaletteRoles } from "./palette-roles";

/** A labeled theme color: the SOT pairing of a semantic role and its hex. */
export interface ThemeColor {
  /** A short, human label for what this color paints (e.g. "primary"). */
  role: string;
  /** The hex actually painted on the page for that role. */
  color: string;
}

/**
 * The theme's SOURCE-OF-TRUTH color list: the DISTINCT DOMINANT colors the
 * engine paints, in display order, with `primary` (the user's ROOT color) first.
 * The popup shows EXACTLY this, so a swatch == a painted color, and the COUNT
 * reflects the theme's real number of distinct colors:
 *  - a monochrome theme folds to ~1 color (one hue),
 *  - a complement to ~2, a triad to ~3, a quad to ~4,
 * because near-duplicate swatches (same hue family, or both near-neutral) are
 * folded together rather than padded out to six.
 *
 * We surface the ACCENT/identity roles (primary/heading/link/accent/secondary)
 * — the colors that give a theme its character — plus a single representative
 * neutral (surface). Backgrounds/ink are near-neutral tints that read as "the
 * neutral", so they fold into that one swatch instead of inflating the count.
 */
/** Below this HSL saturation a color reads as "neutral" (folds with other neutrals). */
const NEUTRAL_SAT = 18;
/** Two saturated colors within this many hue degrees fold to one swatch. */
const HUE_FOLD_DEG = 22;

export const themeSwatches = (roles: PaletteRoles): ThemeColor[] => {
  // Ordered by visual prominence: the root color leads, then the other accents.
  const ordered: ThemeColor[] = [
    { role: "primary", color: roles.primary },
    { role: "heading", color: roles.heading },
    { role: "link", color: roles.link },
    { role: "accent", color: roles.accent },
    { role: "secondary", color: roles.secondary },
    { role: "text", color: roles.textPrimary },
    { role: "surface", color: roles.surface },
  ];
  // Two colors are the "same swatch" if: both near-neutral (low saturation), OR
  // they share a hue family (close hue) at similar saturation. This collapses a
  // monochrome's lightness steps to one swatch and folds tinted neutrals.
  const sameSwatch = (a: string, b: string): boolean => {
    const x = hexToHsl(a);
    const y = hexToHsl(b);
    const xNeutral = x.s < NEUTRAL_SAT;
    const yNeutral = y.s < NEUTRAL_SAT;
    if (xNeutral && yNeutral) {
      return true; // all near-neutrals read as one "neutral" swatch
    }
    if (xNeutral !== yNeutral) {
      return false;
    }
    // both saturated: fold when within the hue-fold window.
    const dh = Math.abs(x.h - y.h) % 360;
    const hueDist = dh > 180 ? 360 - dh : dh;
    return hueDist < HUE_FOLD_DEG;
  };
  const kept: ThemeColor[] = [];
  for (const tc of ordered) {
    if (!kept.some((k) => sameSwatch(k.color, tc.color))) {
      kept.push(tc);
    }
  }
  return kept;
};
