/**
 * History disclosure panel + list. Most-recent first; each entry re-applies on
 * click. CONNECTED: reads its own state + intents from context, so the container
 * passes it nothing.
 */
import { memo } from "react";

import { ApplyButton } from "./ApplyButton";
import { usePopupActions, usePopupState } from "../hooks/usePopupContext";
import { historyLabel, schemeSwatches } from "../state/scheme-view-model";

export const History = memo(function History() {
  const { history, showHistory: expanded } = usePopupState();
  const { onToggleHistory: onToggle, onSelectHistory: onSelect } =
    usePopupActions();
  // Most-recent first for display; keep the ORIGINAL index for re-apply.
  const rows = history.map((scheme, index) => ({ scheme, index })).reverse();
  return (
    <section className="popup__section">
      <button
        id="history-toggle"
        className="disclosure"
        type="button"
        aria-expanded={expanded}
        aria-controls="history-panel"
        onClick={onToggle}
      >
        History
      </button>
      <div id="history-panel" className="disclosure-panel" hidden={!expanded}>
        <ul id="history" className="history" aria-label="Scheme history">
          {rows.length === 0 ? (
            <li className="history__empty">
              No history yet. Generate a scheme.
            </li>
          ) : (
            rows.map(({ scheme, index }) => (
              <li key={index}>
                <ApplyButton
                  buttonClass="history__item"
                  labelClass="history__label"
                  labelText={historyLabel(scheme, index)}
                  stripClass="history__swatches"
                  swatchClass="history__swatch"
                  swatches={schemeSwatches(scheme)}
                  onClick={() => onSelect(index)}
                  data={{ "data-history-index": String(index) }}
                />
              </li>
            ))
          )}
        </ul>
      </div>
    </section>
  );
});
