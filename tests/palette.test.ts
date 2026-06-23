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

    it("monochrome → ONE dominant swatch (the root color), one hue", () => {
      // SOURCE OF TRUTH: a monochrome theme is a single color. The swatch list
      // folds to the one dominant color (the seed/primary); the page still has
      // hierarchy via lightness in the role set, but the SWATCH count is honest.
      const p = generatePalette(SEED, "monochrome");
      expect(p.swatches).toHaveLength(1);
      expect(p.swatches[0]).toBe(p.roles.primary);
      // The full role set still spans lightness (theme isn't flat): bg ≠ ink.
      expect(hexToHsl(p.roles.bg).l).toBeGreaterThan(
        hexToHsl(p.roles.textPrimary).l,
      );
      // and every role keeps the seed hue (within rounding).
      const seedHue = hexToHsl(SEED).h;
      for (const c of [p.roles.heading, p.roles.link, p.roles.accent]) {
        expect(hueDist(hexToHsl(c).h, seedHue)).toBeLessThan(8);
      }
    });

    it("monochrome-dark biases the page surface darker than monochrome-light", () => {
      // The primary swatch is the seed verbatim (same for both); the polarity
      // bias now lives in the SURFACE roles, so compare those.
      const dark = generatePalette(SEED, "monochrome-dark");
      const light = generatePalette(SEED, "monochrome-light");
      expect(luminanceOf(dark.roles.bg)).toBeLessThan(
        luminanceOf(light.roles.bg),
      );
    });
  });

  describe("semantic roles (the anti-monochrome layer)", () => {
    it("derives a full, valid role set for every mode", () => {
      const keys = [
        "bg",
        "surface",
        "surfaceAlt",
        "textPrimary",
        "textSecondary",
        "heading",
        "link",
        "primary",
        "onPrimary",
        "secondary",
        "onSecondary",
        "border",
        "accent",
      ] as const;
      for (const mode of modes) {
        const { roles } = generatePalette(SEED, mode);
        for (const k of keys) {
          expect(isHexColor(roles[k])).toBe(true);
        }
      }
    });

    it("multi-hue modes pull DIFFERENT hues for heading vs link vs primary", () => {
      // The whole point of the fix: distinct roles get distinct HUES on modes
      // that provide more than one. Old behavior reused one seed → grayscale.
      for (const mode of ["triad", "quad", "analogic-complement"]) {
        const { roles } = generatePalette(SEED, mode);
        const hH = hexToHsl(roles.heading).h;
        const lH = hexToHsl(roles.link).h;
        const pH = hexToHsl(roles.primary).h;
        // heading, link, primary are mutually hue-separated (≥20° apart).
        expect(hueDist(hH, lH)).toBeGreaterThan(20);
        expect(hueDist(lH, pH)).toBeGreaterThan(20);
        expect(hueDist(hH, pH)).toBeGreaterThan(20);
      }
    });

    it("primary is the ROOT color verbatim (the user's pick drives the page)", () => {
      for (const mode of modes) {
        const p = generatePalette(SEED, mode);
        // The seed the user chose IS the primary role + the leading swatch.
        expect(p.roles.primary).toBe(p.seed);
        expect(p.swatches[0]).toBe(p.seed);
      }
    });

    it("swatch COUNT is honest to the harmony (no padded duplicates)", () => {
      // The user's complaint: a 2-color complement showed 6 swatches w/ dupes.
      // The SOT swatch list folds to the mode's real distinct-color count.
      const counts: Record<string, number> = {
        monochrome: 1,
        "monochrome-dark": 1,
        "monochrome-light": 1,
        complement: 2,
        triad: 3,
        quad: 4,
        "analogic-complement": 4,
      };
      for (const mode of modes) {
        const p = generatePalette(SEED, mode);
        expect(p.swatches.length).toBe(counts[mode]);
        // no duplicate swatches
        expect(new Set(p.swatches).size).toBe(p.swatches.length);
      }
    });

    it("monochrome differentiates roles by LIGHTNESS steps (one hue)", () => {
      const { roles } = generatePalette(SEED, "monochrome");
      const seedHue = hexToHsl(SEED).h;
      // All accent roles share (near) the seed hue...
      for (const c of [roles.heading, roles.link, roles.accent]) {
        expect(hueDist(hexToHsl(c).h, seedHue)).toBeLessThan(12);
      }
      // ...but are separated by distinct lightness steps so hierarchy reads.
      const ls = [roles.heading, roles.link, roles.accent].map(
        (c) => hexToHsl(c).l,
      );
      expect(new Set(ls.map((l) => l.toFixed(1))).size).toBe(3);
      // heading is the darkest (strongest) accent step.
      expect(ls[0]).toBeLessThan(ls[1]);
      expect(ls[1]).toBeLessThan(ls[2]);
    });

    it("backgrounds are mostly-neutral tints; accents carry real saturation", () => {
      const { roles } = generatePalette(SEED, "triad");
      // page/surface are low-saturation "paper".
      expect(hexToHsl(roles.bg).s).toBeLessThan(25);
      expect(hexToHsl(roles.surface).s).toBeLessThan(25);
      // links/headings/primary are saturated "colorful but readable".
      expect(hexToHsl(roles.link).s).toBeGreaterThan(35);
      expect(hexToHsl(roles.heading).s).toBeGreaterThan(35);
      expect(hexToHsl(roles.primary).s).toBeGreaterThan(35);
    });

    it("primary and secondary button fills are visibly distinct", () => {
      for (const mode of modes) {
        const { roles } = generatePalette(SEED, mode);
        expect(roles.primary.toLowerCase()).not.toBe(
          roles.secondary.toLowerCase(),
        );
      }
    });

    it("monochrome-dark biases backgrounds dark, monochrome-light light", () => {
      const dark = generatePalette(SEED, "monochrome-dark").roles;
      const light = generatePalette(SEED, "monochrome-light").roles;
      expect(luminanceOf(dark.bg)).toBeLessThan(luminanceOf(light.bg));
    });
  });
});
