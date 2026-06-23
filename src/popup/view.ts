/**
 * Popup view layer: renders `PopupState` into the popup DOM.
 *
 * Pure presentation — no chrome.*, no business logic. The controller owns state
 * and IO and calls `render` after each transition. Event wiring is done once in
 * `bindEvents`, dispatching intents back to the controller via callbacks.
 */
import {
  historyLabel,
  overrideRows,
  schemeDetailRows,
  type ModeSelection,
  type PopupState,
} from "./state";
import { modes } from "../config";
import { describeColor } from "../lib/color-names";
import type { Intensity } from "../types";
import type { Favorite } from "../lib/storage";

export interface PopupRefs {
  mode: HTMLSelectElement;
  /** Native color picker for the chosen seed. */
  seedColor: HTMLInputElement;
  /** Editable hex field, kept in sync with the color picker. */
  seedHex: HTMLInputElement;
  /** Switch toggling random-vs-chosen seed. */
  seedRandom: HTMLButtonElement;
  /** Live surface-coverage slider (0–100). */
  intensity: HTMLInputElement;
  /** Numeric read-out next to the slider. */
  intensityValue: HTMLElement;
  generate: HTMLButtonElement;
  apply: HTMLButtonElement;
  reset: HTMLButtonElement;
  status: HTMLElement;
  detailsToggle: HTMLButtonElement;
  details: HTMLElement;
  /** Customize (element-picker) disclosure header + collapsible panel. */
  customizeToggle: HTMLButtonElement;
  customizePanel: HTMLElement;
  /** "Pick element" button — starts in-page pick mode. */
  pick: HTMLButtonElement;
  /** "Clear all" overrides button. */
  overridesClear: HTMLButtonElement;
  /** Hint/status line for the customize flow. */
  customizeHint: HTMLElement;
  /** List of current per-role overrides. */
  overrides: HTMLElement;
  /** Favorites disclosure header + collapsible panel. */
  favoritesToggle: HTMLButtonElement;
  favoritesPanel: HTMLElement;
  /** Name input for saving the current scheme as a favorite. */
  favoriteName: HTMLInputElement;
  /** Save-favorite button. */
  favoriteSave: HTMLButtonElement;
  /** Saved-favorites list. */
  favorites: HTMLElement;
  /** History disclosure header + collapsible panel. */
  historyToggle: HTMLButtonElement;
  historyPanel: HTMLElement;
  history: HTMLElement;
}

export interface PopupHandlers {
  onGenerate: () => void;
  /** Persist the current theme to this site + enable auto-reapply. */
  onApply: () => void;
  onReset: () => void;
  onSelectMode: (mode: ModeSelection) => void;
  /** Fired as the slider is dragged (debounced live re-apply). */
  onSelectIntensity: (intensity: Intensity) => void;
  /** Fired when the user picks a seed color (from picker or hex field). */
  onSelectSeed: (hex: string) => void;
  /** Fired when the random-seed switch is toggled. */
  onToggleRandomSeed: () => void;
  onToggleDetails: () => void;
  onToggleCustomize: () => void;
  /** Start in-page element pick mode. */
  onPickElement: () => void;
  /** A role's override color changed (live). */
  onSetOverride: (role: string, color: string) => void;
  /** Clear a single role's override. */
  onClearOverride: (role: string) => void;
  /** Clear all overrides. */
  onClearOverrides: () => void;
  onToggleFavorites: () => void;
  onToggleHistory: () => void;
  onSelectHistory: (index: number) => void;
  /** Save the current scheme as a named favorite. */
  onSaveFavorite: (name: string) => void;
  /** Apply a saved favorite as the current scheme. */
  onSelectFavorite: (id: string) => void;
  /** Delete a saved favorite. */
  onDeleteFavorite: (id: string) => void;
}

