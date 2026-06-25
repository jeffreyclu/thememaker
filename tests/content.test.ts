/**
 * Content-script LOAD DECISION + auto-reapply flow.
 *
 * Two layers:
 *  1. `loadDecision` as a PURE function: given per-site state → apply with which
 *     palette/options, or no-op. No DOM, no chrome.
 *  2. The content-script flow (`runContentScript`) against the chrome mock + the
 *     single `Engine` instance (spied): it reads `site:<origin>` from
 *     `chrome.storage.local`, calls `engine.preventReloadFlash()`, and drives
 *     `engine.applyWhenReady()` — only when enabled with a faithful saved scheme.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";

import type { ApplyOptions } from "../src/types";
import type { Palette } from "../src/lib/palette/palette";

import { loadDecision } from "../src/lib/storage/site-state";
import { STYLE_ELEMENT_ID } from "../src/lib/engine/theme-dom-constants";
import { schemeFromPalette } from "../src/popup/schemes";
import { KEYS, type SiteState } from "../src/lib/storage";
import { getChromeMock } from "./chrome-mock";
import { mockPalette } from "./mocks";
import { DEFAULT_INTENSITY, MIN_INTENSITY } from "../src/types";

// Spy on the SINGLE long-lived Engine instance so the flow tests assert WHAT is
// applied without running the heavy DOM-walk. The content script drives this same
// instance (`lib/engine (the shared singleton)`), so spying its methods intercepts the
// real calls.
import { engine } from "../src/lib/engine";

const savedSiteState = (intensity: number): SiteState => ({
  enabled: true,
  savedScheme: schemeFromPalette(mockPalette, intensity, "Test"),
});

describe("loadDecision (pure content-script verdict)", () => {
  it("no state → no-op", () => {
    expect(loadDecision(undefined)).toEqual({ apply: false });
    expect(loadDecision(null)).toEqual({ apply: false });
  });

  it("disabled site → no-op even with a saved scheme", () => {
    const state: SiteState = {
      enabled: false,
      savedScheme: schemeFromPalette(mockPalette, 70),
    };
    expect(loadDecision(state)).toEqual({ apply: false });
  });

  it("enabled but no saved scheme → no-op", () => {
    expect(loadDecision({ enabled: true })).toEqual({ apply: false });
  });

  it("enabled with a legacy scheme (no palette) → no-op (can't reapply faithfully)", () => {
    const legacy: SiteState = {
      enabled: true,
      savedScheme: {
        schemeDetails: { rootColor: "#3a7bd5", colorMode: "triad" },
      },
    };
    expect(loadDecision(legacy)).toEqual({ apply: false });
  });

  it("enabled with palette + intensity → apply with that palette + intensity", () => {
    const decision = loadDecision(savedSiteState(65));
    expect(decision.apply).toBe(true);
    if (decision.apply) {
      expect(decision.palette).toStrictEqual(mockPalette);
      expect(decision.options).toEqual({ intensity: 65 });
    }
  });

  it("clamps an out-of-range saved intensity into the selectable band", () => {
    const tooLow = loadDecision(savedSiteState(0));
    const tooHigh = loadDecision(savedSiteState(500));
    expect(tooLow.apply && tooLow.options.intensity).toBe(MIN_INTENSITY);
    expect(tooHigh.apply && tooHigh.options.intensity).toBe(100);
  });

  it("defaults intensity when the saved scheme omits it", () => {
    const state: SiteState = {
      enabled: true,
      // a scheme that carries a palette but no intensity
      savedScheme: {
        schemeDetails: {
          rootColor: "#000",
          colorMode: "triad",
          palette: mockPalette,
        },
      },
    };
    const d = loadDecision(state);
    expect(d.apply && d.options.intensity).toBe(DEFAULT_INTENSITY);
  });
});

describe("runContentScript (auto-reapply flow)", () => {
  let applySpy: MockInstance<[Palette, ApplyOptions], boolean>;

  beforeEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    document.documentElement.removeAttribute("style");
    document.getElementById(STYLE_ELEMENT_ID)?.remove();
    // Spy that CALLS THROUGH to the real engine (so the early-base paint + clear
    // it owns really happen), while still recording the apply args.
    applySpy = vi.spyOn(engine, "apply");
    // location.origin in jsdom defaults to a real http origin.
    Object.defineProperty(window, "location", {
      value: new URL("https://example.com/page"),
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    applySpy.mockRestore();
    vi.restoreAllMocks();
    engine.reset();
    window.localStorage.clear();
  });

  const seedStorage = (origin: string, state: SiteState): void => {
    getChromeMock().storage.local.store[KEYS.sitePrefix + origin] = state;
  };

  // Import lazily AFTER the spy + guard so the module's side-effect entry is
  // suppressed and we drive `runContentScript` ourselves.
  const loadModule = async () => {
    (
      window as unknown as { __THEMEMAKER_TEST__?: boolean }
    ).__THEMEMAKER_TEST__ = true;
    return import("../src/content/index");
  };

  it("does nothing when the site is disabled", async () => {
    seedStorage("https://example.com", {
      enabled: false,
      savedScheme: schemeFromPalette(mockPalette, 70),
    });
    const { runContentScript } = await loadModule();
    await runContentScript();
    expect(applySpy).not.toHaveBeenCalled();
    expect(document.getElementById("themeMakerEarly")).toBeNull();
  });

  it("does nothing when there is no saved state for the origin", async () => {
    const { runContentScript } = await loadModule();
    await runContentScript();
    expect(applySpy).not.toHaveBeenCalled();
  });

  it("paints an early base and applies the saved scheme when enabled (body present)", async () => {
    document.body.innerHTML = "<p>hi</p>";
    seedStorage("https://example.com", savedSiteState(55));
    const { runContentScript } = await loadModule();
    await runContentScript();

    // Full engine ran with the saved palette + intensity.
    expect(applySpy).toHaveBeenCalledTimes(1);
    const [palette, options] = applySpy.mock.calls[0];
    expect(palette).toStrictEqual(mockPalette);
    expect(options).toEqual({ intensity: 55 });

    // Early-base style is cleared after the full apply runs (body was present).
    expect(document.getElementById("themeMakerEarly")).toBeNull();
  });

  it("defers the full apply to DOMContentLoaded when the body is absent, but paints the base now", async () => {
    // No body yet — simulate document_start.
    const realBody = document.body;
    Object.defineProperty(document, "body", {
      value: null,
      configurable: true,
    });
    seedStorage("https://example.com", savedSiteState(40));
    const { runContentScript } = await loadModule();
    await runContentScript();

    // Early base painted immediately (onto <html> via a marker style).
    const early = document.getElementById(
      "themeMakerEarly",
    ) as HTMLStyleElement;
    expect(early).toBeTruthy();
    expect(early.textContent).toMatch(
      /html \{ background-color: #[0-9a-f]{6}/i,
    );
    // Full engine has NOT run yet (waiting for DOMContentLoaded).
    expect(applySpy).not.toHaveBeenCalled();

    // Restore body + fire DOMContentLoaded → the deferred apply runs.
    Object.defineProperty(document, "body", {
      value: realBody,
      configurable: true,
    });
    document.dispatchEvent(new Event("DOMContentLoaded"));
    expect(applySpy).toHaveBeenCalledTimes(1);
    // The early stand-in is cleared once the engine owns the base.
    expect(document.getElementById("themeMakerEarly")).toBeNull();
  });

  it("reads the per-site key by ORIGIN (sites are independent)", async () => {
    seedStorage("https://other.com", savedSiteState(70));
    document.body.innerHTML = "<p>x</p>";
    const { runContentScript } = await loadModule();
    await runContentScript();
    // Saved under a DIFFERENT origin → current origin no-ops.
    expect(applySpy).not.toHaveBeenCalled();
  });

  it("no-ops on an opaque origin (chrome://, about:, data:)", async () => {
    Object.defineProperty(window, "location", {
      value: { origin: "null" },
      writable: true,
      configurable: true,
    });
    seedStorage("https://example.com", savedSiteState(70));
    const { runContentScript } = await loadModule();
    await runContentScript();
    expect(applySpy).not.toHaveBeenCalled();
  });
});

/**
 * APPLY / RESET / QUERY reply-message handling — the page-side routing that the
 * background's `chrome.scripting.executeScript` injector USED to do (the
 * relocated `router.test.ts` coverage). `handleContentReplyMessage` is the
 * content script's request/response handler the popup awaits.
 */
