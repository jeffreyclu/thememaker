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

const POPUP_HTML = `
  <select id="mode"></select>
  <input id="seed-color" type="color" value="#4f46e5" />
  <input id="seed-hex" type="text" value="#4f46e5" />
  <button id="seed-random" aria-checked="true"></button>
  <input id="intensity" type="range" min="10" max="100" step="1" value="80" />
  <output id="intensity-value">80</output>
  <button id="generate"></button>
  <button id="apply"></button>
  <button id="reset"></button>
  <p id="status"></p>
  <button id="details-toggle" aria-expanded="false"></button>
  <div id="details" hidden></div>
  <input id="favorite-name" type="text" />
  <button id="favorite-save"></button>
  <ul id="favorites"></ul>
  <ul id="history"></ul>
`;

const mount = () => {
  document.body.innerHTML = POPUP_HTML;
  return queryRefs(document);
};

const noopHandlers = (): PopupHandlers => ({
  onGenerate: vi.fn(),
  onApply: vi.fn(),
  onReset: vi.fn(),
  onSelectMode: vi.fn(),
  onSelectIntensity: vi.fn(),
  onSelectSeed: vi.fn(),
  onToggleRandomSeed: vi.fn(),
  onToggleDetails: vi.fn(),
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
    expect(refs.apply.disabled).toBe(true);
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

  it("render enables apply/details and lists history when a scheme is current", () => {
    const refs = mount();
    populateModes(refs.mode);
    const state: PopupState = {
      ...initialPopupState,
      current: mockScheme,
      history: [mockScheme, mockScheme2],
      applied: true,
    };
    render(state, refs);
    expect(refs.apply.disabled).toBe(false);
    expect(refs.detailsToggle.disabled).toBe(false);
    expect(refs.status.textContent).toContain("Applied");
    // two history entries, most-recent first
    const items = refs.history.querySelectorAll("[data-history-index]");
    expect(items).toHaveLength(2);
    expect((items[0] as HTMLElement).dataset.historyIndex).toBe("1");
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

  it("seed picker reflects the chosen seed + random flag", () => {
    const refs = mount();
    populateModes(refs.mode);
    render(
      { ...initialPopupState, seed: "#abcdef", useRandomSeed: false },
      refs,
    );
    expect(refs.seedHex.value).toBe("#abcdef");
    expect(refs.seedColor.value).toBe("#abcdef");
    expect(refs.seedRandom.getAttribute("aria-checked")).toBe("false");
    // chosen seed → picker enabled
    expect(refs.seedColor.disabled).toBe(false);
    expect(refs.seedHex.disabled).toBe(false);
  });

  it("seed picker is disabled (informational) while random is on", () => {
    const refs = mount();
    populateModes(refs.mode);
    render({ ...initialPopupState, useRandomSeed: true }, refs);
    expect(refs.seedRandom.getAttribute("aria-checked")).toBe("true");
    expect(refs.seedColor.disabled).toBe(true);
    expect(refs.seedHex.disabled).toBe(true);
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

  it("bindEvents wires seed picker + random toggle", () => {
    const refs = mount();
    populateModes(refs.mode);
    const handlers = noopHandlers();
    bindEvents(refs, handlers);

    refs.seedColor.value = "#112233";
    refs.seedColor.dispatchEvent(new Event("input"));
    expect(handlers.onSelectSeed).toHaveBeenCalledWith("#112233");

    refs.seedHex.value = "#445566";
    refs.seedHex.dispatchEvent(new Event("change"));
    expect(handlers.onSelectSeed).toHaveBeenCalledWith("#445566");

    refs.seedRandom.click();
    expect(handlers.onToggleRandomSeed).toHaveBeenCalled();
  });

  it("bindEvents wires favorite save / apply / delete", () => {
    const refs = mount();
    populateModes(refs.mode);
    const handlers = noopHandlers();
    bindEvents(refs, handlers);

    refs.favoriteName.value = "Sunset";
    refs.favoriteSave.click();
    expect(handlers.onSaveFavorite).toHaveBeenCalledWith("Sunset");

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

  it("bindEvents wires clicks to handlers (generate, mode, history)", () => {
    const refs = mount();
    populateModes(refs.mode);
    const handlers = noopHandlers();
    bindEvents(refs, handlers);

    refs.generate.click();
    expect(handlers.onGenerate).toHaveBeenCalled();

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
