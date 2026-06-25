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
  /** Live surface-coverage slider (0–100). */
  intensity: HTMLInputElement;
  /** Numeric read-out next to the slider. */
  intensityValue: HTMLElement;
  /** Invert (light↔dark) switch. */
  invertToggle: HTMLButtonElement;
  generate: HTMLButtonElement;
  reset: HTMLButtonElement;
  status: HTMLElement;
  detailsToggle: HTMLButtonElement;
  details: HTMLElement;
  /** "Customize" button — opens the in-page floating picker control. */
  customize: HTMLButtonElement;
  /** Save the current scheme as a favorite (one-click, in the action row). */
  favoriteSave: HTMLButtonElement;
  /** Favorites disclosure header + collapsible panel. */
  favoritesToggle: HTMLButtonElement;
  favoritesPanel: HTMLElement;
  /** Saved-favorites list. */
  favorites: HTMLElement;
  /** History disclosure header + collapsible panel. */
  historyToggle: HTMLButtonElement;
  historyPanel: HTMLElement;
  history: HTMLElement;
}

export interface PopupHandlers {
  /** Generate a fresh scheme — auto-applies + auto-persists for this origin. */
  onGenerate: () => void;
  onReset: () => void;
  onSelectMode: (mode: ModeSelection) => void;
  /** Fired as the slider is dragged (debounced live re-apply). */
  onSelectIntensity: (intensity: Intensity) => void;
  /** Toggle invert (light↔dark) — flips the live theme. */
  onToggleInvert: () => void;
  onToggleDetails: () => void;
  /** Open the in-page floating picker control (Customize). */
  onPickElement: () => void;
  onToggleFavorites: () => void;
  onToggleHistory: () => void;
  onSelectHistory: (index: number) => void;
  /** Save the current scheme as a favorite (one click, auto-named). */
  onSaveFavorite: () => void;
  /** Apply a saved favorite as the current scheme. */
  onSelectFavorite: (id: string) => void;
  /** Delete a saved favorite. */
  onDeleteFavorite: (id: string) => void;
}

