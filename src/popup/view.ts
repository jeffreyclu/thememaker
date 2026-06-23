/**
 * Popup view layer: renders `PopupState` into the popup DOM.
 *
 * Pure presentation — no chrome.*, no business logic. The controller owns state
 * and IO and calls `render` after each transition. Event wiring is done once in
 * `bindEvents`, dispatching intents back to the controller via callbacks.
 */
import {
  historyLabel,
  schemeDetailRows,
  type ModeSelection,
  type PopupState,
} from "./state";
import { modes } from "../config";
import { describeColor } from "../lib/color-names";
import type { Intensity } from "../types";

export interface PopupRefs {
  mode: HTMLSelectElement;
  /** Live surface-coverage slider (0–100). */
  intensity: HTMLInputElement;
  /** Numeric read-out next to the slider. */
  intensityValue: HTMLElement;
  surpriseToggle: HTMLButtonElement;
  generate: HTMLButtonElement;
  apply: HTMLButtonElement;
  reset: HTMLButtonElement;
  status: HTMLElement;
  detailsToggle: HTMLButtonElement;
  details: HTMLElement;
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
  onToggleSurprise: () => void;
  onToggleDetails: () => void;
  onSelectHistory: (index: number) => void;
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
    intensity: byId<HTMLInputElement>("intensity"),
    intensityValue: byId<HTMLElement>("intensity-value"),
    surpriseToggle: byId<HTMLButtonElement>("surprise-toggle"),
    generate: byId<HTMLButtonElement>("generate"),
    apply: byId<HTMLButtonElement>("apply"),
    reset: byId<HTMLButtonElement>("reset"),
    status: byId<HTMLElement>("status"),
    detailsToggle: byId<HTMLButtonElement>("details-toggle"),
    details: byId<HTMLElement>("details"),
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
  refs.mode.addEventListener("change", () =>
    handlers.onSelectMode(refs.mode.value as ModeSelection),
  );
  // Live: fire on every input event as the slider is dragged. The controller
  // debounces the actual re-apply so the page re-shapes smoothly.
  refs.intensity.addEventListener("input", () =>
    handlers.onSelectIntensity(Number(refs.intensity.value)),
  );
  refs.surpriseToggle.addEventListener("click", handlers.onToggleSurprise);
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

/** Renders the full popup from `state`. Idempotent. */
export const render = (state: PopupState, refs: PopupRefs): void => {
  refs.mode.value = state.mode;
  refs.intensity.value = String(state.intensity);
  refs.intensity.setAttribute("aria-valuenow", String(state.intensity));
  refs.intensityValue.textContent = String(state.intensity);
  refs.surpriseToggle.setAttribute("aria-checked", String(state.surprise));

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

  renderHistory(state, refs.history);
};
