/**
 * Pure color math — conversions, WCAG luminance/contrast, contrast enforcement,
 * and luminance bucketing.
 *
 * Nothing here touches the DOM or `chrome.*`; it is fully unit-testable. The
 * single source of truth for color math across the extension: both the
 * popup/palette path (`palette.ts`, `color-source.ts`) and the in-page adaptive
 * engine import this core (the engine's tolerant runtime layer,
 * `color-runtime.ts`, wraps it for parsing computed `rgb()`/`rgba()` values).
 */

export interface RGB {
  r: number; // 0..255
  g: number; // 0..255
  b: number; // 0..255
}

export interface HSL {
  h: number; // 0..360
  s: number; // 0..100
  l: number; // 0..100
}

const clamp = (n: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, n));

/** Normalizes a hex string to a 6-digit lowercase form with a leading '#'. */
export const normalizeHex = (hex: string): string => {
  let h = hex.trim().toLowerCase();
  if (h.startsWith("#")) {
    h = h.slice(1);
  }
  if (/^[0-9a-f]{3}$/.test(h)) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (!/^[0-9a-f]{6}$/.test(h)) {
    throw new Error(`invalid hex color: ${hex}`);
  }
  return `#${h}`;
};

/** @returns true if `hex` is a parseable 3- or 6-digit hex color. */
export const isHexColor = (hex: string): boolean => {
  try {
    normalizeHex(hex);
    return true;
  } catch {
    return false;
  }
};

/** Hex (`#rgb`/`#rrggbb`, with or without '#') → RGB (0..255). */
export const hexToRgb = (hex: string): RGB => {
  const h = normalizeHex(hex).slice(1);
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
};

/** RGB (0..255, rounded/clamped) → `#rrggbb`. */
export const rgbToHex = ({ r, g, b }: RGB): string => {
  const to2 = (n: number): string =>
    Math.round(clamp(n, 0, 255))
      .toString(16)
      .padStart(2, "0");
  return `#${to2(r)}${to2(g)}${to2(b)}`;
};

/** RGB (0..255) → HSL (h 0..360, s/l 0..100). */
export const rgbToHsl = ({ r, g, b }: RGB): HSL => {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === rn) {
      h = ((gn - bn) / delta) % 6;
    } else if (max === gn) {
      h = (bn - rn) / delta + 2;
    } else {
      h = (rn - gn) / delta + 4;
    }
    h *= 60;
    if (h < 0) {
      h += 360;
    }
  }

  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));

  return { h, s: s * 100, l: l * 100 };
};

/** HSL (h 0..360, s/l 0..100) → RGB (0..255). */
export const hslToRgb = ({ h, s, l }: HSL): RGB => {
  const hn = ((h % 360) + 360) % 360;
  const sn = clamp(s, 0, 100) / 100;
  const ln = clamp(l, 0, 100) / 100;

  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((hn / 60) % 2) - 1));
  const m = ln - c / 2;

  let r = 0;
  let g = 0;
  let b = 0;
  if (hn < 60) {
    [r, g, b] = [c, x, 0];
  } else if (hn < 120) {
    [r, g, b] = [x, c, 0];
  } else if (hn < 180) {
    [r, g, b] = [0, c, x];
  } else if (hn < 240) {
    [r, g, b] = [0, x, c];
  } else if (hn < 300) {
    [r, g, b] = [x, 0, c];
  } else {
    [r, g, b] = [c, 0, x];
  }

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
};

/** Hex → HSL convenience. */
export const hexToHsl = (hex: string): HSL => rgbToHsl(hexToRgb(hex));

/** HSL → hex convenience. */
export const hslToHex = (hsl: HSL): string => rgbToHex(hslToRgb(hsl));

/** sRGB channel (0..255) → linearized component, per WCAG. */
const linearize = (channel: number): number => {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};

/**
 * WCAG relative luminance of an RGB color, in [0, 1].
 * Black → 0, white → 1.
 */
export const relativeLuminance = ({ r, g, b }: RGB): number =>
  0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);

/** Relative luminance from a hex color. */
export const luminanceOf = (hex: string): number =>
  relativeLuminance(hexToRgb(hex));

/**
 * WCAG contrast ratio between two colors, in [1, 21].
 * Symmetric: `contrastRatio(a, b) === contrastRatio(b, a)`.
 */
