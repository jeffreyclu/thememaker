import { describe, expect, it } from "vitest";

import {
  currentSchemeDetails,
  defaultFavoriteName,
  historyLabel,
  initialPopupState,
  popupReducer,
  schemeDetailRows,
  type PopupState,
} from "../src/popup/state/state";
import {
  applyPayloadForScheme,
  generateForSelection,
  modesForSelection,
  resolveMode,
  resolveSeed,
  schemeFromPalette,
} from "../src/popup/engine-bridge";
import { modes } from "../src/config";
import { clampIntensity, DEFAULT_INTENSITY, MIN_INTENSITY } from "../src/types";
import { mockPalette, mockScheme, mockScheme2 } from "./mocks";

describe("clampIntensity (continuous 10–100; 0 never selectable)", () => {
  it("floors below-minimum / negative values to MIN_INTENSITY (no 0)", () => {
    expect(clampIntensity(0)).toBe(MIN_INTENSITY);
    expect(clampIntensity(-50)).toBe(MIN_INTENSITY);
    expect(clampIntensity(5)).toBe(MIN_INTENSITY);
    expect(MIN_INTENSITY).toBeGreaterThan(0);
  });
  it("passes through in-range values and caps at 100", () => {
    expect(clampIntensity(20)).toBe(20);
    expect(clampIntensity(63)).toBe(63);
    expect(clampIntensity(80)).toBe(80);
    expect(clampIntensity(100)).toBe(100);
    expect(clampIntensity(150)).toBe(100);
  });
  it("falls back to the default for non-finite input", () => {
    expect(clampIntensity(NaN)).toBe(DEFAULT_INTENSITY);
  });
});

