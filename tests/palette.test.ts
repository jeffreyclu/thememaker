import { describe, expect, it } from "vitest";

import { generatePalette } from "../src/lib/palette";
import { hexToHsl, isHexColor, luminanceOf } from "../src/lib/color";
import { modes } from "../src/config";

const SEED = "#3a7bd5";

/** Circular hue distance in [0, 180]. */
const hueDist = (a: number, b: number): number => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

describe("generatePalette", () => {
  it("returns valid hex for every channel, for every mode", () => {
    for (const mode of modes) {
      const p = generatePalette(SEED, mode);
      const all = [p.seed, ...p.swatches, ...p.surfaces, ...p.accents];
      for (const hex of all) {
        expect(isHexColor(hex)).toBe(true);
      }
    }
  });

  it("is pure / deterministic (same input → same palette)", () => {
    expect(generatePalette(SEED, "triad")).toStrictEqual(
      generatePalette(SEED, "triad"),
    );
  });

  it("normalizes the seed and accepts shorthand hex", () => {
    expect(generatePalette("#39f", "triad").seed).toBe("#3399ff");
  });

  it("always provides a dark→light surface ramp (≥3 distinct buckets)", () => {
    for (const mode of modes) {
      const p = generatePalette(SEED, mode);
      expect(p.surfaces.length).toBeGreaterThanOrEqual(3);
      // ascending luminance
      const lums = p.surfaces.map(luminanceOf);
      for (let i = 1; i < lums.length; i += 1) {
        expect(lums[i]).toBeGreaterThanOrEqual(lums[i - 1]);
      }
      // spans dark to light
      expect(lums[0]).toBeLessThan(0.25);
      expect(lums[lums.length - 1]).toBeGreaterThan(0.6);
    }
  });

  describe("harmony relationships (swatch counts + hue offsets)", () => {
    it("complement → 2 swatches roughly 180° apart", () => {
      const p = generatePalette(SEED, "complement");
      expect(p.swatches).toHaveLength(2);
      const h0 = hexToHsl(p.swatches[0]).h;
      const h1 = hexToHsl(p.swatches[1]).h;
      expect(hueDist(h0, h1)).toBeGreaterThan(150);
    });

    it("triad → 3 swatches ~120° apart", () => {
      const p = generatePalette(SEED, "triad");
      expect(p.swatches).toHaveLength(3);
      const h = p.swatches.map((s) => hexToHsl(s).h);
      expect(hueDist(h[0], h[1])).toBeGreaterThan(90);
      expect(hueDist(h[0], h[2])).toBeGreaterThan(90);
    });

    it("quad → 4 swatches spanning the wheel", () => {
      const p = generatePalette(SEED, "quad");
      expect(p.swatches).toHaveLength(4);
      const h = p.swatches.map((s) => hexToHsl(s).h);
      // first vs third are complementary (~180°)
      expect(hueDist(h[0], h[2])).toBeGreaterThan(150);
    });

    it("analogic-complement → 4 swatches incl. a complement", () => {
      const p = generatePalette(SEED, "analogic-complement");
      expect(p.swatches).toHaveLength(4);
      const h = p.swatches.map((s) => hexToHsl(s).h);
      // the last is the complement of the seed (~180°)
      expect(hueDist(h[0], h[3])).toBeGreaterThan(150);
      // the analogic neighbors are within ~40°
      expect(hueDist(h[0], h[1])).toBeLessThan(45);
      expect(hueDist(h[0], h[2])).toBeLessThan(45);
    });

    it("monochrome → a single hue spread across lightness", () => {
      const p = generatePalette(SEED, "monochrome");
      expect(p.swatches.length).toBeGreaterThanOrEqual(3);
      const seedHue = hexToHsl(SEED).h;
      const lums = p.swatches.map(luminanceOf);
      for (const s of p.swatches) {
        // hue preserved (within rounding) for all mono swatches
        expect(hueDist(hexToHsl(s).h, seedHue)).toBeLessThan(8);
      }
      // distinct lightness steps → distinct luminance
      expect(new Set(lums.map((l) => l.toFixed(3))).size).toBeGreaterThan(1);
    });

    it("monochrome-dark biases darker than monochrome-light", () => {
      const dark = generatePalette(SEED, "monochrome-dark");
      const light = generatePalette(SEED, "monochrome-light");
      const avg = (xs: number[]): number =>
        xs.reduce((a, b) => a + b, 0) / xs.length;
      expect(avg(dark.swatches.map(luminanceOf))).toBeLessThan(
        avg(light.swatches.map(luminanceOf)),
      );
    });
  });
});