export const contrastRatio = (a: string, b: string): number => {
  const la = luminanceOf(a);
  const lb = luminanceOf(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
};

/** WCAG AA minimums. Large text (>=18pt / 14pt bold) needs only 3:1. */
export const AA_NORMAL = 4.5;
export const AA_LARGE = 3;

/** @returns true if `text` on `bg` meets the AA threshold for its size. */
export const meetsContrast = (
  text: string,
  bg: string,
  large = false,
): boolean => contrastRatio(text, bg) >= (large ? AA_LARGE : AA_NORMAL);

/**
 * Shared core for {@link ensureContrast} and {@link nudgeToAA}: relight `color`
 * (preserving hue + saturation) to the nearest lightness that meets `target`
 * against `bg`, walking both directions in fine steps so the move is minimal
 * (least destructive). On a tie, prefers the smaller lightness delta. If neither
 * hue-preserving direction can reach the target, defers to `onFail()`.
 *
 * The two public functions differ only in that fallback thunk, so the search /
 * tie-break body lives here once.
 */
const relightToAA = (
  color: string,
  bg: string,
  target: number,
  onFail: () => string,
): string => {
  if (contrastRatio(color, bg) >= target) {
    return normalizeHex(color);
  }
  const base = hexToHsl(color);
  const search = (dir: 1 | -1): string | null => {
    for (let step = 1; step <= 100; step += 1) {
      const l = base.l + dir * step;
      if (l < 0 || l > 100) {
        break;
      }
      // Preserve hue + saturation; only lightness moves.
      const candidate = hslToHex({ h: base.h, s: base.s, l });
      if (contrastRatio(candidate, bg) >= target) {
        return candidate;
      }
    }
    return null;
  };
  const darker = search(-1);
  const lighter = search(1);
  if (darker && lighter) {
    // Prefer the smaller lightness move.
    const dDelta = Math.abs(hexToHsl(darker).l - base.l);
    const lDelta = Math.abs(hexToHsl(lighter).l - base.l);
    return dDelta <= lDelta ? darker : lighter;
  }
  return darker ?? lighter ?? onFail();
};

/**
 * Adjusts `text`'s lightness (preserving hue/saturation where possible) until it
 * meets WCAG AA against `bg`. Tries darkening and lightening and keeps whichever
 * direction moves the least; if neither hue-preserving direction can reach it,
 * falls back to pure black or white (whichever wins). The returned color always
 * satisfies `meetsContrast(result, bg)`.
 */
export const ensureContrast = (
  text: string,
  bg: string,
  large = false,
): string =>
  relightToAA(text, bg, large ? AA_LARGE : AA_NORMAL, () => {
    // Hue-preserving adjustment can't reach AA (e.g. mid bg) — pick the extreme
    // with the most contrast. This always meets AA for any realistic threshold.
    const blackRatio = contrastRatio("#000000", bg);
    const whiteRatio = contrastRatio("#ffffff", bg);
    return blackRatio >= whiteRatio ? "#000000" : "#ffffff";
  });

/**
 * Nudges `color` to the nearest shade of its own hue that meets WCAG AA against
 * `bg`, by walking lightness in fine steps (preserving hue + saturation).
 *
 * The anti-monochrome contrast strategy: when a saturated accent role (a
 * colorful link/heading/button) fails AA against the background it lands on, it
 * stays colorful — only its lightness shifts to the closest AA-passing version
 * of the same hue, rather than collapsing to black/white (which makes multi-hue
 * palettes read as grayscale). Only if no shade of the hue can reach AA in
 * either direction does it fall back to `ensureContrast` (which ends at the
 * better black/white extreme). Saturation is preserved so the role keeps its
 * identity; the result is guaranteed to meet AA.
 *
 * Behaviorally identical to `ensureContrast` except for the last-resort
 * fallback — both share {@link relightToAA}.
 */
export const nudgeToAA = (color: string, bg: string, large = false): string =>
  relightToAA(color, bg, large ? AA_LARGE : AA_NORMAL, () =>
    ensureContrast(color, bg, large),
  );

/**
 * Linearly blends `from` toward `to` in sRGB space by factor `t` in [0, 1].
 * `t = 0` returns `from`, `t = 1` returns `to` — the core of the intensity dial
 * (how much of the theme is applied vs. the original).
 */
export const mixHex = (from: string, to: string, t: number): string => {
  const k = clamp(t, 0, 1);
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  return rgbToHex({
    r: a.r + (b.r - a.r) * k,
    g: a.g + (b.g - a.g) * k,
    b: a.b + (b.b - a.b) * k,
  });
};

/** Three coarse luminance bands a surface color can fall into. */
export type LuminanceBucket = "dark" | "medium" | "light";

/**
 * Classifies a color into a luminance band. Thresholds are tuned so typical
 * page chrome (near-black, mid-gray, near-white) lands in distinct bands,
 * preserving a page's visual hierarchy when remapped.
 */
export const luminanceBucket = (hex: string): LuminanceBucket => {
  const l = luminanceOf(hex);
  if (l < 0.15) {
    return "dark";
  }
  if (l < 0.55) {
    return "medium";
  }
  return "light";
};