describe("handleContentReplyMessage (APPLY/RESET/QUERY page-side routing)", () => {
  let applySpy: MockInstance<[Palette, ApplyOptions], boolean>;
  let removeSpy: MockInstance<[], boolean>;
  let appliedSpy: MockInstance<[], boolean>;

  beforeEach(() => {
    document.body.innerHTML = "<p>hi</p>"; // body present → engine runs sync.
    applySpy = vi.spyOn(engine, "apply").mockReturnValue(true);
    removeSpy = vi.spyOn(engine, "reset").mockReturnValue(true);
    appliedSpy = vi.spyOn(engine, "isApplied").mockReturnValue(false);
    (
      window as unknown as { __THEMEMAKER_TEST__?: boolean }
    ).__THEMEMAKER_TEST__ = true;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("APPLY_SCHEME runs the engine and echoes the scheme with applied:true", async () => {
    const { handleContentReplyMessage } =
      await import("../src/content/message-router");
    const scheme = schemeFromPalette(mockPalette, 60, "Test");
    const resp = handleContentReplyMessage({
      type: "APPLY_SCHEME",
      palette: mockPalette,
      options: { intensity: 60 },
      scheme,
    });

    expect(applySpy).toHaveBeenCalledTimes(1);
    const [palette, options] = applySpy.mock.calls[0];
    expect(palette).toStrictEqual(mockPalette);
    expect(options).toEqual({ intensity: 60 });
    expect(resp).toMatchObject({ ok: true, applied: true, scheme });
  });

  it("RESET_SCHEME removes the style and reports applied:false", async () => {
    const { handleContentReplyMessage } =
      await import("../src/content/message-router");
    const resp = handleContentReplyMessage({ type: "RESET_SCHEME" });
    expect(removeSpy).toHaveBeenCalledTimes(1);
    expect(resp).toStrictEqual({ ok: true, applied: false });
  });

  it("QUERY_STATE reports whether a style is applied", async () => {
    appliedSpy.mockReturnValue(true);
    const { handleContentReplyMessage } =
      await import("../src/content/message-router");
    const resp = handleContentReplyMessage({ type: "QUERY_STATE" });
    expect(appliedSpy).toHaveBeenCalledTimes(1);
    expect(resp).toStrictEqual({ ok: true, applied: true });
  });

  it("turns an engine throw into { ok:false, error } (no throw)", async () => {
    applySpy.mockImplementation(() => {
      throw new Error("boom");
    });
    const { handleContentReplyMessage } =
      await import("../src/content/message-router");
    const resp = handleContentReplyMessage({
      type: "APPLY_SCHEME",
      palette: mockPalette,
      options: { intensity: 60 },
      scheme: schemeFromPalette(mockPalette, 60, "Test"),
    });
    expect(resp.ok).toBe(false);
    expect(resp.error).toBe("boom");
  });
});
