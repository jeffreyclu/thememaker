import { describe, expect, it } from "vitest";

import { hydratePartial } from "../src/popup/scheme-reducer";
import type { Settings, SiteState } from "../src/lib/storage";
import type { Scheme } from "../src/types";

const settings: Settings = {
  mode: "random",
  intensity: 80,
  invert: false,
};

describe("hydratePartial — restoring a persisted theme into a fresh popup", () => {
  it("restores the saved scheme as `current` with its saved intensity", () => {
    // A persisted site: the content script themed the page on load, and the
    // popup is opened fresh. Without restoring `current`, the intensity slider
    // would be a no-op here (the regression we fixed).
    const saved: Scheme = {
      schemeDetails: {
        rootColor: "#3a7bd5",
        colorMode: "triad",
        intensity: 40,
      },
    };
    const site: SiteState = { enabled: true, savedScheme: saved };

    const partial = hydratePartial({
      settings,
      history: [],
      favorites: [],
      origin: "https://github.com",
      site,
      applied: true,
    });

    expect(partial.current).toBe(saved);
    // The dial reflects the applied theme, not the global default.
    expect(partial.intensity).toBe(40);
    expect(partial.applied).toBe(true);
    expect(partial.siteEnabled).toBe(true);
    expect(partial.origin).toBe("https://github.com");
  });

  it("falls back to settings intensity and null `current` with no saved scheme", () => {
    const partial = hydratePartial({
      settings,
      history: [],
      favorites: [],
      origin: "https://example.com",
      site: { enabled: false },
      applied: false,
    });

    expect(partial.current).toBeNull();
    expect(partial.intensity).toBe(80);
    expect(partial.applied).toBe(false);
    expect(partial.siteEnabled).toBe(false);
    // No saved scheme + settings.invert false → invert off.
    expect(partial.invert).toBe(false);
  });

  it("restores the saved scheme's `invert` flag over the global setting", () => {
    const saved: Scheme = {
      schemeDetails: {
        rootColor: "#3a7bd5",
        colorMode: "triad",
        intensity: 60,
        invert: true,
      },
    };
    const partial = hydratePartial({
      settings, // settings.invert is false
      history: [],
      favorites: [],
      origin: "https://github.com",
      site: { enabled: true, savedScheme: saved },
      applied: true,
    });
    // The per-scheme invert flag wins over the global default.
    expect(partial.invert).toBe(true);
  });
});
