import { afterEach, describe, expect, it, vi } from "vitest";

import {
  bindEvents,
  populateModes,
  queryRefs,
  render,
  type PopupHandlers,
} from "../src/popup/view";
import { initialPopupState, type PopupState } from "../src/popup/state";
import { modes } from "../src/config";
import { mockScheme, mockScheme2 } from "./mocks";

/**
 * The popup DOM fixture — a faithful copy of the element ids in
 * `src/popup/index.html` (the source of truth for `queryRefs`). If an id moves
 * in the HTML, this must move with it (and `queryRefs` will throw otherwise,
 * which is the canary).
 */
const POPUP_HTML = `
  <select id="mode"></select>
  <input id="intensity" type="range" min="10" max="100" step="1" value="80"
         aria-valuenow="80" />
  <output id="intensity-value">80</output>
  <button id="invert-toggle" role="switch" aria-checked="false"></button>
  <button id="generate"></button>
  <button id="favorite-save"></button>
  <button id="reset"></button>
  <button id="customize"></button>
  <p id="status"></p>
  <button id="details-toggle" aria-expanded="false"></button>
  <div id="details" hidden></div>
  <button id="favorites-toggle" aria-expanded="false"></button>
  <div id="favorites-panel" hidden>
    <ul id="favorites"></ul>
  </div>
  <button id="history-toggle" aria-expanded="false"></button>
  <div id="history-panel" hidden>
    <ul id="history"></ul>
  </div>
`;

const mount = () => {
  document.body.innerHTML = POPUP_HTML;
  return queryRefs(document);
};

const noopHandlers = (): PopupHandlers => ({
  onGenerate: vi.fn(),
  onReset: vi.fn(),
  onSelectMode: vi.fn(),
  onSelectIntensity: vi.fn(),
  onToggleInvert: vi.fn(),
  onToggleDetails: vi.fn(),
  onPickElement: vi.fn(),
  onToggleFavorites: vi.fn(),
  onToggleHistory: vi.fn(),
  onSelectHistory: vi.fn(),
  onSaveFavorite: vi.fn(),
  onSelectFavorite: vi.fn(),
  onDeleteFavorite: vi.fn(),
});

