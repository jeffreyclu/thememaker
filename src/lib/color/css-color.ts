/**
 * Tolerant color parsing/formatting — the runtime layer over the pure, throwing
 * `color.ts` for working with computed CSS color values (`rgb()`/`rgba()`/
 * `transparent`/named) that the in-page engine and the element picker read off
 * `getComputedStyle`.
 *
 * `color.ts` is deliberately hex-only and throws on bad input; the page-side code
 * never has a hex in hand — it has a computed `rgb()`/`rgba()` string (or
 * `transparent`). This module is the null-returning runtime surface for that, so
 * the picker and the engine share one parser/formatter.
 *
 * The actual math (rounding to hex, the HSL conversions, contrast, AA relighting)
 * is the canonical `color.ts` core; this module only adds the tolerant string
 * parsing `color.ts` omits, and re-exports the core the engine needs.
 *
 * No DOM, no `chrome.*` — pure string parsing.
 */
import { hexToRgb, normalizeHex, rgbToHex } from ".";
import type { RGB } from ".";

/**
 * Parses any computed CSS color the page-side code encounters — `#hex`,
 * `rgb()`/`rgba()`, or `transparent`/empty — to `[r,g,b]`, or `null` for
 * "no real background" (transparent, alpha 0, or unparseable). The engine's
 * `parseColor` and the picker's parser, unified.
 */
export const parseCssColor = (
  input: string,
): [number, number, number] | null => {
  if (!input) {
    return null;
  }
  const s = input.trim().toLowerCase();
  if (s === "transparent") {
    return null;
  }
  if (s.startsWith("#")) {
    try {
      const { r, g, b } = hexToRgb(s);
      return [r, g, b];
    } catch {
      return null;
    }
  }
  const m = s.match(
    /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/,
  );
  if (m) {
    const a = m[4] === undefined ? 1 : parseFloat(m[4]);
    if (a === 0) {
      return null; // fully transparent: treat as "no background"
    }
    return [Number(m[1]), Number(m[2]), Number(m[3])];
  }
  return null;
};

/** `[r,g,b]` (rounded/clamped) → `#rrggbb`. Thin wrapper over `color.ts`. */
export const rgbTupleToHex = (rgb: [number, number, number]): string =>
  rgbToHex({ r: rgb[0], g: rgb[1], b: rgb[2] });

/**
 * Parses an rgb()/rgba() computed value to `#rrggbb`, or null if unparseable or
 * fully transparent. A transparent value (`transparent`, or alpha 0) returns
 * null, never `#000000`, so a transparent element never seeds a black pick
 * (which would otherwise paint every element of that tag black).
 */
export const cssColorToHex = (value: string): string | null => {
  const s = value.trim().toLowerCase();
  if (s === "transparent") {
    return null;
  }
  const m = s.match(
    /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/,
  );
  if (!m) {
    return null;
  }
  if (m[4] !== undefined && parseFloat(m[4]) === 0) {
    return null; // fully transparent: not a real color
  }
  const h = (n: string): string => Number(n).toString(16).padStart(2, "0");
  return `#${h(m[1])}${h(m[2])}${h(m[3])}`;
};

/**
 * The alpha of a computed background. Hex / rgb() / named → 1 (opaque);
 * rgba(...) → its alpha; transparent / empty → 0. The engine preserves this when
 * painting so a semi-transparent overlay (e.g. an image-grid hover scrim at
 * rgba(0,0,0,0.04)) stays see-through instead of becoming an opaque slab that
 * covers the photo behind it.
 */
export const alphaOf = (input: string): number => {
  const s = (input || "").trim().toLowerCase();
  if (!s || s === "transparent") {
    return 0;
  }
  const m = s.match(/rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([\d.]+)\s*\)/);
  return m ? parseFloat(m[1]) : 1;
};

/** A `#rrggbb` hex re-emitted as `rgba(r,g,b,a)` to carry an alpha. */
export const withAlpha = (hex: string, a: number): string => {
  const c = parseCssColor(hex) ?? [0, 0, 0];
  return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;
};

/**
 * sRGB linear blend of `from` toward `to` by `t` in [0,1] — the intensity dial's
 * blend. Tolerant (unlike `color.ts`'s hex-only `mixHex`): `from`/`to` may be any
 * computed CSS color, and an unparseable/transparent endpoint yields `to` (mixing
 * from "no color" lands fully on the destination).
 */
export const mixCss = (from: string, to: string, t: number): string => {
  const a = parseCssColor(from);
  const b = parseCssColor(to);
  if (!a || !b) {
    return to;
  }
  const k = Math.min(1, Math.max(0, t));
  return rgbTupleToHex([
    a[0] + (b[0] - a[0]) * k,
    a[1] + (b[1] - a[1]) * k,
    a[2] + (b[2] - a[2]) * k,
  ]);
};

export type { RGB };
export { normalizeHex };
