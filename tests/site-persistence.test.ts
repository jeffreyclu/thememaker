/**
 * Persistence wiring: the per-site save/update/disable semantics the popup
 * drives, verified end-to-end against the storage adapter + the pure reducer +
 * the content-script load decision.
 *
 * These mirror EXACTLY the operations the popup handlers perform
 * (`schemeWithIntensity` → `siteStateReducer` → `storage.setSiteState`), then
 * assert the persisted shape and what the content script would do on the next
 * load (`loadDecision`). This pins the full round-trip:
 *   enable → store current palette + intensity
 *   generate / history / slider while enabled → update the saved scheme
 *   disable → stop auto-apply (but keep the scheme)
 */
import { beforeEach, describe, expect, it } from "vitest";

import { ThememakerStorage, type StorageArea } from "../src/lib/storage";
import { loadDecision, siteStateReducer } from "../src/lib/site-state";
import {
  schemeFromPalette,
  schemeWithIntensity,
} from "../src/popup/engine-bridge";
import { generatePalette } from "../src/lib/palette";
import { mockPalette } from "./mocks";

const memoryArea = (): StorageArea => {
  const store: Record<string, unknown> = {};
  return {
    get: async <T>(key: string) => store[key] as T | undefined,
    set: async <T>(key: string, value: T) => {
      store[key] = value;
    },
    remove: async (key: string) => {
      delete store[key];
    },
  };
};

const ORIGIN = "https://github.com";

describe("per-site persistence wiring", () => {
  let storage: ThememakerStorage;

  beforeEach(() => {
    storage = new ThememakerStorage(memoryArea(), memoryArea());
  });

  /** Replays the popup's "enable toggle" with the live scheme + intensity. */
  const enable = async (palette = mockPalette, intensity = 70) => {
    const current = schemeFromPalette(palette, intensity);
    const next = siteStateReducer(await storage.getSiteState(ORIGIN), {
      type: "enable",
      scheme: schemeWithIntensity(current, intensity),
    });
    await storage.setSiteState(ORIGIN, next);
    return current;
  };

  /** Replays "while enabled, a new apply updates the saved scheme". */
  const updateWhileEnabled = async (
    scheme: ReturnType<typeof schemeFromPalette>,
    intensity: number,
  ) => {
    const next = siteStateReducer(await storage.getSiteState(ORIGIN), {
      type: "rememberScheme",
      scheme: schemeWithIntensity(scheme, intensity),
    });
    await storage.setSiteState(ORIGIN, next);
  };

  it("enabling stores the current palette + intensity as the reapply target", async () => {
    await enable(mockPalette, 70);
    const state = await storage.getSiteState(ORIGIN);
    expect(state.enabled).toBe(true);
    expect(state.savedScheme?.schemeDetails.palette).toStrictEqual(mockPalette);
    expect(state.savedScheme?.schemeDetails.intensity).toBe(70);

    // The content script would reapply exactly that on the next load.
    const decision = loadDecision(state);
    expect(decision.apply).toBe(true);
    if (decision.apply) {
      expect(decision.palette).toStrictEqual(mockPalette);
      expect(decision.options).toEqual({ intensity: 70 });
    }
  });

  it("moving the slider while enabled updates the saved intensity (reload restores it)", async () => {
    const current = await enable(mockPalette, 70);
    // User drags the slider to 30 → popup commits the new intensity.
    await updateWhileEnabled(current, 30);

    const state = await storage.getSiteState(ORIGIN);
    expect(state.savedScheme?.schemeDetails.intensity).toBe(30);
    // Palette unchanged — only the intensity moved.
    expect(state.savedScheme?.schemeDetails.palette).toStrictEqual(mockPalette);
    const decision = loadDecision(state);
    expect(decision.apply && decision.options.intensity).toBe(30);
  });

  it("generating a NEW scheme while enabled replaces the saved palette", async () => {
    await enable(mockPalette, 80);
    // Generate produces a brand-new palette; the popup persists it.
    const fresh = generatePalette("#aa3333", "complement");
    const freshScheme = schemeFromPalette(fresh, 80);
    await updateWhileEnabled(freshScheme, 80);

    const state = await storage.getSiteState(ORIGIN);
    expect(state.savedScheme?.schemeDetails.palette).toStrictEqual(fresh);
    expect(state.savedScheme?.schemeDetails.palette).not.toStrictEqual(
      mockPalette,
    );
    const decision = loadDecision(state);
    expect(decision.apply && decision.palette).toStrictEqual(fresh);
  });

  it("re-applying a history entry while enabled updates the reapply target", async () => {
    await enable(mockPalette, 60);
    const historyPalette = generatePalette("#112233", "triad");
    const historyScheme = schemeFromPalette(historyPalette, 60);
    await updateWhileEnabled(historyScheme, 60);

    const state = await storage.getSiteState(ORIGIN);
    expect(state.savedScheme?.schemeDetails.palette).toStrictEqual(
      historyPalette,
    );
  });

  it("disabling stops auto-apply but KEEPS the saved scheme", async () => {
    await enable(mockPalette, 70);
    // Popup's toggle-off path.
    const off = siteStateReducer(await storage.getSiteState(ORIGIN), {
      type: "disable",
    });
    await storage.setSiteState(ORIGIN, off);

    const state = await storage.getSiteState(ORIGIN);
    expect(state.enabled).toBe(false);
    // The content script no longer auto-applies on the next load...
    expect(loadDecision(state)).toEqual({ apply: false });
    // ...but the scheme is retained so re-enabling restores it.
    expect(state.savedScheme?.schemeDetails.palette).toStrictEqual(mockPalette);
  });

  it("re-enabling after disable restores the previously-saved look", async () => {
    await enable(mockPalette, 45);
    const off = siteStateReducer(await storage.getSiteState(ORIGIN), {
      type: "disable",
    });
    await storage.setSiteState(ORIGIN, off);

    // Re-enable WITHOUT supplying a scheme (e.g. nothing currently applied) →
    // the kept scheme is reused.
    const on = siteStateReducer(await storage.getSiteState(ORIGIN), {
      type: "enable",
    });
    await storage.setSiteState(ORIGIN, on);

    const decision = loadDecision(await storage.getSiteState(ORIGIN));
    expect(decision.apply).toBe(true);
    if (decision.apply) {
      expect(decision.palette).toStrictEqual(mockPalette);
      expect(decision.options).toEqual({ intensity: 45 });
    }
  });

  it("sites are independent: enabling one origin does not affect another", async () => {
    await enable(mockPalette, 70);
    const otherOrigin = "https://news.ycombinator.com";
    expect(loadDecision(await storage.getSiteState(otherOrigin))).toEqual({
      apply: false,
    });
    // The first origin is still enabled.
    expect((await storage.getSiteState(ORIGIN)).enabled).toBe(true);
  });

  it("schemeWithIntensity bakes the LIVE intensity onto the saved scheme", () => {
    const current = schemeFromPalette(mockPalette, 80); // generated at 80
    const saved = schemeWithIntensity(current, 25); // slider now at 25
    expect(saved.schemeDetails.intensity).toBe(25);
    expect(saved.schemeDetails.palette).toStrictEqual(mockPalette);
    // Original is not mutated.
    expect(current.schemeDetails.intensity).toBe(80);
  });
});
