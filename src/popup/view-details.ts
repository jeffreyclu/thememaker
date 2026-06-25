/**
 * Popup DETAILS disclosure renderer (pure presentation).
 *
 * Renders the current scheme's seed + per-color detail rows + custom-override
 * rows. Split out of `view.ts` so each list renderer is independently small; it
 * reuses the shared `makeSwatch` chip primitive from `view.ts`.
 */
import { makeSwatch } from "./view-primitives";
import { overrideRows, type PopupState } from "./state";
import { schemeDetailRows } from "./scheme-view-model";
import { describeColor } from "../lib/color-names";

/** A details panel row: swatch + a text label + the hex read-out. */
const makeDetailRow = (text: string, color: string): HTMLDivElement => {
  const row = document.createElement("div");
  row.className = "details__row";

  const label = document.createElement("span");
  label.className = "details__tags";
  label.textContent = text;

  const hex = document.createElement("span");
  hex.className = "details__hex";
  hex.textContent = color;

  row.append(makeSwatch("details__swatch", color), label, hex);
  return row;
};

const makeDetailsSeed = (text: string): HTMLParagraphElement => {
  const seed = document.createElement("p");
  seed.className = "details__seed";
  seed.textContent = text;
  return seed;
};

export const renderDetails = (
  state: PopupState,
  container: HTMLElement,
): void => {
  container.innerHTML = "";
  if (!state.current) {
    return;
  }
  const { rootColorName, rootColor, colorMode } = state.current.schemeDetails;
  const name = rootColorName ?? describeColor(rootColor);
  container.appendChild(makeDetailsSeed(`${name} (${colorMode})`));

  for (const { tags, color } of schemeDetailRows(state.current)) {
    container.appendChild(makeDetailRow(tags, color));
  }

  // Custom overrides (the picker's per-tag picks), if any.
  const overrides = overrideRows(state);
  if (overrides.length > 0) {
    container.appendChild(makeDetailsSeed("Custom overrides"));
    for (const { color, label } of overrides) {
      container.appendChild(makeDetailRow(label, color));
    }
  }
};