/** Resolves the typed element refs from the popup document. */
export const queryRefs = (root: Document | HTMLElement): PopupRefs => {
  const byId = <T extends HTMLElement>(id: string): T => {
    const el = (root as Document).getElementById
      ? (root as Document).getElementById(id)
      : (root as HTMLElement).querySelector(`#${id}`);
    if (!el) {
      throw new Error(`missing popup element: #${id}`);
    }
    return el as T;
  };
  return {
    mode: byId<HTMLSelectElement>("mode"),
    seedColor: byId<HTMLInputElement>("seed-color"),
    seedHex: byId<HTMLInputElement>("seed-hex"),
    seedRandom: byId<HTMLButtonElement>("seed-random"),
    intensity: byId<HTMLInputElement>("intensity"),
    intensityValue: byId<HTMLElement>("intensity-value"),
    generate: byId<HTMLButtonElement>("generate"),
    apply: byId<HTMLButtonElement>("apply"),
    reset: byId<HTMLButtonElement>("reset"),
    status: byId<HTMLElement>("status"),
    detailsToggle: byId<HTMLButtonElement>("details-toggle"),
    details: byId<HTMLElement>("details"),
    customizeToggle: byId<HTMLButtonElement>("customize-toggle"),
    customizePanel: byId<HTMLElement>("customize-panel"),
    pick: byId<HTMLButtonElement>("pick"),
    overridesClear: byId<HTMLButtonElement>("overrides-clear"),
    customizeHint: byId<HTMLElement>("customize-hint"),
    overrides: byId<HTMLElement>("overrides"),
    favoritesToggle: byId<HTMLButtonElement>("favorites-toggle"),
    favoritesPanel: byId<HTMLElement>("favorites-panel"),
    favoriteName: byId<HTMLInputElement>("favorite-name"),
    favoriteSave: byId<HTMLButtonElement>("favorite-save"),
    favorites: byId<HTMLElement>("favorites"),
    historyToggle: byId<HTMLButtonElement>("history-toggle"),
    historyPanel: byId<HTMLElement>("history-panel"),
    history: byId<HTMLElement>("history"),
  };
};

/** Populates the mode <select> with "random" plus every configured mode. */
export const populateModes = (
  select: HTMLSelectElement,
  available: string[] = modes,
): void => {
  select.innerHTML = "";
  const opts: Array<{ value: string; label: string }> = [
    { value: "random", label: "Random" },
    ...available.map((m) => ({ value: m, label: m })),
  ];
  for (const { value, label } of opts) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label;
    select.appendChild(opt);
  }
};

/** Wires DOM events to handler callbacks. Call once after `queryRefs`. */
export const bindEvents = (refs: PopupRefs, handlers: PopupHandlers): void => {
  refs.generate.addEventListener("click", handlers.onGenerate);
  refs.apply.addEventListener("click", handlers.onApply);
  refs.reset.addEventListener("click", handlers.onReset);
  refs.detailsToggle.addEventListener("click", handlers.onToggleDetails);
  refs.customizeToggle.addEventListener("click", handlers.onToggleCustomize);
  refs.pick.addEventListener("click", handlers.onPickElement);
  refs.overridesClear.addEventListener("click", handlers.onClearOverrides);
  // Delegated: a click on a row's clear (×) control clears that override; a
  // change on a row's color input live-updates that override.
  refs.overrides.addEventListener("click", (e) => {
    const clear = (e.target as HTMLElement).closest<HTMLElement>(
      "[data-override-clear]",
    );
    if (clear) {
      handlers.onClearOverride(clear.dataset.overrideClear as string);
    }
  });
  refs.overrides.addEventListener("input", (e) => {
    const input = (e.target as HTMLElement).closest<HTMLInputElement>(
      "[data-override-color]",
    );
    if (input) {
      handlers.onSetOverride(
        input.dataset.overrideColor as string,
        input.value,
      );
    }
  });
  refs.favoritesToggle.addEventListener("click", handlers.onToggleFavorites);
  refs.historyToggle.addEventListener("click", handlers.onToggleHistory);
  refs.mode.addEventListener("change", () =>
    handlers.onSelectMode(refs.mode.value as ModeSelection),
  );
  // Live: fire on every input event as the slider is dragged. The controller
  // debounces the actual re-apply so the page re-shapes smoothly.
  refs.intensity.addEventListener("input", () =>
    handlers.onSelectIntensity(Number(refs.intensity.value)),
  );

  // Seed picker: the native color input streams `input` as the user drags;
  // the hex field commits on `change` (Enter / blur) so partial typing isn't
  // rejected mid-edit. Both route the chosen hex to the same handler.
  refs.seedColor.addEventListener("input", () =>
    handlers.onSelectSeed(refs.seedColor.value),
  );
  refs.seedHex.addEventListener("change", () =>
    handlers.onSelectSeed(refs.seedHex.value),
  );
  refs.seedRandom.addEventListener("click", handlers.onToggleRandomSeed);

  refs.favoriteSave.addEventListener("click", () =>
    handlers.onSaveFavorite(refs.favoriteName.value),
  );
  // One delegated listener: a click on the delete control deletes; anywhere
  // else on the row applies the favorite.
  refs.favorites.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    const del = target.closest<HTMLElement>("[data-favorite-delete]");
    if (del) {
      handlers.onDeleteFavorite(del.dataset.favoriteDelete as string);
      return;
    }
    const item = target.closest<HTMLElement>("[data-favorite-id]");
    if (item) {
      handlers.onSelectFavorite(item.dataset.favoriteId as string);
    }
  });

  refs.history.addEventListener("click", (e) => {
    const item = (e.target as HTMLElement).closest<HTMLElement>(
      "[data-history-index]",
    );
    if (item) {
      handlers.onSelectHistory(Number(item.dataset.historyIndex));
    }
  });
};

