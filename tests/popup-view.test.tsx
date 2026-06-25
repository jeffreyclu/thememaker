/**
 * Popup CONNECTED-component tests (React Testing Library).
 *
 * The view sections read state + intents from context, so each test renders the
 * component inside a lightweight context wrapper (`renderConnected`) that seeds a
 * `PopupState` and a spied `PopupActions` — no chrome, no provider. These assert
 * the same RENDER + wiring intents the old vanilla `popup-view.test.ts` did:
 * disabled/label state, details rows + the custom-overrides group, the invert
 * switch's aria-checked, swatches, empty states, the disclosures, and that clicks
 * fire the right intents. Full end-to-end behavior lives in popup-app.test.tsx.
 */
import { describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  within,
  type RenderResult,
} from "@testing-library/react";
import type { ReactElement } from "react";

import { Controls } from "../src/popup/components/Controls";
import { Actions } from "../src/popup/components/Actions";
import { Status } from "../src/popup/components/Status";
import { Details } from "../src/popup/components/Details";
import { Favorites } from "../src/popup/components/Favorites";
import { History } from "../src/popup/components/History";
import {
  ActionsContext,
  StateContext,
} from "../src/popup/hooks/usePopupContext";
import type { PopupActions } from "../src/popup/actions/actions";
import { initialPopupState, type PopupState } from "../src/popup/state";
import { modes } from "../src/config";
import { mockScheme, mockScheme2 } from "./mocks";