describe("popupReducer", () => {
  it("hydrate merges a partial state", () => {
    const next = popupReducer(initialPopupState, {
      type: "hydrate",
      partial: { mode: "triad", origin: "https://x.com", siteEnabled: true },
    });
    expect(next.mode).toBe("triad");
    expect(next.origin).toBe("https://x.com");
    expect(next.siteEnabled).toBe(true);
  });

  it("selectMode updates the mode", () => {
    const next = popupReducer(initialPopupState, {
      type: "selectMode",
      mode: "complement",
    });
    expect(next.mode).toBe("complement");
  });

  it("generateStart sets loading and clears error", () => {
    const errored: PopupState = { ...initialPopupState, error: "x" };
    const next = popupReducer(errored, { type: "generateStart" });
    expect(next.loading).toBe(true);
    expect(next.error).toBeNull();
  });

  it("generateSuccess sets current, history, applied", () => {
    const next = popupReducer(
      { ...initialPopupState, loading: true },
      { type: "generateSuccess", scheme: mockScheme, history: [mockScheme] },
    );
    expect(next.loading).toBe(false);
    expect(next.current).toStrictEqual(mockScheme);
    expect(next.history).toStrictEqual([mockScheme]);
    expect(next.applied).toBe(true);
  });

  it("generateError records the error and stops loading", () => {
    const next = popupReducer(
      { ...initialPopupState, loading: true },
      { type: "generateError", error: "offline" },
    );
    expect(next.loading).toBe(false);
    expect(next.error).toBe("offline");
  });

  it("selectHistory picks a scheme by index and marks applied", () => {
    const state: PopupState = {
      ...initialPopupState,
      history: [mockScheme, mockScheme2],
    };
    const next = popupReducer(state, { type: "selectHistory", index: 1 });
    expect(next.current).toStrictEqual(mockScheme2);
    expect(next.applied).toBe(true);
  });

  it("selectHistory out of range is a no-op", () => {
    const state: PopupState = {
      ...initialPopupState,
      history: [mockScheme],
    };
    const next = popupReducer(state, { type: "selectHistory", index: 9 });
    expect(next).toBe(state);
  });

  it("reset clears current, applied, and siteEnabled", () => {
    const state: PopupState = {
      ...initialPopupState,
      current: mockScheme,
      applied: true,
      siteEnabled: true,
    };
    const next = popupReducer(state, { type: "reset" });
    expect(next.current).toBeNull();
    expect(next.applied).toBe(false);
    expect(next.siteEnabled).toBe(false);
  });

  it("toggleDetails flips its flag; setSiteEnabled sets siteEnabled", () => {
    expect(
      popupReducer(initialPopupState, { type: "toggleDetails" }).showDetails,
    ).toBe(true);
    expect(
      popupReducer(initialPopupState, { type: "setSiteEnabled", enabled: true })
        .siteEnabled,
    ).toBe(true);
    expect(
      popupReducer(
        { ...initialPopupState, siteEnabled: true },
        { type: "setSiteEnabled", enabled: false },
      ).siteEnabled,
    ).toBe(false);
  });

  it("toggleFavorites and toggleHistory flip their disclosure flags", () => {
    expect(
      popupReducer(initialPopupState, { type: "toggleFavorites" })
        .showFavorites,
    ).toBe(true);
    expect(
      popupReducer(initialPopupState, { type: "toggleHistory" }).showHistory,
    ).toBe(true);
  });

  it("selectIntensity sets the numeric intensity", () => {
    const next = popupReducer(initialPopupState, {
      type: "selectIntensity",
      intensity: 80,
    });
    expect(next.intensity).toBe(80);
  });

  it("toggleInvert flips the invert flag (and back)", () => {
    // initial is invert: false
    const on = popupReducer(initialPopupState, { type: "toggleInvert" });
    expect(on.invert).toBe(true);
    expect(popupReducer(on, { type: "toggleInvert" }).invert).toBe(false);
  });

  it("setFavorites replaces the favorites list", () => {
    const favorites = [{ id: "a", name: "A", scheme: mockScheme }];
    const next = popupReducer(initialPopupState, {
      type: "setFavorites",
      favorites,
    });
    expect(next.favorites).toStrictEqual(favorites);
  });

  it("favoriteSaved sets favorites, opens the panel, and flags the saved id", () => {
    const favorites = [{ id: "fav-1", name: "A", scheme: mockScheme }];
    const next = popupReducer(initialPopupState, {
      type: "favoriteSaved",
      favorites,
      id: "fav-1",
    });
    expect(next.favorites).toStrictEqual(favorites);
    expect(next.showFavorites).toBe(true);
    expect(next.savedFavoriteId).toBe("fav-1");
  });

  it("clearSaveFeedback clears the saved-favorite flag", () => {
    const flagged: PopupState = { ...initialPopupState, savedFavoriteId: "x" };
    expect(
      popupReducer(flagged, { type: "clearSaveFeedback" }).savedFavoriteId,
    ).toBeNull();
  });

  it("applyFavorite sets current + applied without touching history", () => {
    const state: PopupState = {
      ...initialPopupState,
      history: [mockScheme2],
    };
    const next = popupReducer(state, {
      type: "applyFavorite",
      scheme: mockScheme,
    });
    expect(next.current).toStrictEqual(mockScheme);
    expect(next.applied).toBe(true);
    expect(next.error).toBeNull();
    // history is untouched (favorites don't push history)
    expect(next.history).toStrictEqual([mockScheme2]);
  });

  it("applyFavorite syncs intensity to the favorite's saved value (so Save sees it as saved)", () => {
    const fav = {
      ...mockScheme,
      schemeDetails: { ...mockScheme.schemeDetails, intensity: 35 },
    };
    const next = popupReducer(
      { ...initialPopupState, intensity: 90 },
      { type: "applyFavorite", scheme: fav },
    );
    expect(next.intensity).toBe(35);
  });

  it("does not mutate the input state", () => {
    const before = { ...initialPopupState };
    popupReducer(initialPopupState, { type: "selectMode", mode: "triad" });
    expect(initialPopupState).toStrictEqual(before);
  });
});

describe("popup selectors / helpers", () => {
  it("historyLabel renders index + name + mode", () => {
    expect(historyLabel(mockScheme, 0)).toBe(
      "1. Brandy Rose (analogic-complement)",
    );
  });

  it("schemeDetailRows groups labels by color", () => {
    const rows = schemeDetailRows(mockScheme);
    // the `primary` label carries the seed-derived color
    const primaryRow = rows.find((r) => r.color === "#6F928B");
    expect(primaryRow?.tags.split(",").sort()).toStrictEqual(["primary"]);
    // one row per distinct color in `colors`, never the metadata
    expect(rows.some((r) => r.tags.includes("schemeDetails"))).toBe(false);
  });

  it("currentSchemeDetails returns details or null", () => {
    expect(currentSchemeDetails(initialPopupState)).toBeNull();
    expect(
      currentSchemeDetails({ ...initialPopupState, current: mockScheme }),
    ).toStrictEqual(mockScheme.schemeDetails);
  });

  it("defaultFavoriteName uses the color name + mode", () => {
    expect(defaultFavoriteName(mockScheme)).toBe(
      "Brandy Rose (analogic-complement)",
    );
  });
});

