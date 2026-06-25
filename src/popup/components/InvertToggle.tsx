/**
 * Invert (light↔dark) switch. `checked` reflects the invert flag via
 * `aria-checked`; clicking flips the live theme. Pure presentation.
 */
import { memo } from "react";

export const InvertToggle = memo(function InvertToggle({
  checked,
  onToggle,
}: {
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="popup__row popup__row--between">
      <span className="popup__label" id="invert-label">
        Invert (dark)
      </span>
      <button
        id="invert-toggle"
        className="toggle"
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby="invert-label"
        onClick={onToggle}
      >
        <span className="toggle__track">
          <span className="toggle__thumb" />
        </span>
      </button>
    </div>
  );
});
