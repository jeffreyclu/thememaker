/**
 * Palette subsystem: generation (local HSL harmony), the online source
 * (thecolorapi.com, cached, with local fallback), light↔dark inversion, and the
 * random seed/mode helpers — composed from the modules below and exposed as the
 * `paletteGenerator` singleton.
 *
 * A `Palette` is a plain serializable DTO: it crosses the popup→engine
 * `chrome.tabs.sendMessage` boundary and is persisted to `chrome.storage`, so it
 * is never a class instance (structured clone would strip methods).
 */
import {
  generatePalette,
  invertPalette,
  type Palette,
} from "./palette-generate";
import {
  apiPalette,
  apiSchemeUrl,
  localPalette,
  paletteCacheKey,
  paletteFromApiResponse,
  type PaletteCacheStore,
  type PaletteSourceDeps,
} from "./palette-source";
import { randomHexColor, randomMode } from "./random";
import type { PaletteRoles } from "./palette-roles";
import type { ThemeColor } from "./palette-swatches";
import type { modes } from "../../config";
import type { ColorMode } from "../../types";

export type {
  Palette,
  PaletteRoles,
  ThemeColor,
  PaletteCacheStore,
  PaletteSourceDeps,
};

// The composable primitives the class delegates to, kept available for the
// lower-level source/generation unit tests that exercise each directly.
export {
  generatePalette,
  invertPalette,
  apiPalette,
  apiSchemeUrl,
  localPalette,
  paletteCacheKey,
  paletteFromApiResponse,
};

/** Generates and transforms palettes; each method returns a plain `Palette` DTO. */
export class PaletteGenerator {
  /**
   * Generates a `Palette` from a seed color + mode using local HSL harmony.
   * Pure and deterministic: same inputs → byte-identical palette.
   */
  generate(seed: string, mode: ColorMode): Palette {
    return generatePalette(seed, mode);
  }

  /** Resolves a palette from the local source. Pure, synchronous, never fails. */
  local(seed: string, mode: ColorMode): Palette {
    return localPalette(seed, mode);
  }

  /**
   * Resolves a palette from the API source (thecolorapi.com) with caching,
   * falling back to local generation on any failure. Always resolves.
   */
  api(
    seed: string,
    mode: ColorMode,
    deps?: PaletteSourceDeps,
  ): Promise<Palette> {
    return apiPalette(seed, mode, deps);
  }

  /**
   * Parses an API `/scheme` response into a `Palette`, or `null` when the
   * payload is malformed (the caller falls back to local generation).
   */
  fromApiResponse(
    seed: string,
    mode: ColorMode,
    data: Parameters<typeof paletteFromApiResponse>[2],
  ): Palette | null {
    return paletteFromApiResponse(seed, mode, data);
  }

  /** Returns a new palette with every color's lightness flipped (light↔dark). */
  invert(palette: Palette): Palette {
    return invertPalette(palette);
  }

  /** Builds the thecolorapi.com `/scheme` URL for a seed + mode. */
  apiUrl(seed: string, mode: ColorMode, count = 6): string {
    return apiSchemeUrl(seed, mode, count);
  }

  /** Cache key for a (seed, mode) pair. */
  cacheKey(seed: string, mode: ColorMode): string {
    return paletteCacheKey(seed, mode);
  }

  /** A random `#rrggbb` seed color (the "Generate" seed). */
  randomSeed(): string {
    return randomHexColor();
  }

  /** A random color mode from the supplied list (defaults to all modes). */
  randomMode(availableModes?: typeof modes): ColorMode {
    return randomMode(availableModes);
  }
}

/** The shared palette generator. */
export const paletteGenerator = new PaletteGenerator();
