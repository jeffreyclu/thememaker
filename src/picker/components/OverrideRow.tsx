/**
 * One override row: a label, an uncontrolled color input, and a clear (×) button.
 * Pure presentation — props only. Memoized so unchanged rows skip re-render.
 *
 * The color input is uncontrolled (`defaultValue`, no `value`): a controlled value
 * would let React replace the live `<input type="color">` mid-drag, closing the
 * native color dialog. The input shows its own value while dragging; the apply
 * hook applies each `input` event live. The parent supplies a `key` of role+seed
 * so a re-pick (new seed) remounts the input with the fresh color.
 */
import { memo } from "react";

import type { OverrideRow as OverrideRowData } from "../../lib/override-keys";

export const OverrideRow = memo(function OverrideRow({
  row,
  onColorChange,
  onClearRole,
}: {
  row: OverrideRowData;
  onColorChange: (role: string, color: string) => void;
  onClearRole: (role: string) => void;
}) {
  return (
    <li className="row">
      <span className="row__label">{row.label}</span>
      <input
        type="color"
        className="row__color"
        defaultValue={row.color}
        aria-label={`${row.label} color`}
        onInput={(e) => onColorChange(row.role, e.currentTarget.value)}
      />
      <button
        type="button"
        className="iconbtn"
        title="Clear"
        aria-label={`Clear ${row.label} override`}
        onClick={() => onClearRole(row.role)}
      >
        ×
      </button>
    </li>
  );
});
