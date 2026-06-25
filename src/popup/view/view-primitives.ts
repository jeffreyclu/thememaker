/**
 * Shared popup VIEW PRIMITIVES: the small color-chip builders used by the
 * details, history, and favorites renderers. Pure DOM construction — no state,
 * no `chrome.*`. Kept in their own module so the list renderers and `view.ts`
 * share them without an import cycle.
 */

/** A single colored swatch `<span>` (the small color chip used everywhere). */
export const makeSwatch = (
  className: string,
  color: string,
): HTMLSpanElement => {
  const swatch = document.createElement("span");
  swatch.className = className;
  swatch.style.backgroundColor = color;
  return swatch;
};

/** A strip of swatches (one chip per color), used by history + favorites rows. */
export const makeSwatchStrip = (
  stripClass: string,
  swatchClass: string,
  colors: string[],
): HTMLSpanElement => {
  const strip = document.createElement("span");
  strip.className = stripClass;
  for (const color of colors) {
    strip.appendChild(makeSwatch(swatchClass, color));
  }
  return strip;
};