const renderDetails = (state: PopupState, container: HTMLElement): void => {
  container.innerHTML = "";
  if (!state.current) {
    return;
  }
  const { rootColorName, rootColor, colorMode } = state.current.schemeDetails;
  const seed = document.createElement("p");
  seed.className = "details__seed";
  const name = rootColorName ?? describeColor(rootColor);
  seed.textContent = `${name} (${colorMode})`;
  container.appendChild(seed);

  for (const { tags, color } of schemeDetailRows(state.current)) {
    const row = document.createElement("div");
    row.className = "details__row";

    const swatch = document.createElement("span");
    swatch.className = "details__swatch";
    swatch.style.backgroundColor = color;

    const tagsEl = document.createElement("span");
    tagsEl.className = "details__tags";
    tagsEl.textContent = tags;

    const hex = document.createElement("span");
    hex.className = "details__hex";
    hex.textContent = color;

    row.append(swatch, tagsEl, hex);
    container.appendChild(row);
  }
};

const schemeSwatches = (scheme: PopupState["current"]): string[] => {
  if (!scheme) {
    return [];
  }
  const seen: string[] = [];
  for (const [key, value] of Object.entries(scheme)) {
    if (key === "schemeDetails") {
      continue;
    }
    const color = value as string;
    if (!seen.includes(color)) {
      seen.push(color);
    }
  }
  return seen.slice(0, 5);
};

const renderHistory = (state: PopupState, list: HTMLElement): void => {
  list.innerHTML = "";
  if (state.history.length === 0) {
    const empty = document.createElement("li");
    empty.className = "history__empty";
    empty.textContent = "No history yet. Generate a scheme.";
    list.appendChild(empty);
    return;
  }
  // Most-recent first for display.
  state.history
    .map((scheme, index) => ({ scheme, index }))
    .reverse()
    .forEach(({ scheme, index }) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "history__item";
      btn.dataset.historyIndex = String(index);

      const swatches = document.createElement("span");
      swatches.className = "history__swatches";
      for (const color of schemeSwatches(scheme)) {
        const s = document.createElement("span");
        s.className = "history__swatch";
        s.style.backgroundColor = color;
        swatches.appendChild(s);
      }

      const label = document.createElement("span");
      label.className = "history__label";
      label.textContent = historyLabel(scheme, index);

      // Number + name on the left, swatches right-aligned (CSS pushes them).
      btn.append(label, swatches);
      li.appendChild(btn);
      list.appendChild(li);
    });
};