describe("modesForSelection / resolveMode", () => {
  it("random yields all modes", () => {
    expect(modesForSelection("random")).toStrictEqual(modes);
  });
  it("a specific mode yields just that mode", () => {
    expect(modesForSelection("triad")).toStrictEqual(["triad"]);
  });
  it("resolveMode keeps a specific mode and picks one for random", () => {
    expect(resolveMode("triad")).toBe("triad");
    expect(modes).toContain(resolveMode("random"));
  });
});

describe("engine-bridge palette glue", () => {
  it("schemeFromPalette builds a display scheme carrying the palette + intensity", () => {
    const scheme = schemeFromPalette(mockPalette, 80, "Sea Green");
    expect(scheme.schemeDetails.palette).toStrictEqual(mockPalette);
    expect(scheme.schemeDetails.intensity).toBe(80);
    expect(scheme.schemeDetails.rootColor).toBe(mockPalette.seed);
    expect(scheme.schemeDetails.colorMode).toBe(mockPalette.mode);
    expect(scheme.schemeDetails.rootColorName).toBe("Sea Green");
    // SOURCE-OF-TRUTH theme colors surfaced in the role-labeled `colors` map for
    // the display renderers (so a swatch == a painted color, labeled by role).
    expect(scheme.colors.primary).toBe(mockPalette.roles.primary);
    expect(scheme.colors.primary).toBe(mockPalette.seed); // primary = the root color
    expect(scheme.colors.heading).toBe(mockPalette.roles.heading);
  });

  it("applyPayloadForScheme uses the stored palette when present", () => {
    const scheme = schemeFromPalette(mockPalette, 30);
    const { palette, options } = applyPayloadForScheme(scheme, 80);
    expect(palette).toStrictEqual(mockPalette);
    // the CURRENT intensity overrides the stored one
    expect(options.intensity).toBe(80);
  });

  it("applyPayloadForScheme regenerates locally for legacy schemes (no palette)", () => {
    // mockScheme predates Phase 2: schemeDetails has no palette.
    const { palette } = applyPayloadForScheme(mockScheme, 50);
    expect(palette.seed).toBe("#b98790"); // normalized from rootColor
    expect(palette.mode).toBe(mockScheme.schemeDetails.colorMode);
    expect(palette.surfaces.length).toBeGreaterThanOrEqual(3);
  });
});

describe("resolveSeed (chosen seed vs random fallback)", () => {
  it("honors a valid chosen seed, normalized to #rrggbb", () => {
    expect(resolveSeed("#abc")).toBe("#aabbcc");
    expect(resolveSeed("FF8800")).toBe("#ff8800");
    expect(resolveSeed("#1A2B3C")).toBe("#1a2b3c");
  });

  it("falls back to a random #rrggbb when no seed is given", () => {
    expect(resolveSeed()).toMatch(/^#[0-9a-f]{6}$/);
    expect(resolveSeed(undefined)).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("falls back to random for an unparseable seed (never throws)", () => {
    expect(resolveSeed("nope")).toMatch(/^#[0-9a-f]{6}$/);
    expect(resolveSeed("#12")).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("generateForSelection — seed resolution into generation", () => {
  it("uses the CHOSEN seed for the generated palette (deterministic)", async () => {
    const result = await generateForSelection({
      selection: "triad",
      intensity: 80,
      online: false,
      seed: "#6f928b",
    });
    // local generation is pure: the palette seed is exactly the chosen color.
    expect(result.palette.seed).toBe("#6f928b");
    expect(result.scheme.schemeDetails.rootColor).toBe("#6f928b");
    // names derive from the seed, so a chosen seed yields a real name.
    expect(result.scheme.schemeDetails.rootColorName).toBeTruthy();
  });

  it("falls back to a random seed when none is supplied (today's behavior)", async () => {
    const a = await generateForSelection({
      selection: "triad",
      intensity: 80,
      online: false,
    });
    const b = await generateForSelection({
      selection: "triad",
      intensity: 80,
      online: false,
    });
    // two random draws → valid hex seeds, overwhelmingly distinct.
    expect(a.palette.seed).toMatch(/^#[0-9a-f]{6}$/);
    expect(b.palette.seed).toMatch(/^#[0-9a-f]{6}$/);
    expect(a.palette.seed).not.toBe("#6f928b");
  });

  it("falls back to random for an invalid chosen seed", async () => {
    const result = await generateForSelection({
      selection: "triad",
      intensity: 80,
      online: false,
      seed: "not-a-color",
    });
    expect(result.palette.seed).toMatch(/^#[0-9a-f]{6}$/);
  });
});
