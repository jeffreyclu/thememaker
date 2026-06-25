/**
 * Popup CONNECTED-component tests (React Testing Library).
 *
 * Each section is rendered under the REAL `<PopupProvider><SchemeProvider>` over
 * the global chrome-mock, so the focused hooks (`useGenerate`, `useApplyScheme`,
 * `useFavorites`, `useHistory`, `usePopup`) build their REAL actions — no spies,
 * no hand-seeded contexts. State is seeded through storage so hydration populates
 * it; wiring is asserted by OBSERVABLE effects (the `hidden` disclosure flip, a
 * persisted setting, an `APPLY_SCHEME` content message). These cover the same
 * intents the old view tests did; full end-to-end flow lives in popup-app.test.tsx.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
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
import { PopupProvider } from "../src/popup/state/PopupProvider";
import { SchemeProvider } from "../src/popup/state/SchemeProvider";
import { KEYS } from "../src/lib/storage";
import { modes } from "../src/config";
import { getChromeMock } from "./chrome-mock";
import { mockScheme, mockScheme2 } from "./mocks";
import type { MessageResponse } from "../src/lib/messaging";
import type { Settings } from "../src/lib/storage";

const TAB_ID = 7;
const ORIGIN = "https://example.com";

let sent: { type: string; message: Record<string, unknown> }[];

/** Stubs `chrome.tabs` so the provider resolves an http origin + replies applied. */
const stubTabs = (
  reply: (type: string) => MessageResponse = (type) =>
    type === "RESET_SCHEME"
      ? ({ ok: true } as MessageResponse)
      : ({ ok: true, applied: true } as MessageResponse),
): void => {
  const chrome = getChromeMock();
  chrome.tabs.query = vi.fn(() =>
    Promise.resolve([{ id: TAB_ID, url: `${ORIGIN}/page` }]),
  );
  chrome.tabs.sendMessage = vi.fn(
    (
      _tabId: number,
      message: { type: string },
      cb?: (resp: MessageResponse) => void,
    ) => {
      sent.push({ type: message.type, message });
      cb?.(reply(message.type));
    },
  );
};

/** Seeds storage so hydration restores a `current` scheme (Save/Details enable). */
const seedSavedScheme = (intensity = 80): void => {
  getChromeMock().storage.local.store[`${KEYS.sitePrefix}${ORIGIN}`] = {
    enabled: true,
    savedScheme: {
      ...mockScheme,
      schemeDetails: { ...mockScheme.schemeDetails, intensity },
    },
  };
};

const seedSettings = (settings: Settings): void => {
  getChromeMock().storage.sync.store[KEYS.settings] = settings;
};

const settingsStore = (): Settings =>
  getChromeMock().storage.sync.store[KEYS.settings] as Settings;

const lastApply = (): Record<string, unknown> | undefined =>
  [...sent].reverse().find((s) => s.type === "APPLY_SCHEME")?.message;

/** Renders a section under the real providers + chrome-mock, after hydration. */
const renderConnected = async (ui: ReactElement): Promise<RenderResult> => {
  const view = render(
    <PopupProvider>
      <SchemeProvider>{ui}</SchemeProvider>
    </PopupProvider>,
  );
  await waitFor(() => expect(getChromeMock().tabs.query).toHaveBeenCalled());
  await act(async () => {});
  return view;
};

beforeEach(() => {
  sent = [];
  stubTabs();
  // Force LOCAL generation (no network), so Generate resolves synchronously.
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: false,
  });
});

afterEach(cleanup);

