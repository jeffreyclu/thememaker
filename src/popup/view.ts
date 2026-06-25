/**
 * Popup view layer: renders `PopupState` into the popup DOM.
 *
 * Pure presentation — no chrome.*, no business logic. The controller owns state
 * and IO and calls `render` after each transition. Event wiring is done once in
 * `bindEvents`, dispatching intents back to the controller via callbacks.
 */
import { type ModeSelection, type PopupState } from "./state";
import { isCurrentSaved } from "./state-selectors";
import { renderDetails } from "./view-details";
import { renderFavorites, renderHistory } from "./view-lists";
import { modes } from "../config";
import type { Intensity } from "../types";

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
  // Save is disabled when there's no scheme, or the current scheme (at this
  // intensity + overrides) is already a favorite — so you can't save a dupe, and
  // it re-enables only once something changes.
  refs.favoriteSave.disabled = !state.current || isCurrentSaved(state);
  refs.reset.disabled = !state.applied && !state.current;

  // Status line shows errors only (no "applied"/"saved" chatter).
  refs.status.classList.toggle("popup__status--error", Boolean(state.error));
  refs.status.textContent = state.error ?? "";

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

  // Highlight the just-saved favorite row — a cheap class toggle (no list
  // rebuild). The flash animation fades on its own; clearing the flag drops the
  // class, by which point the animation has finished.
  for (const item of refs.favorites.querySelectorAll<HTMLElement>(
    ".favorites__item",
  )) {
    const id =
      item.querySelector<HTMLElement>("[data-favorite-id]")?.dataset.favoriteId;
    item.classList.toggle(
      "favorites__item--saved",
      id != null && id === state.savedFavoriteId,
    );
  }

  lastRendered.set(refs, {
    current: state.current,
    overrides: state.overrides,
    history: state.history,
    favorites: state.favorites,
  });
};
