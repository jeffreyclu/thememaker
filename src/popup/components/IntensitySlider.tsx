/**
 * Live surface-coverage slider (10–100). Fires `onChange` on every drag input;
 * the action debounces the actual re-apply so the page re-shapes smoothly. Pure
 * presentation — value + onChange come from props.
 */
import { memo } from "react";

import { MIN_INTENSITY } from "../../types";
import type { Intensity } from "../../types";

/** The slider's upper bound (the original popup hardcoded `max="100"`). */
const MAX_INTENSITY = 100;

export const IntensitySlider = memo(function IntensitySlider({
  value,
  onChange,
}: {
  value: Intensity;
  onChange: (intensity: Intensity) => void;
}) {
  return (
    <div className="popup__row">
      <label className="popup__label" htmlFor="intensity">
        Intensity
      </label>
      <input
        id="intensity"
        className="popup__slider"
        type="range"
        min={MIN_INTENSITY}
        max={MAX_INTENSITY}
        step={1}
        value={value}
        aria-valuemin={MIN_INTENSITY}
        aria-valuemax={MAX_INTENSITY}
        aria-valuenow={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <output
        id="intensity-value"
        className="popup__slider-value"
        htmlFor="intensity"
      >
        {value}
      </output>
    </div>
  );
});
