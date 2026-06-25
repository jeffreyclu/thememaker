/**
 * The floating-control panel (connected root of the React app): activates the
 * picker's effect hooks (arm element-pick, Esc-to-close), reads the live
 * overrides from context, derives the rows via the pure model, and binds the
 * apply/persist intents. Renders the panel chrome (header, hint, rows list,
 * Clear all / Done).
 *
 * The color input on each row stays uncontrolled (see {@link OverrideRow}), so a
 * color change applies live without re-rendering the input the user is dragging.
 */
import { memo } from "react";

import { OverrideRow } from "./OverrideRow";
import { usePickerState } from "../state/PickerProvider";
import { useApplyOverrides } from "../hooks/useApplyOverrides";
import { usePickerKeys } from "../hooks/usePickerKeys";
import { usePickSession } from "../hooks/usePickSession";
import { overrideRows } from "./override-rows";

export const Panel = memo(function Panel() {
  usePickSession();
  usePickerKeys();
  const { overrides, onClose } = usePickerState();
  const { onColorChange, onClearRole, onClearAll } = useApplyOverrides();
  const rows = overrideRows(overrides);

  return (
    <div className="panel">
      <div className="header">
        <span className="title">Pick a color</span>
      </div>
      <p className="hint">
        Click any element on the page to recolor every element of its tag.
      </p>
      <ul className="rows" aria-label="Custom color overrides">
        {rows.length === 0 ? (
          <li className="empty">No custom colors yet. Click an element.</li>
        ) : (
          rows.map((row) => (
            // `key` of role+seed remounts the uncontrolled input on a re-pick so
            // it starts from the fresh seed color.
            <OverrideRow
              key={`${row.role}:${row.color}`}
              row={row}
              onColorChange={onColorChange}
              onClearRole={onClearRole}
            />
          ))
        )}
      </ul>
      <div className="actions">
        <button
          type="button"
          className="btn"
          disabled={rows.length === 0}
          onClick={onClearAll}
        >
          Clear all
        </button>
        <button type="button" className="btn btn--primary" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
});
