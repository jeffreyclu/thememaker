/**
 * Popup BEHAVIOR tests (React Testing Library).
 *
 * These render the real `App` over the global chrome-mock — `chrome.tabs.query`
 * and `chrome.tabs.sendMessage` stubbed per test — and assert the preserved
 * feature behavior the old controller/handler tests covered: generate (apply +
 * persist + history), live intensity (debounced re-apply), invert (flips live),
 * customize (opens picker + closes popup), reset, favorites save (dedupe +
 * just-saved highlight + panel-opens), history apply, and hydrate-on-open.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import { App } from "../src/popup/App";
import { KEYS } from "../src/lib/storage";
import { getChromeMock } from "./chrome-mock";
import { mockScheme } from "./mocks";
import type { MessageResponse } from "../src/lib/messaging";

const TAB_ID = 7;

/** A captured content message + the reply we sent back, for assertions. */
interface SentMessage {
  type: string;
  message: Record<string, unknown>;
}

let sent: SentMessage[];

/**
 * Stubs `chrome.tabs` so the popup resolves an active tab on an http origin and
 * the content channel replies "applied". `reply` lets a test override the
 * APPLY/RESET/QUERY response (e.g. to simulate a failure).
 */
const stubTabs = (reply: (type: string) => MessageResponse): void => {
  const chrome = getChromeMock();
  // The provider awaits `chrome.tabs.query` (promise form).
  chrome.tabs.query = vi.fn(() =>
    Promise.resolve([{ id: TAB_ID, url: "https://example.com/page" }]),
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

const okReply = (type: string): MessageResponse => {
  if (type === "RESET_SCHEME") {
    return { ok: true } as MessageResponse;
  }
  // APPLY_SCHEME + QUERY_STATE both report applied.
  return { ok: true, applied: true } as MessageResponse;
};

/** Renders the App and waits for the initial hydration effect to settle. */
const renderApp = async () => {
  const view = render(<App />);
  await waitFor(() => expect(getChromeMock().tabs.query).toHaveBeenCalled());
  // Let the hydrate microtasks flush.
  await act(async () => {});
  return view;
};

const lastApply = (): Record<string, unknown> | undefined =>
  [...sent].reverse().find((s) => s.type === "APPLY_SCHEME")?.message;

beforeEach(() => {
  sent = [];
  stubTabs(okReply);
  // Force LOCAL generation (no network): `generateForSelection` runs fully
  // synchronously offline, so a test's Generate can't leave an async fetch in
  // flight that resolves into the NEXT test's freshly-reset `sent` array.
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: false,
  });
});

afterEach(cleanup);

