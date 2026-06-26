/**
 * Flash-elimination: the synchronous `localStorage` base-color cache.
 *
 * Covers:
 *  - `baseBackgroundFor` matches the EXACT html/body base the engine paints
 *    (for the common default-white body), so the early paint == the final paint.
 *  - `readBaseCache` / `writeBaseCache` / `clearBaseCache` round-trip, plus the
 *    silent fallback when `localStorage` is unavailable / throws.
 *  - the engine apply path WRITES the cache; the reset path CLEARS it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Engine } from "../src/lib/engine";
import {
  BASE_CACHE_KEY,
  baseBackgroundFor,
  clearBaseCache,
  readBaseCache,
  writeBaseCache,
} from "../src/lib/storage/base-cache";
import { STYLE_ELEMENT_ID } from "../src/lib/engine/theme-dom-constants";
import { generatePalette } from "../src/lib/palette";
import type { ApplyOptions } from "../src/types";

const htmlBaseFromCss = (): string | undefined => {
  const css = document.getElementById(STYLE_ELEMENT_ID)?.textContent ?? "";
  const htmlRule = /html \{([^}]*)\}/.exec(css)?.[1] ?? "";
  return /background-color:\s*(#[0-9a-f]{6})/i
    .exec(htmlRule)?.[1]
    ?.toLowerCase();
};

describe("baseBackgroundFor (matches the engine's painted base)", () => {
  let engine: Engine;

  beforeEach(() => {
    engine = new Engine();
  });

  afterEach(() => {
    engine.reset();
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    window.localStorage.clear();
  });

  it.each([
    ["#3a7bd5", "triad", 80],
    ["#aa3333", "complement", 50],
    ["#22aa88", "monochrome-dark", 100],
    ["#888888", "quad", 10],
  ] as Array<[string, string, number]>)(
    "equals the engine html base for %s/%s @ intensity %d (default-white body)",
    (seed, mode, intensity) => {
      const palette = generatePalette(seed, mode);
      const options: ApplyOptions = { intensity };
      // A body with no explicit background → engine treats the original as white,
      // exactly what `baseBackgroundFor` assumes.
      document.body.innerHTML = "<p>content</p>";
      engine.apply(palette, options);
      expect(htmlBaseFromCss()).toBe(
        baseBackgroundFor(palette, options).toLowerCase(),
      );
    },
  );

  it("is deterministic and a valid hex", () => {
    const palette = generatePalette("#3a7bd5", "triad");
    const a = baseBackgroundFor(palette, { intensity: 60 });
    const b = baseBackgroundFor(palette, { intensity: 60 });
    expect(a).toBe(b);
    expect(a).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe("base cache helpers (read/write/clear)", () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("round-trips a hex through the namespaced key", () => {
    expect(readBaseCache()).toBeNull();
    writeBaseCache("#123456");
    expect(window.localStorage.getItem(BASE_CACHE_KEY)).toBe("#123456");
    expect(readBaseCache()).toBe("#123456");
  });

  it("clear removes the cached value", () => {
    writeBaseCache("#abcdef");
    clearBaseCache();
    expect(readBaseCache()).toBeNull();
    expect(window.localStorage.getItem(BASE_CACHE_KEY)).toBeNull();
  });

  it("readBaseCache returns null (no throw) when localStorage.getItem throws", () => {
    vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
      throw new Error("SecurityError: localStorage blocked");
    });
    expect(readBaseCache()).toBeNull();
  });

  it("writeBaseCache swallows errors when localStorage.setItem throws", () => {
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() => writeBaseCache("#000000")).not.toThrow();
  });

  it("clearBaseCache swallows errors when removeItem throws", () => {
    vi.spyOn(window.localStorage, "removeItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => clearBaseCache()).not.toThrow();
  });
});

describe("engine writes the base cache; reset clears it", () => {
  let engine: Engine;

  beforeEach(() => {
    engine = new Engine();
  });

  afterEach(() => {
    engine.reset();
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    window.localStorage.clear();
  });

  it("apply caches the EXACT base it painted", () => {
    const palette = generatePalette("#3a7bd5", "triad");
    document.body.innerHTML = "<p>x</p>";
    engine.apply(palette, { intensity: 80 });
    const painted = htmlBaseFromCss();
    expect(painted).toBeTruthy();
    // The cache holds exactly what the engine painted onto html/body.
    expect(readBaseCache()?.toLowerCase()).toBe(painted);
  });

  it("reset clears the cache so a disabled site won't early-paint", () => {
    const palette = generatePalette("#3a7bd5", "triad");
    document.body.innerHTML = "<p>x</p>";
    engine.apply(palette, { intensity: 80 });
    expect(readBaseCache()).not.toBeNull();
    engine.reset();
    expect(readBaseCache()).toBeNull();
  });
});
