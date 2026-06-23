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
  <input id="intensity" type="range" min="10" max="100" step="1" value="80" />
  <output id="intensity-value">80</output>
  <button id="surprise-toggle" aria-checked="false"></button>
  <button id="generate"></button>
  <button id="apply"></button>
  <button id="reset"></button>
  <p id="status"></p>
  <button id="details-toggle" aria-expanded="false"></button>
  <div id="details" hidden></div>
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
  onToggleSurprise: vi.fn(),
  onToggleDetails: vi.fn(),
  onSelectHistory: vi.fn(),
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

  it("render reflects intensity + surprise state", () => {
    const refs = mount();
    populateModes(refs.mode);
    render({ ...initialPopupState, intensity: 80, surprise: true }, refs);
    expect(refs.intensity.value).toBe("80");
    expect(refs.intensityValue.textContent).toBe("80");
    expect(refs.surpriseToggle.getAttribute("aria-checked")).toBe("true");
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

    refs.surpriseToggle.click();
    expect(handlers.onToggleSurprise).toHaveBeenCalled();

    // history click resolves the index from the clicked item
    render({ ...initialPopupState, history: [mockScheme, mockScheme2] }, refs);
    const item = refs.history.querySelector(
      "[data-history-index]",
    ) as HTMLElement;
    item.click();
    expect(handlers.onSelectHistory).toHaveBeenCalledWith(1);
  });
});
