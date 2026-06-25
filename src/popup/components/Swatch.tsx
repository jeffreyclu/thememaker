/**
 * Shared popup VIEW PRIMITIVES: the small color-chip components used by the
 * details, history, and favorites views. Pure presentation — props only, no
 * state, no `chrome.*`. Memoized so list re-renders skip unchanged chips.
 */
import { memo } from "react";

/** A single colored swatch — the small color chip used everywhere. */
export const Swatch = memo(function Swatch({
  className,
  color,
}: {
  className: string;
  color: string;
}) {
  return <span className={className} style={{ backgroundColor: color }} />;
});

/** A strip of swatches (one chip per color), used by history + favorites rows. */
export const SwatchStrip = memo(function SwatchStrip({
  stripClass,
  swatchClass,
  colors,
}: {
  stripClass: string;
  swatchClass: string;
  colors: string[];
}) {
  return (
    <span className={stripClass}>
      {colors.map((color, i) => (
        <Swatch key={`${color}-${i}`} className={swatchClass} color={color} />
      ))}
    </span>
  );
});