describe("popup connected components", () => {
  it("Controls render Random + every mode and reflect intensity/invert", async () => {
    seedSettings({ mode: "random", intensity: 80, invert: true });
    await renderConnected(<Controls />);
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(modes.length + 1);
    expect((options[0] as HTMLOptionElement).value).toBe("random");
    expect((screen.getByRole("slider") as HTMLInputElement).value).toBe("80");
    expect(screen.getByText("80")).toBeInTheDocument();
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe(
      "true",
    );
  });

  it("Controls wire mode + intensity (persisted) and invert (flips the switch)", async () => {
    await renderConnected(<Controls />);
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "triad" },
    });
    await waitFor(() => expect(settingsStore().mode).toBe("triad"));

    fireEvent.change(screen.getByRole("slider"), { target: { value: "55" } });
    await waitFor(() => expect(settingsStore().intensity).toBe(55));

    const swatch = screen.getByRole("switch");
    expect(swatch.getAttribute("aria-checked")).toBe("false");
    await act(async () => {
      swatch.click();
    });
    expect(swatch.getAttribute("aria-checked")).toBe("true");
  });

  it("Actions reflect the empty initial state (save/reset/customize disabled)", async () => {
    // No theme applied on the tab → Reset/Customize stay disabled too.
    stubTabs((type) =>
      type === "RESET_SCHEME"
        ? ({ ok: true } as MessageResponse)
        : ({ ok: true, applied: false } as MessageResponse),
    );
    await renderConnected(<Actions />);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reset" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Customize/ })).toBeDisabled();
  });

  it("Actions show the loading state on generate", async () => {
    await renderConnected(<Actions />);
    act(() => {
      screen.getByRole("button", { name: "Generate" }).click();
    });
    // Loading flips synchronously on click, before the async apply resolves.
    expect(screen.getByRole("button", { name: /Generating/ })).toBeDisabled();
    await act(async () => {});
  });

  it("Actions enable save/reset/customize when a scheme is current", async () => {
    seedSavedScheme();
    await renderConnected(<Actions />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save" })).toBeEnabled(),
    );
    expect(screen.getByRole("button", { name: "Reset" })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Customize/ })).toBeEnabled();
  });

  it("Actions disable Save when the current scheme is already a favorite (dedupe)", async () => {
    seedSavedScheme(mockScheme.schemeDetails.intensity ?? 80);
    getChromeMock().storage.sync.store[KEYS.favorites] = [
      { id: "f1", name: "X", scheme: mockScheme },
    ];
    await renderConnected(<Actions />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Reset" })).toBeEnabled(),
    );
    // Current matches the saved favorite (same content) → Save stays disabled.
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("Actions wire generate / customize intents to the content channel", async () => {
    const closeSpy = vi
      .spyOn(window, "close")
      .mockImplementation(() => undefined);
    seedSavedScheme();
    await renderConnected(<Actions />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save" })).toBeEnabled(),
    );

    sent.length = 0;
    await act(async () => {
      screen.getByRole("button", { name: "Generate" }).click();
    });
    await waitFor(() => expect(lastApply()).toBeTruthy());
    expect(lastApply()).toHaveProperty("palette");

    sent.length = 0;
    await act(async () => {
      screen.getByRole("button", { name: /Customize/ }).click();
    });
    await waitFor(() =>
      expect(sent.some((s) => s.type === "SHOW_PICKER")).toBe(true),
    );
    expect(closeSpy).toHaveBeenCalled();
    closeSpy.mockRestore();
  });

  it("Details show seed + per-color rows when expanded with a scheme", async () => {
    seedSavedScheme();
    const { container } = await renderConnected(<Details />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Details" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    expect(document.getElementById("details")?.hasAttribute("hidden")).toBe(
      false,
    );
    expect(container.textContent).toContain("Brandy Rose");
    expect(container.querySelectorAll(".details__row").length).toBeGreaterThan(
      0,
    );
  });

  it("Details list a 'Custom overrides' group when overrides exist", async () => {
    getChromeMock().storage.local.store[`${KEYS.sitePrefix}${ORIGIN}`] = {
      enabled: true,
      savedScheme: {
        ...mockScheme,
        schemeDetails: {
          ...mockScheme.schemeDetails,
          overrides: {
            "div|background": "#112233",
            "page|background": "#abcdef",
          },
        },
      },
    };
    const { container } = await renderConnected(<Details />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Details" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    expect(container.textContent).toContain("Custom overrides");
    expect(container.textContent).toContain("div · background");
    expect(container.textContent).toContain("Page background");
    expect(container.textContent).toContain("#112233");
    expect(container.textContent).toContain("#abcdef");
  });

  it("Details toggle is disabled without a scheme + collapsed by default", async () => {
    await renderConnected(<Details />);
    expect(screen.getByRole("button", { name: "Details" })).toBeDisabled();
    expect(document.getElementById("details")?.hasAttribute("hidden")).toBe(
      true,
    );
  });

  it("Status surfaces errors with the error class", async () => {
    // A failing apply during generate drives the popup error state.
    stubTabs((type) =>
      type === "QUERY_STATE"
        ? ({ ok: true, applied: false } as MessageResponse)
        : ({ ok: false, error: "offline" } as MessageResponse),
    );
    await renderConnected(
      <>
        <Actions />
        <Status />
      </>,
    );
    await act(async () => {
      screen.getByRole("button", { name: "Generate" }).click();
    });
    const status = await waitFor(() => {
      const el = document.getElementById("status");
      expect(el?.textContent).toBe("offline");
      return el;
    });
    expect(status?.classList.contains("popup__status--error")).toBe(true);
  });

  it("Status is empty + unstyled with no error", async () => {
    await renderConnected(<Status />);
    const status = document.getElementById("status");
    expect(status?.textContent).toBe("");
    expect(status?.classList.contains("popup__status--error")).toBe(false);
  });

  it("Favorites render with name + swatches + a delete control each", async () => {
    getChromeMock().storage.sync.store[KEYS.favorites] = [
      { id: "a", name: "My Fave", scheme: mockScheme },
      { id: "b", name: "Other", scheme: mockScheme2 },
    ];
    const { container } = await renderConnected(<Favorites />);
    fireEvent.click(screen.getByRole("button", { name: "Favorites" }));
    expect(container.querySelectorAll("[data-favorite-id]")).toHaveLength(2);
    expect(container.textContent).toContain("My Fave");
    expect(
      container.querySelectorAll(".favorites__swatch").length,
    ).toBeGreaterThan(0);
    expect(container.querySelectorAll("[data-favorite-delete]")).toHaveLength(
      2,
    );
  });

  it("Favorites show the empty state", async () => {
    await renderConnected(<Favorites />);
    fireEvent.click(screen.getByRole("button", { name: "Favorites" }));
    expect(screen.getByText(/No favorites/)).toBeInTheDocument();
  });

  it("Favorites wire apply (row) + delete (control) without double-firing", async () => {
    getChromeMock().storage.sync.store[KEYS.favorites] = [
      { id: "fav-1", name: "Sunset", scheme: mockScheme },
    ];
    await renderConnected(<Favorites />);
    fireEvent.click(screen.getByRole("button", { name: "Favorites" }));

    sent.length = 0;
    await act(async () => {
      (document.querySelector("[data-favorite-id]") as HTMLElement).click();
    });
    // Apply re-applies the favorite to the page.
    await waitFor(() => expect(lastApply()).toBeTruthy());

    await act(async () => {
      within(document.body)
        .getByRole("button", { name: /Delete favorite/ })
        .click();
    });
    // Delete removes it from storage (and the list re-renders empty).
    await waitFor(() =>
      expect(
        getChromeMock().storage.sync.store[KEYS.favorites] as unknown[],
      ).toHaveLength(0),
    );
    expect(screen.getByText(/No favorites/)).toBeInTheDocument();
  });

  it("History lists entries most-recent first + re-applies by original index", async () => {
    getChromeMock().storage.local.store[KEYS.history] = [
      mockScheme,
      mockScheme2,
    ];
    const { container } = await renderConnected(<History />);
    fireEvent.click(screen.getByRole("button", { name: "History" }));
    const items = container.querySelectorAll("[data-history-index]");
    expect(items).toHaveLength(2);
    // Newest first: index 1 (mockScheme2) is rendered at the top.
    expect((items[0] as HTMLElement).dataset.historyIndex).toBe("1");

    sent.length = 0;
    await act(async () => {
      (items[0] as HTMLElement).click();
    });
    await waitFor(() => expect(lastApply()).toBeTruthy());
    expect(lastApply()?.scheme).toBeTruthy();
  });

  it("History shows the empty state with no history", async () => {
    await renderConnected(<History />);
    fireEvent.click(screen.getByRole("button", { name: "History" }));
    expect(screen.getByText(/No history/)).toBeInTheDocument();
  });

  it("disclosures collapse via the `hidden` attribute + aria-expanded", async () => {
    await renderConnected(<Favorites />);
    const toggle = screen.getByRole("button", { name: "Favorites" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(
      document.getElementById("favorites-panel")?.hasAttribute("hidden"),
    ).toBe(true);

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(
      document.getElementById("favorites-panel")?.hasAttribute("hidden"),
    ).toBe(false);
  });
});
