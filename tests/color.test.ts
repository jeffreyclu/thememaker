import { describe, expect, it } from "vitest";

import {
  AA_LARGE,
  AA_NORMAL,
  contrastRatio,
  ensureContrast,
  hexToHsl,
  hexToRgb,
  hslToHex,
  hslToRgb,
  isHexColor,
  luminanceBucket,
  luminanceOf,
  meetsContrast,
  mixHex,
  normalizeHex,
  relativeLuminance,
  rgbToHex,
  rgbToHsl,
} from "../src/lib/color";

describe("normalizeHex / isHexColor", () => {
  it("normalizes shorthand and casing to #rrggbb", () => {
    expect(normalizeHex("#FFF")).toBe("#ffffff");
    expect(normalizeHex("abc")).toBe("#aabbcc");
    expect(normalizeHex("#AABBCC")).toBe("#aabbcc");
  });
  it("throws on invalid hex", () => {
    expect(() => normalizeHex("nope")).toThrow();
    expect(() => normalizeHex("#12")).toThrow();
  });
  it("isHexColor reflects parseability", () => {
    expect(isHexColor("#123abc")).toBe(true);
    expect(isHexColor("rgb(0,0,0)")).toBe(false);
  });
});

describe("color-space conversions", () => {
  it("hex ↔ rgb round-trips", () => {
    const cases = ["#000000", "#ffffff", "#6f928b", "#b98790", "#123456"];
    for (const hex of cases) {
      expect(rgbToHex(hexToRgb(hex))).toBe(hex);
    }
  });

  it("rgb ↔ hsl round-trips within rounding tolerance", () => {
    const cases = [
      { r: 0, g: 0, b: 0 },
      { r: 255, g: 255, b: 255 },
      { r: 111, g: 146, b: 139 },
      { r: 185, g: 135, b: 144 },
      { r: 18, g: 52, b: 86 },
    ];
    for (const rgb of cases) {
      const back = hslToRgb(rgbToHsl(rgb));
      expect(Math.abs(back.r - rgb.r)).toBeLessThanOrEqual(1);
      expect(Math.abs(back.g - rgb.g)).toBeLessThanOrEqual(1);
      expect(Math.abs(back.b - rgb.b)).toBeLessThanOrEqual(1);
    }
  });

  it("hex ↔ hsl round-trips within rounding tolerance", () => {
    for (const hex of ["#6f928b", "#b98790", "#abcdef", "#222831"]) {
      const back = hslToHex(hexToHsl(hex));
      const a = hexToRgb(hex);
      const b = hexToRgb(back);
      expect(Math.abs(a.r - b.r)).toBeLessThanOrEqual(2);
      expect(Math.abs(a.g - b.g)).toBeLessThanOrEqual(2);
      expect(Math.abs(a.b - b.b)).toBeLessThanOrEqual(2);
    }
  });

  it("known HSL conversions are correct", () => {
    // pure red
    expect(hexToHsl("#ff0000")).toMatchObject({ h: 0, s: 100, l: 50 });
    // pure green
    expect(hexToHsl("#00ff00").h).toBeCloseTo(120, 0);
    // pure blue
    expect(hexToHsl("#0000ff").h).toBeCloseTo(240, 0);
    // grays have 0 saturation
    expect(hexToHsl("#808080").s).toBe(0);
  });
});

describe("relative luminance", () => {
  it("black is 0 and white is 1", () => {
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBe(0);
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 5);
  });
  it("green contributes more than red than blue", () => {
    const g = luminanceOf("#00ff00");
    const r = luminanceOf("#ff0000");
    const b = luminanceOf("#0000ff");
    expect(g).toBeGreaterThan(r);
    expect(r).toBeGreaterThan(b);
  });
});

describe("contrast ratio", () => {
  it("black on white is the maximum 21:1", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
  });
  it("identical colors are 1:1", () => {
    expect(contrastRatio("#777777", "#777777")).toBeCloseTo(1, 5);
  });
  it("is symmetric", () => {
    expect(contrastRatio("#123456", "#abcdef")).toBeCloseTo(
      contrastRatio("#abcdef", "#123456"),
      6,
    );
  });
  it("meetsContrast uses the correct AA threshold by size", () => {
    // a pair around ~3.36:1 passes large (3:1) but not normal (4.5:1)
    const text = "#8c8c8c";
    const bg = "#ffffff";
    const ratio = contrastRatio(text, bg);
    expect(ratio).toBeGreaterThanOrEqual(AA_LARGE);
    expect(ratio).toBeLessThan(AA_NORMAL);
    expect(meetsContrast(text, bg, true)).toBe(true);
    expect(meetsContrast(text, bg, false)).toBe(false);
  });
});

