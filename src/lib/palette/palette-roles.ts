/**
 * The palette's semantic role derivation (the anti-monochrome layer): turns a
 * seed HSL + harmony hues into the concrete `roles` the engine paints onto
 * element roles (heading / link / body / buttons / surfaces / …). Pure HSL math,
 * no DOM.
 */
import { hslToHex, luminanceOf } from "../color/color";
import type { HSL } from "../color/color";

/**
 * The concrete, named color slots the in-page engine paints onto semantic
 * element roles. Derived from the seed + harmony hues so multi-hue modes visibly
 * use multiple hues across roles. Every text-ish role (`textPrimary`, `heading`,
 * `link`, …) is a seed color; the engine still AA-nudges it against the actual
 * painted background, so these need only be "the right hue, roughly the right
 * lightness", not pre-verified against any specific surface.
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

/** Wraps a hue into [0, 360). Shared by role derivation + palette accents. */
export const wrapHue = (h: number): number => ((h % 360) + 360) % 360;

/**
 * Derives the concrete semantic `roles` from the seed + harmony.
 *
 * Aims for a visibly multi-color page: not just distinct seeds, but distinct
 * colors visible across the page's dominant mass — backgrounds and body text —
 * not only a couple of accent words. So:
 *  - Backgrounds (`bg`/`surface`/`surfaceAlt`) are tinted "paper" with a
 *    perceptible lightness step between them (≈6–9% L each) and rising
 *    saturation, and on multi-hue modes `surfaceAlt` pulls a different harmony
 *    hue — so page vs card vs code/pre read as genuinely different surfaces,
 *    not three near-identical off-whites.
 *  - `textPrimary` carries a real seed tint (so body copy is "colored ink", not
 *    flat black); `textSecondary` pulls a different harmony hue at a muted
 *    lightness, so secondary/meta text is visibly its own color.
 *  - The accent roles (`heading`, `link`, `primary`, `secondary`, `accent`)
 *    each pull a different harmony hue where the mode provides one (slots wrap),
 *    at high saturation. On monochrome every slot is the seed hue, so these are
 *    separated by lightness steps instead (heading darkest → link → accent).
 *  - `onPrimary`/`onSecondary` are the best-contrasting extreme for the fill.
 *
 * Every value stays inside readable bounds; the engine's AA pass is the final
 * guarantee, but these are chosen to rarely need a destructive nudge.
 */
export const deriveRoles = (
  base: HSL,
  hues: number[],
  isMono: boolean,
  monoBias: number,
): PaletteRoles => {
  const sat = base.s;
  const dark = monoBias < 0; // mono-dark → a dark UI (light text on dark paper)
  // Which way surfaces step from `bg`: darker on a light UI, lighter on dark.
  const step = dark ? +1 : -1;

  // Role → hue. Uses only the mode's true harmony hues (no invented hues), so a
  // complement theme really is 2 colors, a triad 3, a quad 4, and the swatch
  // count reflects that. The seed (the user's root color) is slot 0 and is
  // reserved for `primary` (the dominant accent), so the user's chosen color
  // drives the page. Roles beyond the harmony count reuse harmony hues; they're
  // then separated by lightness (set below), like how monochrome separates
  // same-hue roles.
  const palHues = hues.map((deg) => wrapHue(base.h + deg));
  const hueSlot = (i: number): number => palHues[i % palHues.length];
  const primaryHue = hueSlot(0); // = seed hue (the root color)
  const headingHue = hueSlot(1);
  const linkHue = hueSlot(2);
  const accentHue = hueSlot(3); // inline emphasis / subheading
  // On low-harmony modes (complement = 2 hues, monochrome = 1) slots 4 and 5
  // wrap back onto earlier hues, so `altHue`/`secondaryHue` can equal an earlier
  // role's hue. Distinctness there comes from the lightness/saturation steps set
  // below, not hue — the mechanism monochrome uses to separate same-hue roles.
  const altHue = hueSlot(4); // surfaceAlt / code containers
  const secondaryHue = hueSlot(5); // secondary button / secondary text

  // ---- backgrounds: tinted paper with a visible step + rising saturation ----
  // A light UI sits high (l≈95), a dark UI low (l≈12). Each surface steps ~7% L
  // and gains a little saturation so the tint is perceptible.
  // Backgrounds are "colored but muted": clearly tinted with the theme hue and
  // mid-light (not near-white), but softer than the full-strength accents so
  // text stays readable. Saturation is floored (the hue is always visible) and
  // capped (never garish); lightness sits a notch off paper.
  const bgL = dark ? 16 : 86;
  const clampL = (l: number): number => Math.min(97, Math.max(6, l));
  const clampSat = (lo: number, hi: number): number =>
    Math.min(Math.max(sat, lo), hi);
  // The palette trends intense — the intensity slider is what mutes it. The page
  // is the base surface; cards stand off it with higher saturation + a deeper
  // lightness step; code/nested surfaces step further still.
  const bg = hslToHex({ h: base.h, s: clampSat(34, 56), l: clampL(bgL) });
  // `surface` (cards/sections) on the seed hue, deeper + more saturated so cards
  // stand out as a panel tinted by the root color.
  const surface = hslToHex({
    h: isMono ? base.h : primaryHue,
    s: clampSat(48, 68),
    l: clampL(bgL + step * 9),
  });
  // surfaceAlt (code/pre, nested cards) — a different hue, deeper + more
  // saturated again, so code blocks read as a distinct surface.
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
  // textSecondary pulls its own harmony hue at a muted mid lightness, so
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

  // Primary = the user's root color, verbatim (the seed they picked is the
  // dominant accent painted on the page). Keeps its exact hex so the swatch the
  // user sees is what drives buttons/emphasis/card tint. The label color is
  // whichever extreme best contrasts it (re-verified by the engine's AA pass).
  const primary = hslToHex({ h: base.h, s: base.s, l: base.l });
  const onPrimary = luminanceOf(primary) < 0.4 ? "#ffffff" : "#111111";

  // Secondary button: a tinted, lower-saturation chip on a different hue from
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
