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
import type { ColorMode } from "../types";

/**
 * The concrete, named color slots the in-page engine paints onto semantic
 * element roles. Derived from the seed + harmony hues so multi-hue modes VISIBLY
 * use multiple hues across roles. Every text-ish role (`textPrimary`, `heading`,
 * `link`, …) is a SEED color; the engine still AA-nudges it against the
 * actual painted background, so these need only be "the right hue, roughly the
 * right lightness", not pre-verified against any specific surface.
 */
export interface PaletteRoles {
  /** Page background — tinted, mostly-neutral "paper". */
  bg: string;
  /** Elevated/card surface — slightly offset from `bg`. */
  surface: string;
  /** Secondary elevated surface (e.g. code/pre, nested cards). */
  surfaceAlt: string;
  /** Default body/paragraph ink — near-neutral, faintly tinted. */
  textPrimary: string;
  /** Muted/secondary text (small, captions, meta) — lower contrast tint. */
  textSecondary: string;
  /** Headings/titles (h1, h2) — carries an accent hue. */
  heading: string;
  /** Hyperlinks — carries its OWN accent hue, distinct from body + heading. */
  link: string;
  /** Primary button fill (saturated accent). */
  primary: string;
  /** Label color on a primary button (AA against `primary`). */
  onPrimary: string;
  /** Secondary button fill (subtler/surface-like). */
  secondary: string;
  /** Label color on a secondary button (AA against `secondary`). */
  onSecondary: string;
  /** Divider/border color. */
  border: string;
  /** General-purpose accent (icons, focus rings, misc). */
  accent: string;
}

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

