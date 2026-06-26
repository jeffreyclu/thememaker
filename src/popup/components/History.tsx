/**
 * History disclosure panel + list. Most-recent first; each entry re-applies on
 * click. Connected: reads its own state + intents from context, so the container
 * passes it nothing. The shared `Disclosure` wraps the toggle + collapsible panel.
 */
import { memo } from "react";

import { ApplyButton } from "./ApplyButton";
import { Disclosure } from "./Disclosure";
import { useSchemeState } from "../state/SchemeProvider";
import { useHistory } from "../hooks/useHistory";
import { usePopupState } from "../state/PopupProvider";
import { usePopup } from "../hooks/usePopup";
import { historyLabel, schemeSwatches } from "../../lib/scheme";

export const History = memo(function History() {
  const { history } = useSchemeState();
  const { showHistory } = usePopupState();
  const { onToggleHistory } = usePopup();
  const { onSelectHistory: onSelect } = useHistory();
  // Most-recent first for display; keep the original index for re-apply.
  const rows = history.map((scheme, index) => ({ scheme, index })).reverse();
  return (
    <Disclosure
      label="History"
      id="history"
      expanded={showHistory}
      onToggle={onToggleHistory}
    >
      <ul id="history" className="history" aria-label="Scheme history">
        {rows.length === 0 ? (
          <li className="history__empty">No history yet. Generate a scheme.</li>
        ) : (
          rows.map(({ scheme, index }) => (
            // Key on the scheme's colors, not the array index — the bounded queue
            // shifts indices as new schemes push in, which an index key would
            // reconcile wrongly. `index` is still the re-apply position.
            <li key={schemeSwatches(scheme).join("|")}>
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
    </Disclosure>
  );
});
