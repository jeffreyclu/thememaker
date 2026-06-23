import { describe, expect, it } from "vitest";

import {
  currentSchemeDetails,
  historyLabel,
  initialPopupState,
  popupReducer,
  schemeDetailRows,
  type PopupState,
} from "../src/popup/state";
import {
  applyPayloadForScheme,
  modesForSelection,
  resolveMode,
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

  it("reset clears current and applied", () => {
    const state: PopupState = {
      ...initialPopupState,
      current: mockScheme,
      applied: true,
    };
    const next = popupReducer(state, { type: "reset" });
    expect(next.current).toBeNull();
    expect(next.applied).toBe(false);
  });

  it("toggleDetails and toggleSite flip their flags", () => {
    expect(
      popupReducer(initialPopupState, { type: "toggleDetails" }).showDetails,
    ).toBe(true);
    expect(
      popupReducer(initialPopupState, { type: "toggleSite" }).siteEnabled,
    ).toBe(true);
  });

  it("selectIntensity sets the numeric intensity", () => {
    const next = popupReducer(initialPopupState, {
      type: "selectIntensity",
      intensity: 80,
    });
    expect(next.intensity).toBe(80);
  });

  it("toggleSurprise flips the surprise flag", () => {
    const on = popupReducer(initialPopupState, { type: "toggleSurprise" });
    expect(on.surprise).toBe(true);
    expect(popupReducer(on, { type: "toggleSurprise" }).surprise).toBe(false);
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

  it("schemeDetailRows groups tags by color", () => {
    const rows = schemeDetailRows(mockScheme);
    // body+main+div share the first color
    const bodyRow = rows.find((r) => r.color === "#6F928B");
    expect(bodyRow?.tags.split(",").sort()).toStrictEqual([
      "body",
      "div",
      "main",
    ]);
    // schemeDetails is never a row
    expect(rows.some((r) => r.tags.includes("schemeDetails"))).toBe(false);
  });

  it("currentSchemeDetails returns details or null", () => {
    expect(currentSchemeDetails(initialPopupState)).toBeNull();
    expect(
      currentSchemeDetails({ ...initialPopupState, current: mockScheme }),
    ).toStrictEqual(mockScheme.schemeDetails);
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
    // swatches surfaced as pseudo-keys for the display renderers
    expect(scheme.swatch1).toBe(mockPalette.swatches[0]);
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
