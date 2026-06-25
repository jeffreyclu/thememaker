/**
 * A labeled `<button>` with a right-aligned swatch strip — the shared body of a
 * history item and a favorite's apply control. Pure presentation. `data` is
 * spread onto the button so each list can carry its own test/query attributes.
 */
import { memo } from "react";

import { SwatchStrip } from "./Swatch";

export const ApplyButton = memo(function ApplyButton({
  buttonClass,
  labelClass,
  labelText,
  stripClass,
  swatchClass,
  swatches,
  onClick,
  data,
}: {
  buttonClass: string;
  labelClass: string;
  labelText: string;
  stripClass: string;
  swatchClass: string;
  swatches: string[];
  onClick: () => void;
  data?: Record<`data-${string}`, string>;
}) {
  return (
    <button type="button" className={buttonClass} onClick={onClick} {...data}>
      <span className={labelClass}>{labelText}</span>
      <SwatchStrip
        stripClass={stripClass}
        swatchClass={swatchClass}
        colors={swatches}
      />
    </button>
  );
});