/** Resolves the typed element refs from the popup document. */
export const queryRefs = (root: Document): PopupRefs => {
  const byId = <T extends HTMLElement>(id: string): T => {
    const el = root.getElementById(id);
    if (!el) {
      throw new Error(`missing popup element: #${id}`);
    }
    return el as T;
  };
  return {
    mode: byId<HTMLSelectElement>("mode"),
    intensity: byId<HTMLInputElement>("intensity"),
    invertToggle: byId<HTMLButtonElement>("invert-toggle"),
    intensityValue: byId<HTMLElement>("intensity-value"),
    generate: byId<HTMLButtonElement>("generate"),
    reset: byId<HTMLButtonElement>("reset"),
    status: byId<HTMLElement>("status"),
    detailsToggle: byId<HTMLButtonElement>("details-toggle"),
    details: byId<HTMLElement>("details"),
    customize: byId<HTMLButtonElement>("customize"),
    favoritesToggle: byId<HTMLButtonElement>("favorites-toggle"),
    favoritesPanel: byId<HTMLElement>("favorites-panel"),
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
  refs.reset.addEventListener("click", handlers.onReset);
  refs.detailsToggle.addEventListener("click", handlers.onToggleDetails);
  refs.customize.addEventListener("click", handlers.onPickElement);
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
  refs.invertToggle.addEventListener("click", handlers.onToggleInvert);

  refs.favoriteSave.addEventListener("click", () => handlers.onSaveFavorite());
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

/** A single colored swatch `<span>` (the small color chip used everywhere). */
const makeSwatch = (className: string, color: string): HTMLSpanElement => {
  const swatch = document.createElement("span");
  swatch.className = className;
  swatch.style.backgroundColor = color;
  return swatch;
};

/** A strip of swatches (one chip per color), used by history + favorites rows. */
const makeSwatchStrip = (
  stripClass: string,
  swatchClass: string,
  colors: string[],
): HTMLSpanElement => {
  const strip = document.createElement("span");
  strip.className = stripClass;
  for (const color of colors) {
    strip.appendChild(makeSwatch(swatchClass, color));
  }
  return strip;
};

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

const renderDetails = (state: PopupState, container: HTMLElement): void => {
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

const schemeSwatches = (scheme: PopupState["current"]): string[] => {
  if (!scheme) {
    return [];
  }
  const seen: string[] = [];
  for (const color of Object.values(scheme.colors)) {
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

      const label = document.createElement("span");
      label.className = "history__label";
      label.textContent = historyLabel(scheme, index);

      // Number + name on the left, swatches right-aligned (CSS pushes them).
      btn.append(
        label,
        makeSwatchStrip(
          "history__swatches",
          "history__swatch",
          schemeSwatches(scheme),
        ),
      );
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

    const label = document.createElement("span");
    label.className = "favorites__label";
    label.textContent = fav.name;

    apply.append(
      label,
      makeSwatchStrip(
        "favorites__swatches",
        "favorites__swatch",
        schemeSwatches(fav.scheme),
      ),
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

/**
 * The slices that drive each expensive sub-render. The reducer replaces these
 * immutably, so a cheap reference check tells us when a rebuild is actually
 * needed — letting us SKIP tearing down + rebuilding the details/history/
 * favorites DOM on unrelated changes (e.g. an intensity-slider drag), which
 * would otherwise destroy focus/scroll inside those lists.
 */
interface RenderedSlices {
  current: PopupState["current"];
  overrides: PopupState["overrides"];
  history: PopupState["history"];
  favorites: PopupState["favorites"];
}

/** Per-`refs` memo of the last slices rendered, so gating is keyed to a DOM. */
const lastRendered = new WeakMap<PopupRefs, RenderedSlices>();

/** Renders the full popup from `state`. Idempotent. */
export const render = (state: PopupState, refs: PopupRefs): void => {
  refs.mode.value = state.mode;
  refs.intensity.value = String(state.intensity);
  refs.intensity.setAttribute("aria-valuenow", String(state.intensity));
  refs.intensityValue.textContent = String(state.intensity);
  refs.invertToggle.setAttribute("aria-checked", String(state.invert));

  refs.generate.disabled = state.loading;
  refs.generate.textContent = state.loading ? "Generating…" : "Generate";
  // Can only save a favorite when there's a current scheme to save.
  refs.favoriteSave.disabled = !state.current;
  refs.reset.disabled = !state.applied && !state.current;

  refs.status.classList.toggle("popup__status--error", Boolean(state.error));
  if (state.error) {
    refs.status.textContent = state.error;
  } else if (state.applied) {
    refs.status.textContent = "Applied to this tab.";
  } else {
    refs.status.textContent = "";
  }

  // Customize is a button that opens the IN-PAGE floating control; available
  // whenever there's a theme to layer overrides on (current OR applied).
  refs.customize.disabled = !(Boolean(state.current) || state.applied);

  // Cheap, always-applied attribute/visibility updates for the disclosures.
  refs.detailsToggle.disabled = !state.current;
  refs.detailsToggle.setAttribute("aria-expanded", String(state.showDetails));
  refs.details.hidden = !state.showDetails;
  refs.favoritesToggle.setAttribute(
    "aria-expanded",
    String(state.showFavorites),
  );
  refs.favoritesPanel.hidden = !state.showFavorites;
  refs.historyToggle.setAttribute("aria-expanded", String(state.showHistory));
  refs.historyPanel.hidden = !state.showHistory;

  // Expensive list rebuilds: only when the slice that drives each one actually
  // changed (the reducer swaps these references on real updates). This keeps an
  // intensity drag or a disclosure toggle from blowing away list DOM + focus.
  const prev = lastRendered.get(refs);
  if (
    !prev ||
    prev.current !== state.current ||
    prev.overrides !== state.overrides
  ) {
    renderDetails(state, refs.details);
  }
  if (!prev || prev.favorites !== state.favorites) {
    renderFavorites(state.favorites, refs.favorites);
  }
  if (!prev || prev.history !== state.history) {
    renderHistory(state, refs.history);
  }
  lastRendered.set(refs, {
    current: state.current,
    overrides: state.overrides,
    history: state.history,
    favorites: state.favorites,
  });
};