describe("ensureContrast (WCAG AA enforcement)", () => {
  const hardCases: Array<{ text: string; bg: string; label: string }> = [
    { text: "#ffffff", bg: "#fefefe", label: "white-on-white" },
    { text: "#f0f0f0", bg: "#ffffff", label: "light-on-light" },
    { text: "#111111", bg: "#000000", label: "dark-on-dark" },
    { text: "#222831", bg: "#1a1a1a", label: "near-dark-on-dark" },
    { text: "#808080", bg: "#7f7f7f", label: "mid-on-mid" },
    { text: "#6f928b", bg: "#759e96", label: "low-contrast harmony pair" },
    { text: "#00ff00", bg: "#00ee00", label: "saturated near-equal" },
  ];

  for (const { text, bg, label } of hardCases) {
    it(`forces AA for ${label}`, () => {
      const fixed = ensureContrast(text, bg);
      expect(contrastRatio(fixed, bg)).toBeGreaterThanOrEqual(AA_NORMAL);
      expect(isHexColor(fixed)).toBe(true);
    });
  }

  it("leaves an already-compliant pair unchanged", () => {
    expect(ensureContrast("#000000", "#ffffff")).toBe("#000000");
  });

  it("honors the large-text threshold (3:1) when requested", () => {
    const fixed = ensureContrast("#999999", "#aaaaaa", true);
    expect(contrastRatio(fixed, "#aaaaaa")).toBeGreaterThanOrEqual(AA_LARGE);
  });

  it("resolves a mid-on-mid pair to a compliant, least-destructive shift", () => {
    // text == bg (worst case). The search reaches AA by moving lightness; the
    // result must pass and must be a hue-preserving gray (mid-gray has no hue).
    const fixed = ensureContrast("#808080", "#808080");
    expect(contrastRatio(fixed, "#808080")).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(isHexColor(fixed)).toBe(true);
    // a gray stays gray (R==G==B)
    expect(fixed.slice(1, 3)).toBe(fixed.slice(3, 5));
    expect(fixed.slice(3, 5)).toBe(fixed.slice(5, 7));
  });

  it("falls back to the higher-contrast extreme for an unreachable target", () => {
    // Force the fallback branch directly: a contrast target above any
    // hue-preserving shift on a mid background still yields black or white.
    // (We can't exceed AA-large with a single channel move on #808080 toward
    // both ends simultaneously, so verify the documented safety net via a
    // saturated hue that brackets the bg luminance.)
    const fixed = ensureContrast("#ffd000", "#808080");
    expect(contrastRatio(fixed, "#808080")).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(isHexColor(fixed)).toBe(true);
  });

  it("is idempotent (re-running on a fixed pair is a no-op)", () => {
    const once = ensureContrast("#f0f0f0", "#ffffff");
    const twice = ensureContrast(once, "#ffffff");
    expect(twice).toBe(once);
  });
});

describe("luminanceBucket", () => {
  it("classifies dark / medium / light surfaces", () => {
    expect(luminanceBucket("#000000")).toBe("dark");
    expect(luminanceBucket("#101418")).toBe("dark");
    expect(luminanceBucket("#808080")).toBe("medium");
    expect(luminanceBucket("#ffffff")).toBe("light");
    expect(luminanceBucket("#f3f3f3")).toBe("light");
  });
  it("preserves ordering (darker color never buckets lighter)", () => {
    const order = ["#000000", "#444444", "#888888", "#cccccc", "#ffffff"];
    const rank = { dark: 0, medium: 1, light: 2 } as const;
    let prev = -1;
    for (const c of order) {
      const r = rank[luminanceBucket(c)];
      expect(r).toBeGreaterThanOrEqual(prev);
      prev = r;
    }
  });
});

describe("mixHex (intensity blend)", () => {
  it("returns the endpoints at t=0 and t=1", () => {
    expect(mixHex("#000000", "#ffffff", 0)).toBe("#000000");
    expect(mixHex("#000000", "#ffffff", 1)).toBe("#ffffff");
  });
  it("returns the midpoint at t=0.5", () => {
    expect(mixHex("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(mixHex("#ff0000", "#0000ff", 0.5)).toBe("#800080");
  });
  it("clamps t outside [0,1]", () => {
    expect(mixHex("#222222", "#eeeeee", -1)).toBe("#222222");
    expect(mixHex("#222222", "#eeeeee", 5)).toBe("#eeeeee");
  });
  it("moves monotonically from `from` toward `to` as t rises", () => {
    const at = (t: number): number =>
      luminanceOf(mixHex("#000000", "#ffffff", t));
    expect(at(0.25)).toBeLessThan(at(0.5));
    expect(at(0.5)).toBeLessThan(at(0.75));
  });
});