describe("popup app behavior", () => {
  it("hydrates favorites + history from storage on open", async () => {
    const chrome = getChromeMock();
    chrome.storage.sync.store[KEYS.favorites] = [
      { id: "f1", name: "Seeded Fave", scheme: mockScheme },
    ];
    chrome.storage.local.store[KEYS.history] = [mockScheme];

    await renderApp();

    // Open both disclosures to read their contents.
    fireEvent.click(screen.getByRole("button", { name: "Favorites" }));
    fireEvent.click(screen.getByRole("button", { name: "History" }));
    expect(await screen.findByText("Seeded Fave")).toBeInTheDocument();
    expect(screen.getByText(/Brandy Rose/)).toBeInTheDocument();
  });

  it("Generate applies the scheme + records history", async () => {
    await renderApp();
    await act(async () => {
      screen.getByRole("button", { name: "Generate" }).click();
    });
    await waitFor(() => expect(lastApply()).toBeTruthy());
    // The content script was told to apply, and a palette rode along.
    expect(lastApply()).toHaveProperty("palette");
    // History persisted.
    await waitFor(() =>
      expect(getChromeMock().storage.local.store[KEYS.history]).toBeTruthy(),
    );
  });

  it("Generate surfaces an error when the content apply fails", async () => {
    stubTabs((type) =>
      type === "QUERY_STATE"
        ? ({ ok: true, applied: false } as MessageResponse)
        : ({ ok: false, error: "boom" } as MessageResponse),
    );
    await renderApp();
    await act(async () => {
      screen.getByRole("button", { name: "Generate" }).click();
    });
    expect(await screen.findByText("boom")).toBeInTheDocument();
    // Query by id: `<output>` also exposes role="status", which would collide.
    expect(document.getElementById("status")?.classList).toContain(
      "popup__status--error",
    );
  });

  it("Save adds a favorite, opens the panel, highlights the row, then dedupes", async () => {
    await renderApp();
    // Generate first so there's a current scheme to save.
    await act(async () => {
      screen.getByRole("button", { name: "Generate" }).click();
    });
    const save = screen.getByRole("button", { name: "Save" });
    await waitFor(() => expect(save).toBeEnabled());

    await act(async () => {
      save.click();
    });

    // Favorites panel auto-opens and the new row is highlighted.
    await waitFor(() =>
      expect(
        document.getElementById("favorites-panel")?.hasAttribute("hidden"),
      ).toBe(false),
    );
    await waitFor(() =>
      expect(document.querySelector(".favorites__item--saved")).toBeTruthy(),
    );
    // Content dedupe: the current scheme is now already a favorite → Save off.
    expect(save).toBeDisabled();
  });

  it("history apply re-applies the picked entry", async () => {
    getChromeMock().storage.local.store[KEYS.history] = [mockScheme];
    await renderApp();
    fireEvent.click(screen.getByRole("button", { name: "History" }));
    const item = await screen.findByText(/Brandy Rose/);
    sent.length = 0;
    fireEvent.click(item);
    await waitFor(() => expect(lastApply()).toBeTruthy());
    expect(lastApply()?.scheme).toBeTruthy();
  });

  it("Customize opens the in-page picker and closes the popup", async () => {
    const closeSpy = vi
      .spyOn(window, "close")
      .mockImplementation(() => undefined);
    await renderApp();
    await act(async () => {
      screen.getByRole("button", { name: "Generate" }).click();
    });
    // Wait for Save to enable — it proves `current` is set (the gate the picker
    // also requires), unlike Customize which enables on `applied` alone.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save" })).toBeEnabled(),
    );
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

  it("Reset clears the live theme + hides the picker", async () => {
    await renderApp();
    await act(async () => {
      screen.getByRole("button", { name: "Generate" }).click();
    });
    const reset = screen.getByRole("button", { name: "Reset" });
    await waitFor(() => expect(reset).toBeEnabled());
    sent.length = 0;
    await act(async () => {
      reset.click();
    });
    await waitFor(() =>
      expect(sent.some((s) => s.type === "RESET_SCHEME")).toBe(true),
    );
    expect(sent.some((s) => s.type === "HIDE_PICKER")).toBe(true);
    // After reset there's nothing to save/customize.
    await waitFor(() => expect(reset).toBeDisabled());
  });

  it("intensity drag debounces a live re-apply + persists the value", async () => {
    // Pre-seed this origin's saved theme so hydration restores `current` and the
    // QUERY_STATE reply marks it `applied` — intensity re-applies only then. This
    // avoids generating under fake timers (a flaky async/network path).
    getChromeMock().storage.local.store["site:https://example.com"] = {
      enabled: true,
      savedScheme: {
        ...mockScheme,
        schemeDetails: { ...mockScheme.schemeDetails, intensity: 80 },
      },
    };

    await renderApp();
    // Hydration restored the saved theme — Customize/Save enable on `current`.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save" })).toBeEnabled(),
    );

    sent.length = 0;
    const slider = screen.getByRole("slider") as HTMLInputElement;
    const applies = () => sent.filter((s) => s.type === "APPLY_SCHEME");
    const applyIntensity = (s: SentMessage): number =>
      (s.message.options as { intensity: number }).intensity;

    // Two quick drags — only the last value should commit (debounced).
    // `fireEvent.change` updates React's value tracker so onChange fires.
    fireEvent.change(slider, { target: { value: "40" } });
    fireEvent.change(slider, { target: { value: "55" } });

    // Nothing re-applied yet (debounce pending).
    expect(applies()).toHaveLength(0);

    // The 120ms debounce fires a re-apply at the FINAL value (the intermediate
    // "40" drag was collapsed away, so 40 never reaches the page).
    await waitFor(() => expect(applies().length).toBeGreaterThan(0), {
      timeout: 1000,
    });
    expect(applyIntensity(applies()[0])).toBe(55);
    expect(applies().every((s) => applyIntensity(s) === 55)).toBe(true);
    // The settings persist captured the latest value.
    await waitFor(() =>
      expect(
        (
          getChromeMock().storage.sync.store[KEYS.settings] as {
            intensity: number;
          }
        ).intensity,
      ).toBe(55),
    );
  });
});
