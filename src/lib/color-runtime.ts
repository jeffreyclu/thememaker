/**
 * RUNTIME (tolerant) color parsing — the layer over the pure, throwing `color.ts`
 * for parsing COMPUTED CSS color values (`rgb()`/`rgba()`/`transparent`).
 *
 * `color.ts` is deliberately hex-only and THROWS on bad input; the element
 * picker (and, later, the in-page engine) need to parse a `getComputedStyle`
 * value, which is always an `rgb()`/`rgba()` string or `"transparent"`. This
 * module is the null-returning runtime surface for that, so the picker and the
 * engine share ONE parser (D3) instead of each re-implementing it.
 *
 * No DOM, no `chrome.*` — pure string parsing.
 */

/**
 * Parses an rgb()/rgba() computed value to `#rrggbb`, or null if unparseable OR
 * fully transparent. A transparent value (`transparent`, or alpha 0) returns
 * null — NEVER `#000000` — so a transparent element never seeds a BLACK pick
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
    return null; // fully transparent → not a real color
  }
  const h = (n: string): string => Number(n).toString(16).padStart(2, "0");
  return `#${h(m[1])}${h(m[2])}${h(m[3])}`;
};
