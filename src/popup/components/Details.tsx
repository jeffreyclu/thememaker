/**
 * Details disclosure: the toggle + the panel (the current scheme's seed +
 * per-color detail rows + custom-override rows). CONNECTED: reads its own state +
 * intent from context. The leaf `DetailRow` stays pure.
 */
import { memo } from "react";

import { Swatch } from "./Swatch";
import { usePopupActions, usePopupState } from "../hooks/usePopupContext";
import { overrideRows } from "../state/state-selectors";
import { schemeDetailRows } from "../state/scheme-view-model";
import { describeColor } from "../../lib/color/color-names";

/** A details panel row: swatch + a text label + the hex read-out. */
const DetailRow = memo(function DetailRow({
  text,
  color,
}: {
  text: string;
  color: string;
}) {
  return (
    <div className="details__row">
      <Swatch className="details__swatch" color={color} />
      <span className="details__tags">{text}</span>
      <span className="details__hex">{color}</span>
    </div>
  );
});

export const Details = memo(function Details() {
  const state = usePopupState();
  const { onToggleDetails } = usePopupActions();
  const { current, showDetails: expanded } = state;
  const overrides = overrideRows(state);

  const seed = current
    ? `${current.schemeDetails.rootColorName ?? describeColor(current.schemeDetails.rootColor)} (${current.schemeDetails.colorMode})`
    : "";

  return (
    <section className="popup__section">
      <button
        id="details-toggle"
        className="disclosure"
        type="button"
        aria-expanded={expanded}
        aria-controls="details"
        disabled={!current}
        onClick={onToggleDetails}
      >
        Details
      </button>
      <div id="details" className="details" hidden={!expanded}>
        {current && (
          <>
            <p className="details__seed">{seed}</p>
            {schemeDetailRows(current).map(({ tags, color }) => (
              <DetailRow key={`${tags}-${color}`} text={tags} color={color} />
            ))}
            {overrides.length > 0 && (
              <>
                <p className="details__seed">Custom overrides</p>
                {overrides.map(({ role, color, label }) => (
                  <DetailRow key={role} text={label} color={color} />
                ))}
              </>
            )}
          </>
        )}
      </div>
    </section>
  );
});