const wrapHue = (h: number): number => ((h % 360) + 360) % 360;

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
 * Derives the concrete semantic `roles` from the seed + harmony.
 *
 * The goal is a VISIBLY multi-color page (the user's "I want 6 colors"): not
 * just distinct seeds, but distinct colors you can actually SEE across the
 * page's dominant mass — backgrounds and body text — not only a couple of
 * accent words. So:
 *  - Backgrounds (`bg`/`surface`/`surfaceAlt`) are tinted "paper" with a
 *    PERCEPTIBLE lightness STEP between them (≈6–9% L each) AND rising
 *    saturation, and on multi-hue modes `surfaceAlt` pulls a DIFFERENT harmony
 *    hue — so page vs card vs code/pre read as genuinely different surfaces,
 *    not three near-identical off-whites.
 *  - `textPrimary` carries a real seed tint (so body copy is "colored ink", not
 *    flat black); `textSecondary` pulls a DIFFERENT harmony hue at a muted
 *    lightness, so secondary/meta text is visibly its own color.
 *  - The ACCENT roles (`heading`, `link`, `primary`, `secondary`, `accent`)
 *    each pull a DIFFERENT harmony hue where the mode provides one (slots wrap),
 *    at high saturation. On monochrome every slot is the seed hue, so these are
 *    separated by lightness steps instead (heading darkest → link → accent).
 *  - `onPrimary`/`onSecondary` are the best-contrasting extreme for the fill.
 *
 * Every value stays inside readable bounds; the engine's AA pass is the final
 * guarantee, but these are chosen to rarely NEED a destructive nudge.
 */
const deriveRoles = (
  base: HSL,
  hues: number[],
  isMono: boolean,
  monoBias: number,
): PaletteRoles => {
  const sat = base.s;
  const dark = monoBias < 0; // mono-dark → a dark UI (light text on dark paper)
  // Which way surfaces step from `bg`: darker on a light UI, lighter on dark.
  const step = dark ? +1 : -1;

  // Role → hue. We use ONLY the mode's TRUE harmony hues (no invented hues), so
  // a complement theme really is 2 colors, a triad 3, a quad 4 — honest to the
  // mode, and the swatch count reflects that. The SEED (the user's ROOT color)
  // is slot 0 and is reserved for `primary` (the dominant accent), so the user's
  // chosen color drives the page. Roles beyond the harmony count REUSE harmony
  // hues; they're then separated by lightness (set below), exactly like how
  // monochrome separates same-hue roles.
  const palHues = hues.map((deg) => wrapHue(base.h + deg));
  const hueSlot = (i: number): number => palHues[i % palHues.length];
  const primaryHue = hueSlot(0); // = seed hue (the root color)
  const headingHue = hueSlot(1);
  const linkHue = hueSlot(2);
  const accentHue = hueSlot(3); // inline emphasis / subheading
  // On low-harmony modes (complement = 2 hues, monochrome = 1) slots 4 and 5
  // wrap back onto earlier hues, so `altHue`/`secondaryHue` can equal an earlier
  // role's hue. Distinctness there comes from the LIGHTNESS/SATURATION steps set
  // below, not hue — same mechanism monochrome uses to separate same-hue roles.
  const altHue = hueSlot(4); // surfaceAlt / code containers
  const secondaryHue = hueSlot(5); // secondary button / secondary text

  // ---- backgrounds: tinted paper with a VISIBLE step + rising saturation ----
  // A light UI sits high (l≈95), a dark UI low (l≈12). Each surface steps ~7% L
  // and gains a little saturation so the tint is perceptible.
  // Backgrounds are "colored but muted": clearly tinted with the theme hue and
  // mid-light (not near-white), but softer than the full-strength accents so
  // text stays readable. Saturation is FLOORED (the hue is always visible) and
  // capped (never garish); lightness sits a notch off paper.
  const bgL = dark ? 16 : 86;
  const clampL = (l: number): number => Math.min(97, Math.max(6, l));
  const clampSat = (lo: number, hi: number): number =>
    Math.min(Math.max(sat, lo), hi);
  // The palette trends INTENSE — the INTENSITY SLIDER is what mutes it. The page
  // is the base surface; cards POP off it with clearly HIGHER saturation + a
  // deeper lightness step; code/nested surfaces pop further still.
  const bg = hslToHex({ h: base.h, s: clampSat(34, 56), l: clampL(bgL) });
  // `surface` (cards/sections) on the SEED hue, deeper + more saturated so cards
  // stand out as a panel tinted by the root color.
  const surface = hslToHex({
    h: isMono ? base.h : primaryHue,
    s: clampSat(48, 68),
    l: clampL(bgL + step * 9),
  });
  // surfaceAlt (code/pre, nested cards) — a DIFFERENT hue, deeper + more
  // saturated again, so code blocks read as a distinct, popping surface.
  const surfaceAlt = hslToHex({
    h: isMono ? base.h : altHue,
    s: clampSat(56, 76),
    l: clampL(bgL + step * 16),
  });

  // ---- body / secondary ink: colored, not flat ----------------------------
  // textPrimary carries a real seed tint so body copy reads as colored ink.
  const textPrimary = hslToHex({
    h: base.h,
    s: Math.min(Math.max(sat, 30), 45),
    l: dark ? 86 : 20,
  });
  // textSecondary pulls its OWN harmony hue at a muted mid lightness, so
  // captions/meta are visibly their own color (not just a grayer body).
  const textSecondary = hslToHex({
    h: isMono ? base.h : secondaryHue,
    s: isMono ? Math.min(sat, 28) : 45,
    l: dark ? 66 : 40,
  });

  // ---- accent roles: high saturation, distinct hues -----------------------
  const accentSat = Math.max(58, Math.min(85, sat || 65));
  // Monochrome separates accent roles by lightness; multi-hue by hue (so they
  // can share a tight, readable lightness band — their hue differentiates).
  const headingL = isMono ? clampL(30 + monoBias) : 40;
  const linkL = isMono ? clampL(46 + monoBias) : 46;
  const accentL = isMono ? clampL(58 + monoBias) : 52;

  const heading = hslToHex({ h: headingHue, s: accentSat, l: headingL });
  const link = hslToHex({ h: linkHue, s: accentSat, l: linkL });
  const accent = hslToHex({ h: accentHue, s: accentSat, l: accentL });

  // Primary = the user's ROOT color, verbatim (the SOT: the seed they picked is
  // the dominant accent painted on the page). We keep its exact hex so the swatch
  // the user sees IS what drives buttons/emphasis/card tint. The label color is
  // whichever extreme best contrasts it (re-verified by the engine's AA pass).
  const primary = hslToHex({ h: base.h, s: base.s, l: base.l });
  const onPrimary = luminanceOf(primary) < 0.4 ? "#ffffff" : "#111111";

  // Secondary button: a TINTED, lower-saturation chip on a DIFFERENT hue from
  // primary — clearly "less emphasis" but still colored (not gray), so the two
  // buttons read as two different colors.
  const secondary = hslToHex({
    h: secondaryHue,
    s: Math.min(Math.max(sat, 30), 40),
    l: dark ? 30 : 84,
  });
  const onSecondary = luminanceOf(secondary) < 0.4 ? "#f5f5f5" : "#1a1a1a";

  // Border: a tinted seed-hue line, mid lightness between paper and ink.
  const border = hslToHex({
    h: base.h,
    s: Math.min(Math.max(sat, 24), 34),
    l: dark ? 42 : 72,
  });

  return {
    bg,
    surface,
    surfaceAlt,
    textPrimary,
    textSecondary,
    heading,
    link,
    primary,
    onPrimary,
    secondary,
    onSecondary,
    border,
    accent,
  };
};

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