describe("popup view", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("populateModes adds Random + every mode", () => {
    const refs = mount();
    populateModes(refs.mode);
    expect(refs.mode.options).toHaveLength(modes.length + 1);
    expect(refs.mode.options[0].value).toBe("random");
  });

  it("render reflects the empty initial state", () => {
    const refs = mount();
    populateModes(refs.mode);
    render(initialPopupState, refs);
    // No current/applied → favorite-save, reset, details, customize disabled.
    expect(refs.favoriteSave.disabled).toBe(true);
    expect(refs.reset.disabled).toBe(true);
    expect(refs.customize.disabled).toBe(true);
    expect(refs.detailsToggle.disabled).toBe(true);
    // Details collapsed by default — the view must set the `hidden` attribute
    // (the CSS `.details[hidden]` rule makes it actually disappear).
    expect(refs.details.hidden).toBe(true);
    expect(refs.history.textContent).toContain("No history");
  });

  it("render shows loading state on generate", () => {
    const refs = mount();
    populateModes(refs.mode);
    render({ ...initialPopupState, loading: true }, refs);
    expect(refs.generate.disabled).toBe(true);
    expect(refs.generate.textContent).toContain("Generating");
  });

  it("render enables save/reset/details/customize and lists history when a scheme is current", () => {
    const refs = mount();
    populateModes(refs.mode);
    const state: PopupState = {
      ...initialPopupState,
      current: mockScheme,
      history: [mockScheme, mockScheme2],
      applied: true,
    };
    render(state, refs);
    expect(refs.favoriteSave.disabled).toBe(false);
    expect(refs.reset.disabled).toBe(false);
    expect(refs.customize.disabled).toBe(false);
    expect(refs.detailsToggle.disabled).toBe(false);
    expect(refs.status.textContent).toContain("Applied");
    // two history entries, most-recent first
    const items = refs.history.querySelectorAll("[data-history-index]");
    expect(items).toHaveLength(2);
    expect((items[0] as HTMLElement).dataset.historyIndex).toBe("1");
  });

  it("customize is enabled by `applied` even without a `current` scheme", () => {
    const refs = mount();
    populateModes(refs.mode);
    render({ ...initialPopupState, applied: true }, refs);
    // Available whenever there's a theme to layer overrides on (current OR applied).
    expect(refs.customize.disabled).toBe(false);
  });

  it("render shows details rows + seed when expanded", () => {
    const refs = mount();
    populateModes(refs.mode);
    render(
      { ...initialPopupState, current: mockScheme, showDetails: true },
      refs,
    );
    expect(refs.details.hidden).toBe(false);
    expect(refs.details.textContent).toContain("Brandy Rose");
    expect(
      refs.details.querySelectorAll(".details__row").length,
    ).toBeGreaterThan(0);
  });

  it("render lists a 'Custom overrides' group in details when overrides exist", () => {
    const refs = mount();
    populateModes(refs.mode);
    render(
      {
        ...initialPopupState,
        current: mockScheme,
        showDetails: true,
        overrides: {
          "div|background": "#112233",
          "page|background": "#abcdef",
        },
      },
      refs,
    );
    expect(refs.details.textContent).toContain("Custom overrides");
    // Per-tag label + the page sentinel label both render.
    expect(refs.details.textContent).toContain("div · background");
    expect(refs.details.textContent).toContain("Page background");
    // And the override hexes are shown.
    expect(refs.details.textContent).toContain("#112233");
    expect(refs.details.textContent).toContain("#abcdef");
  });

  it("render surfaces errors", () => {
    const refs = mount();
    populateModes(refs.mode);
    render({ ...initialPopupState, error: "offline" }, refs);
    expect(refs.status.textContent).toBe("offline");
    expect(refs.status.classList.contains("popup__status--error")).toBe(true);
  });

  it("render reflects intensity state", () => {
    const refs = mount();
    populateModes(refs.mode);
    render({ ...initialPopupState, intensity: 80 }, refs);
    expect(refs.intensity.value).toBe("80");
    expect(refs.intensityValue.textContent).toBe("80");
  });

  it("invert switch reflects the invert flag via aria-checked", () => {
    const refs = mount();
    populateModes(refs.mode);
    render({ ...initialPopupState, invert: false }, refs);
    expect(refs.invertToggle.getAttribute("aria-checked")).toBe("false");
    render({ ...initialPopupState, invert: true }, refs);
    expect(refs.invertToggle.getAttribute("aria-checked")).toBe("true");
  });

  it("favorites render with name + swatches; save disabled without a scheme", () => {
    const refs = mount();
    populateModes(refs.mode);
    render(
      {
        ...initialPopupState,
        favorites: [
          { id: "a", name: "My Fave", scheme: mockScheme },
          { id: "b", name: "Other", scheme: mockScheme2 },
        ],
      },
      refs,
    );
    const items = refs.favorites.querySelectorAll("[data-favorite-id]");
    expect(items).toHaveLength(2);
    expect(refs.favorites.textContent).toContain("My Fave");
    expect(
      refs.favorites.querySelectorAll(".favorites__swatch").length,
    ).toBeGreaterThan(0);
    // each row has a delete control
    expect(
      refs.favorites.querySelectorAll("[data-favorite-delete]"),
    ).toHaveLength(2);
    // no current scheme → cannot save
    expect(refs.favoriteSave.disabled).toBe(true);
  });

  it("favorites empty state + save enabled when a scheme is current", () => {
    const refs = mount();
    populateModes(refs.mode);
    render({ ...initialPopupState, current: mockScheme }, refs);
    expect(refs.favorites.textContent).toContain("No favorites");
    expect(refs.favoriteSave.disabled).toBe(false);
  });

  it("bindEvents wires the invert switch + customize button", () => {
    const refs = mount();
    populateModes(refs.mode);
    const handlers = noopHandlers();
    bindEvents(refs, handlers);

    refs.invertToggle.click();
    expect(handlers.onToggleInvert).toHaveBeenCalledTimes(1);

    refs.customize.click();
    expect(handlers.onPickElement).toHaveBeenCalledTimes(1);
  });

  it("bindEvents wires favorite save (no arg) / apply / delete", () => {
    const refs = mount();
    populateModes(refs.mode);
    const handlers = noopHandlers();
    bindEvents(refs, handlers);

    // Save is one-click (auto-named) — fired with no argument.
    refs.favoriteSave.click();
    expect(handlers.onSaveFavorite).toHaveBeenCalledTimes(1);

    render(
      {
        ...initialPopupState,
        favorites: [{ id: "fav-1", name: "Sunset", scheme: mockScheme }],
      },
      refs,
    );

    // clicking the row body applies; the delete control deletes (and does NOT
    // also fire apply, thanks to the delegated handler's early return).
    const apply = refs.favorites.querySelector(
      "[data-favorite-id]",
    ) as HTMLElement;
    apply.click();
    expect(handlers.onSelectFavorite).toHaveBeenCalledWith("fav-1");

    const del = refs.favorites.querySelector(
      "[data-favorite-delete]",
    ) as HTMLElement;
    del.click();
    expect(handlers.onDeleteFavorite).toHaveBeenCalledWith("fav-1");
    // delete didn't double-fire apply
    expect(handlers.onSelectFavorite).toHaveBeenCalledTimes(1);
  });

  it("favorites/history are collapsible panels and wire their toggles", () => {
    const refs = mount();
    populateModes(refs.mode);

    // collapsed by default
    render(initialPopupState, refs);
    expect(refs.favoritesPanel.hidden).toBe(true);
    expect(refs.historyPanel.hidden).toBe(true);
    expect(refs.favoritesToggle.getAttribute("aria-expanded")).toBe("false");
    expect(refs.historyToggle.getAttribute("aria-expanded")).toBe("false");

    // expanded when open
    render(
      { ...initialPopupState, showFavorites: true, showHistory: true },
      refs,
    );
    expect(refs.favoritesPanel.hidden).toBe(false);
    expect(refs.historyPanel.hidden).toBe(false);
    expect(refs.favoritesToggle.getAttribute("aria-expanded")).toBe("true");
    expect(refs.historyToggle.getAttribute("aria-expanded")).toBe("true");

    // toggles wire to handlers
    const handlers = noopHandlers();
    bindEvents(refs, handlers);
    refs.favoritesToggle.click();
    expect(handlers.onToggleFavorites).toHaveBeenCalled();
    refs.historyToggle.click();
    expect(handlers.onToggleHistory).toHaveBeenCalled();
  });

  it("bindEvents wires clicks to handlers (generate, reset, mode, intensity, history)", () => {
    const refs = mount();
    populateModes(refs.mode);
    const handlers = noopHandlers();
    bindEvents(refs, handlers);

    refs.generate.click();
    expect(handlers.onGenerate).toHaveBeenCalled();

    refs.reset.click();
    expect(handlers.onReset).toHaveBeenCalled();

    refs.detailsToggle.click();
    expect(handlers.onToggleDetails).toHaveBeenCalled();

    refs.mode.value = "triad";
    refs.mode.dispatchEvent(new Event("change"));
    expect(handlers.onSelectMode).toHaveBeenCalledWith("triad");

    refs.intensity.value = "80";
    refs.intensity.dispatchEvent(new Event("input"));
    expect(handlers.onSelectIntensity).toHaveBeenCalledWith(80);

    // history click resolves the index from the clicked item
    render({ ...initialPopupState, history: [mockScheme, mockScheme2] }, refs);
    const item = refs.history.querySelector(
      "[data-history-index]",
    ) as HTMLElement;
    item.click();
    expect(handlers.onSelectHistory).toHaveBeenCalledWith(1);
  });
});