const renderFavorites = (favorites: Favorite[], list: HTMLElement): void => {
  list.innerHTML = "";
  if (favorites.length === 0) {
    const empty = document.createElement("li");
    empty.className = "favorites__empty";
    empty.textContent = "No favorites yet. Save a scheme.";
    list.appendChild(empty);
    return;
  }
  for (const fav of favorites) {
    const li = document.createElement("li");
    li.className = "favorites__item";

    // The clickable body (apply on click). A button so it's keyboard-operable.
    const apply = document.createElement("button");
    apply.type = "button";
    apply.className = "favorites__apply";
    apply.dataset.favoriteId = fav.id;

    const swatches = document.createElement("span");
    swatches.className = "favorites__swatches";
    for (const color of schemeSwatches(fav.scheme)) {
      const s = document.createElement("span");
      s.className = "favorites__swatch";
      s.style.backgroundColor = color;
      swatches.appendChild(s);
    }

    const label = document.createElement("span");
    label.className = "favorites__label";
    label.textContent = fav.name;

    apply.append(label, swatches);

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

/** Renders the list of current per-role overrides (label + color input + clear). */
const renderOverrides = (state: PopupState, list: HTMLElement): void => {
  list.innerHTML = "";
  const rows = overrideRows(state);
  if (rows.length === 0) {
    const empty = document.createElement("li");
    empty.className = "overrides__empty";
    empty.textContent = "No custom colors yet. Pick an element to recolor it.";
    list.appendChild(empty);
    return;
  }
  for (const { role, color, label } of rows) {
    const li = document.createElement("li");
    li.className = "overrides__item";

    const name = document.createElement("span");
    name.className = "overrides__label";
    name.textContent = label;

    const input = document.createElement("input");
    input.type = "color";
    input.className = "overrides__color";
    input.value = /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#808080";
    input.dataset.overrideColor = role;
    input.setAttribute("aria-label", `${label} color`);

    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "overrides__clear";
    clear.dataset.overrideClear = role;
    clear.setAttribute("aria-label", `Clear ${label} override`);
    clear.title = "Clear";
    clear.textContent = "×";

    li.append(name, input, clear);
    list.appendChild(li);
  }
};

/** Renders the full popup from `state`. Idempotent. */
export const render = (state: PopupState, refs: PopupRefs): void => {
  refs.mode.value = state.mode;
  refs.intensity.value = String(state.intensity);
  refs.intensity.setAttribute("aria-valuenow", String(state.intensity));
  refs.intensityValue.textContent = String(state.intensity);

  // Seed picker reflects the chosen color; native <input type="color"> only
  // accepts a 6-digit hex, so guard against a half-typed value in the hex field.
  refs.seedHex.value = state.seed;
  if (/^#[0-9a-fA-F]{6}$/.test(state.seed)) {
    refs.seedColor.value = state.seed;
  }
  refs.seedRandom.setAttribute("aria-checked", String(state.useRandomSeed));
  // When "random" is on, the picker is informational only (Generate ignores it).
  refs.seedColor.disabled = state.useRandomSeed;
  refs.seedHex.disabled = state.useRandomSeed;

  refs.generate.disabled = state.loading;
  refs.generate.textContent = state.loading ? "Generating…" : "Generate";
  refs.apply.disabled = !state.current;
  refs.reset.disabled = !state.applied && !state.current;

  refs.status.classList.toggle("popup__status--error", Boolean(state.error));
  if (state.error) {
    refs.status.textContent = state.error;
  } else if (state.applied) {
    refs.status.textContent = "Applied to this tab.";
  } else {
    refs.status.textContent = "";
  }

  refs.detailsToggle.disabled = !state.current;
  refs.detailsToggle.setAttribute("aria-expanded", String(state.showDetails));
  refs.details.hidden = !state.showDetails;
  renderDetails(state, refs.details);

  // Customize: available whenever there is a theme to layer overrides on — a
  // CURRENT scheme OR a persisted/applied theme on this tab (so it isn't wrongly
  // disabled when reopening on a persisted site, or right after a pick).
  const canCustomize = Boolean(state.current) || state.applied;
  refs.customizeToggle.disabled = !canCustomize;
  refs.customizeToggle.setAttribute(
    "aria-expanded",
    String(state.showCustomize),
  );
  refs.customizePanel.hidden = !state.showCustomize;
  refs.pick.disabled = !canCustomize || state.picking;
  refs.pick.textContent = state.picking ? "Click an element…" : "Pick element";
  refs.pick.setAttribute("aria-pressed", String(state.picking));
  refs.overridesClear.disabled =
    Object.keys(state.overrides).length === 0 || !canCustomize;
  refs.customizeHint.textContent = state.picking
    ? "Switch to the page and click any element to recolor its role."
    : "";
  renderOverrides(state, refs.overrides);

  refs.favoritesToggle.setAttribute(
    "aria-expanded",
    String(state.showFavorites),
  );
  refs.favoritesPanel.hidden = !state.showFavorites;
  // Can only save a favorite when there's a current scheme to save.
  refs.favoriteSave.disabled = !state.current;
  renderFavorites(state.favorites, refs.favorites);

  refs.historyToggle.setAttribute("aria-expanded", String(state.showHistory));
  refs.historyPanel.hidden = !state.showHistory;
  renderHistory(state, refs.history);
};
