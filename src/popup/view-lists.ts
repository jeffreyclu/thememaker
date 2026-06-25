/**
 * Popup LIST renderers (pure presentation): the history + favorites disclosures.
 *
 * Both render a labeled, swatch-stripped button per entry; the shared
 * `makeApplyButton` helper builds that common body so the two `forEach`/`for`
 * bodies don't duplicate it (favorites just adds a delete button per row).
 */
import { makeSwatchStrip } from "./view-primitives";
import { historyLabel, schemeSwatches } from "./scheme-view-model";
import type { PopupState } from "./state";
import type { Favorite } from "../lib/storage";

/**
 * A labeled `<button>` with a right-aligned swatch strip — the shared body of a
 * history item and a favorite's apply control. `data` is written verbatim onto
 * `button.dataset` so each list can carry its own click-target attribute.
 */
const makeApplyButton = (
  buttonClass: string,
  labelClass: string,
  labelText: string,
  stripClass: string,
  swatchClass: string,
  swatches: string[],
  data: Record<string, string>,
): HTMLButtonElement => {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = buttonClass;
  for (const [key, value] of Object.entries(data)) {
    btn.dataset[key] = value;
  }

  const label = document.createElement("span");
  label.className = labelClass;
  label.textContent = labelText;

  // Number/name on the left, swatches right-aligned (CSS pushes them).
  btn.append(label, makeSwatchStrip(stripClass, swatchClass, swatches));
  return btn;
};

const makeEmpty = (className: string, text: string): HTMLLIElement => {
  const empty = document.createElement("li");
  empty.className = className;
  empty.textContent = text;
  return empty;
};

export const renderHistory = (state: PopupState, list: HTMLElement): void => {
  list.innerHTML = "";
  if (state.history.length === 0) {
    list.appendChild(
      makeEmpty("history__empty", "No history yet. Generate a scheme."),
    );
    return;
  }
  // Most-recent first for display.
  state.history
    .map((scheme, index) => ({ scheme, index }))
    .reverse()
    .forEach(({ scheme, index }) => {
      const li = document.createElement("li");
      li.appendChild(
        makeApplyButton(
          "history__item",
          "history__label",
          historyLabel(scheme, index),
          "history__swatches",
          "history__swatch",
          schemeSwatches(scheme),
          { historyIndex: String(index) },
        ),
      );
      list.appendChild(li);
    });
};

export const renderFavorites = (
  favorites: Favorite[],
  list: HTMLElement,
): void => {
  list.innerHTML = "";
  if (favorites.length === 0) {
    list.appendChild(
      makeEmpty("favorites__empty", "No favorites yet. Save a scheme."),
    );
    return;
  }
  for (const fav of favorites) {
    const li = document.createElement("li");
    li.className = "favorites__item";

    // The clickable body (apply on click). A button so it's keyboard-operable.
    const apply = makeApplyButton(
      "favorites__apply",
      "favorites__label",
      fav.name,
      "favorites__swatches",
      "favorites__swatch",
      schemeSwatches(fav.scheme),
      { favoriteId: fav.id },
    );

    const del = document.createElement("button");
    del.type = "button";
    del.className = "favorites__delete";
    del.dataset.favoriteDelete = fav.id;
    del.setAttribute("aria-label", `Delete favorite ${fav.name}`);
    del.title = "Delete";
    del.textContent = "×";

    li.append(apply, del);
    list.appendChild(li);
  }
};
