/**
 * Mode <select>: "random" plus every configured color mode. Pure presentation —
 * value + onChange come from props; the container wires them to state/actions.
 */
import { memo } from "react";

import { modes } from "../../config";
import type { ModeSelection } from "../scheme-reducer";

export const ModeSelect = memo(function ModeSelect({
  value,
  onChange,
}: {
  value: ModeSelection;
  onChange: (mode: ModeSelection) => void;
}) {
  return (
    <div className="popup__row">
      <label className="popup__label" htmlFor="mode">
        Mode
      </label>
      <select
        id="mode"
        className="popup__select"
        value={value}
        onChange={(e) => onChange(e.target.value as ModeSelection)}
      >
        <option value="random">Random</option>
        {modes.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    </div>
  );
});