/** A no-op `PopupActions` with every intent spied. */
const stubActions = (): PopupActions => ({
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

/** Renders a connected component over a seeded state + spied actions context. */
const renderConnected = (
  ui: ReactElement,
  partial: Partial<PopupState> = {},
  actions: PopupActions = stubActions(),
): RenderResult & { actions: PopupActions } => {
  const state: PopupState = { ...initialPopupState, ...partial };
  const view = render(
    <ActionsContext.Provider value={actions}>
      <StateContext.Provider value={state}>{ui}</StateContext.Provider>
    </ActionsContext.Provider>,
  );
  return Object.assign(view, { actions });
};

describe("popup connected components", () => {
  it("Controls render Random + every mode and reflect intensity/invert", () => {
    renderConnected(<Controls />, { intensity: 80, invert: true });
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(modes.length + 1);
    expect((options[0] as HTMLOptionElement).value).toBe("random");
    expect((screen.getByRole("slider") as HTMLInputElement).value).toBe("80");
    expect(screen.getByText("80")).toBeInTheDocument();
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe(
      "true",
    );
  });

  it("Controls wire mode / intensity / invert intents", () => {
    const { actions } = renderConnected(<Controls />);
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "triad" },
    });
    expect(actions.onSelectMode).toHaveBeenCalledWith("triad");
    fireEvent.change(screen.getByRole("slider"), { target: { value: "55" } });
    expect(actions.onSelectIntensity).toHaveBeenCalledWith(55);
    screen.getByRole("switch").click();
    expect(actions.onToggleInvert).toHaveBeenCalledTimes(1);
  });

  it("Actions reflect the empty initial state (save/reset/customize disabled)", () => {
    renderConnected(<Actions />);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reset" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Customize/ })).toBeDisabled();
  });

  it("Actions show the loading state on generate", () => {
    renderConnected(<Actions />, { loading: true });
    expect(screen.getByRole("button", { name: /Generating/ })).toBeDisabled();
  });

  it("Actions enable save/reset/customize when a scheme is current", () => {
    renderConnected(<Actions />, { current: mockScheme, applied: true });
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Reset" })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Customize/ })).toBeEnabled();
  });

  it("Actions disable Save when the current scheme is already a favorite (dedupe)", () => {
    renderConnected(<Actions />, {
      current: mockScheme,
      intensity:
        mockScheme.schemeDetails.intensity ?? initialPopupState.intensity,
      favorites: [{ id: "f1", name: "X", scheme: mockScheme }],
    });
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("Customize is enabled by `applied` even without a `current` scheme", () => {
    renderConnected(<Actions />, { applied: true });
    expect(screen.getByRole("button", { name: /Customize/ })).toBeEnabled();
  });

  it("Actions wire generate/save/reset/customize intents", () => {
    const { actions } = renderConnected(<Actions />, {
      current: mockScheme,
      applied: true,
    });
    screen.getByRole("button", { name: "Generate" }).click();
    expect(actions.onGenerate).toHaveBeenCalled();
    screen.getByRole("button", { name: "Save" }).click();
    expect(actions.onSaveFavorite).toHaveBeenCalled();
    screen.getByRole("button", { name: "Reset" }).click();
    expect(actions.onReset).toHaveBeenCalled();
    screen.getByRole("button", { name: /Customize/ }).click();
    expect(actions.onPickElement).toHaveBeenCalled();
  });

  it("Details show seed + per-color rows when expanded with a scheme", () => {
    const { container } = renderConnected(<Details />, {
      current: mockScheme,
      showDetails: true,
    });
    expect(document.getElementById("details")?.hasAttribute("hidden")).toBe(
      false,
    );
    expect(container.textContent).toContain("Brandy Rose");
    expect(container.querySelectorAll(".details__row").length).toBeGreaterThan(
      0,
    );
  });

  it("Details list a 'Custom overrides' group when overrides exist", () => {
    const { container } = renderConnected(<Details />, {
      current: mockScheme,
      showDetails: true,
      overrides: {
        "div|background": "#112233",
        "page|background": "#abcdef",
      },
    });
    expect(container.textContent).toContain("Custom overrides");
    expect(container.textContent).toContain("div · background");
    expect(container.textContent).toContain("Page background");
    expect(container.textContent).toContain("#112233");
    expect(container.textContent).toContain("#abcdef");
  });

  it("Details toggle is disabled without a scheme + collapsed by default", () => {
    renderConnected(<Details />);
    expect(screen.getByRole("button", { name: "Details" })).toBeDisabled();
    expect(document.getElementById("details")?.hasAttribute("hidden")).toBe(
      true,
    );
  });

  it("Status surfaces errors with the error class", () => {
    renderConnected(<Status />, { error: "offline" });
    const status = document.getElementById("status");
    expect(status?.textContent).toBe("offline");
    expect(status?.classList.contains("popup__status--error")).toBe(true);
  });

  it("Status is empty + unstyled with no error", () => {
    renderConnected(<Status />);
    const status = document.getElementById("status");
    expect(status?.textContent).toBe("");
    expect(status?.classList.contains("popup__status--error")).toBe(false);
  });

  it("Favorites render with name + swatches + a delete control each", () => {
    const { container } = renderConnected(<Favorites />, {
      showFavorites: true,
      favorites: [
        { id: "a", name: "My Fave", scheme: mockScheme },
        { id: "b", name: "Other", scheme: mockScheme2 },
      ],
    });
    expect(container.querySelectorAll("[data-favorite-id]")).toHaveLength(2);
    expect(container.textContent).toContain("My Fave");
    expect(
      container.querySelectorAll(".favorites__swatch").length,
    ).toBeGreaterThan(0);
    expect(container.querySelectorAll("[data-favorite-delete]")).toHaveLength(
      2,
    );
  });

  it("Favorites show the empty state + highlight the just-saved row", () => {
    renderConnected(<Favorites />, { showFavorites: true });
    expect(screen.getByText(/No favorites/)).toBeInTheDocument();

    const { container } = renderConnected(<Favorites />, {
      showFavorites: true,
      favorites: [{ id: "fav-1", name: "Sunset", scheme: mockScheme }],
      savedFavoriteId: "fav-1",
    });
    expect(
      container
        .querySelector(".favorites__item")
        ?.classList.contains("favorites__item--saved"),
    ).toBe(true);
  });

  it("Favorites wire apply (row) + delete (control) without double-firing", () => {
    const { actions } = renderConnected(<Favorites />, {
      showFavorites: true,
      favorites: [{ id: "fav-1", name: "Sunset", scheme: mockScheme }],
    });
    (document.querySelector("[data-favorite-id]") as HTMLElement).click();
    expect(actions.onSelectFavorite).toHaveBeenCalledWith("fav-1");
    within(document.body)
      .getByRole("button", { name: /Delete favorite/ })
      .click();
    expect(actions.onDeleteFavorite).toHaveBeenCalledWith("fav-1");
    expect(actions.onSelectFavorite).toHaveBeenCalledTimes(1);
  });

  it("History lists entries most-recent first + wires select by original index", () => {
    const { actions, container } = renderConnected(<History />, {
      showHistory: true,
      history: [mockScheme, mockScheme2],
    });
    const items = container.querySelectorAll("[data-history-index]");
    expect(items).toHaveLength(2);
    expect((items[0] as HTMLElement).dataset.historyIndex).toBe("1");
    (items[0] as HTMLElement).click();
    expect(actions.onSelectHistory).toHaveBeenCalledWith(1);
  });

  it("History shows the empty state with no history", () => {
    renderConnected(<History />, { showHistory: true });
    expect(screen.getByText(/No history/)).toBeInTheDocument();
  });

  it("disclosures collapse via the `hidden` attribute + aria-expanded", () => {
    const { actions } = renderConnected(<Favorites />);
    const toggle = screen.getByRole("button", { name: "Favorites" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(
      document.getElementById("favorites-panel")?.hasAttribute("hidden"),
    ).toBe(true);
    toggle.click();
    expect(actions.onToggleFavorites).toHaveBeenCalled();
  });
});
