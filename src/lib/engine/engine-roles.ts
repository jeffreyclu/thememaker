/**
 * Resolves a generated `Palette` + `ApplyOptions` into the concrete RESOLVED
 * ROLE colors the engine paints from — the anti-monochrome layer's runtime side.
 *
 * The palette's `roles` are derived purely in `palette.ts`; here we:
 *  - layer the user's role-keyed `overrides` on top (invalid keys / non-hex
 *    values are ignored; each lands through the engine's AA floor downstream);
 *  - fill safe fallbacks so a legacy palette (no `roles`) still themes;
 *  - compute the intensity BLEND `factor`, the `themedBase` (html/body surface),
 *    the tinted banner/complementary surface bgs, and the `roleText` AA floor.
 *
 * The result is a plain value object threaded into the classifier / var-remap /
 * role-rule / walk modules, so each is a pure function of resolved colors rather
 * than re-reading the palette. No DOM here — pure derivation.
 */
import { luminanceBucket, nudgeToAA } from "../color/color";
import { mixCss, parseCssColor, rgbTupleToHex } from "../color/color-runtime";
import type { Palette } from "../palette/palette";
import type { ApplyOptions } from "../../types";

/** The concrete role colors + blend state the engine paints a page from. */
export interface ResolvedRoles {
  /** Intensity → theme-vs-original blend factor in [0,1]. */
  factor: number;
  /** The fully-themed base surface (html/body) BEFORE blending. */
  themedBase: string;
  roleTextPrimary: string;
  roleTextSecondary: string;
  roleHeading: string;
  roleLink: string;
  roleAccent: string;
  rolePrimary: string;
  roleOnPrimary: string;
  roleSecondary: string;
  roleOnSecondary: string;
  roleSurface: string;
  roleSurfaceAlt: string;
  roleBorder: string;
  /** The DETERMINISTIC tinted bg of a banner (header/nav) surface. */
  bannerBg: string;
  /** The DETERMINISTIC tinted bg of a complementary (aside/footer) surface. */
  complementaryBg: string;
  /** A surface color for a luminance bucket (the palette's surfaces ramp). */
  surfaceFor: (bucket: "dark" | "medium" | "light") => string;
  /**
   * DETERMINISTIC text color from a ROLE SEED, AA-floored against a DETERMINISTIC
   * reference background. A pure function of (seed, refBg, large): independent of
   * any element's original color, the intensity dial, or the live painted bg —
   * which is what stops text FLICKER / drift on churny SPAs.
   */
  roleText: (seed: string, refBg: string, large: boolean) => string;
}

/** Resolves the palette + options into the concrete RESOLVED ROLE colors. */
export const resolveRoles = (
  palette: Palette,
  options: ApplyOptions,
): ResolvedRoles => {
  const surfaces = (palette.surfaces || []).slice();
  const accents = (palette.accents || []).slice();
  const swatches = (palette.swatches || []).slice();
  const surfaceFor = (bucket: "dark" | "medium" | "light"): string => {
    if (surfaces.length === 0) {
      return "#808080";
    }
    if (bucket === "dark") {
      return surfaces[0];
    }
    if (bucket === "light") {
      return surfaces[surfaces.length - 1];
    }
    return surfaces[Math.floor(surfaces.length / 2)];
  };
  const borderSeed =
    accents[accents.length - 1] || swatches[swatches.length - 1] || "#888888";

  const fallbackInk = accents[0] || swatches[0] || "#333333";
  const baseRoles = (palette.roles || {}) as Partial<{
    bg: string;
    surface: string;
    surfaceAlt: string;
    textPrimary: string;
    textSecondary: string;
    heading: string;
    link: string;
    primary: string;
    onPrimary: string;
    secondary: string;
    onSecondary: string;
    border: string;
    accent: string;
  }>;
  // Layer the user's role-keyed overrides on top of the generated roles. Invalid
  // keys or non-hex values are ignored; `<tag>|<prop>` keys are handled by the
  // override CSS layer, not here.
  const overrides = options.overrides || {};
  const roles: typeof baseRoles = { ...baseRoles };
  for (const k of Object.keys(overrides)) {
    const v = overrides[k];
    if (k in roles && parseCssColor(v)) {
      const rgb = parseCssColor(v) as [number, number, number];
      (roles as Record<string, string>)[k] = rgbTupleToHex(rgb);
    }
  }
  const roleTextPrimary = roles.textPrimary || fallbackInk;
  const roleTextSecondary = roles.textSecondary || fallbackInk;
  const roleHeading = roles.heading || fallbackInk;
  const roleLink = roles.link || fallbackInk;
  const roleAccent = roles.accent || fallbackInk;
  const rolePrimary = roles.primary || surfaceFor("medium");
  const roleOnPrimary = roles.onPrimary || "#ffffff";
  const roleSecondary = roles.secondary || surfaceFor("light");
  const roleOnSecondary = roles.onSecondary || "#111111";
  const roleSurface = roles.surface || surfaceFor("light");
  const roleSurfaceAlt = roles.surfaceAlt || surfaceFor("medium");
  const roleBorder = roles.border || borderSeed;

  const themedBase = roles.bg || surfaceFor("light");

  const intensity = Math.min(100, Math.max(0, options.intensity));
  const factor = intensity / 100;

  const roleText = (seed: string, refBg: string, large: boolean): string =>
    nudgeToAA(seed, refBg, large);

  // The DETERMINISTIC tinted bg of each tinted SEMANTIC surface role.
  const bannerBg = mixCss(roleHeading, themedBase, 0.86);
  const complementaryBg = mixCss(roleLink, themedBase, 0.86);

  return {
    factor,
    themedBase,
    roleTextPrimary,
    roleTextSecondary,
    roleHeading,
    roleLink,
    roleAccent,
    rolePrimary,
    roleOnPrimary,
    roleSecondary,
    roleOnSecondary,
    roleSurface,
    roleSurfaceAlt,
    roleBorder,
    bannerBg,
    complementaryBg,
    surfaceFor,
    roleText,
  };
};

/** Re-export so role-keyed remap can bucket a detected var's value. */
export { luminanceBucket };
