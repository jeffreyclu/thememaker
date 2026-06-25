/**
 * Color source layer: turns a (seed, mode) request into a `Palette`.
 *
 * Two sources:
 *  - local (default): pure, instant, offline HSL harmony (`generatePalette`).
 *  - API ("surprise me"): `thecolorapi.com`, layered with in-memory +
 *    persistent caching and a fallback to local generation on any failure.
 *
 * Everything here is dependency-injected (fetch + a cache store), so it is fully
 * unit-testable without a network or `chrome.storage`.
 */
import { generatePalette, type Palette } from "./palette-generate";
import { isHexColor, normalizeHex } from "../color/color";
import type { ColorMode } from "../../types";

/** A minimal persistent cache the API source reads/writes (e.g. chrome.storage). */
export interface PaletteCacheStore {
  get(key: string): Promise<Palette | undefined>;
  set(key: string, value: Palette): Promise<void>;
}

/** Cache key for a (seed, mode) pair — stable + collision-free. */
export const paletteCacheKey = (seed: string, mode: ColorMode): string =>
  `palette:${normalizeHex(seed).toLowerCase()}:${mode}`;

/** The subset of thecolorapi.com `/scheme` response we consume. */
interface ColorApiScheme {
  colors?: Array<{ hex?: { value?: string } }>;
  seed?: { name?: { value?: string } };
}

/** Builds the thecolorapi.com `/scheme` URL for a seed + mode. */
export const apiSchemeUrl = (
  seed: string,
  mode: ColorMode,
  count = 6,
): string => {
  const hex = normalizeHex(seed).slice(1);
  return (
    "https://www.thecolorapi.com/scheme" +
    `?hex=${hex}&mode=${mode}&format=json&count=${count}`
  );
};

/**
 * Parses an API response into a `Palette`. Returns `null` if the payload is
 * malformed (so the caller can fall back to local generation).
 */
export const paletteFromApiResponse = (
  seed: string,
  mode: ColorMode,
  data: ColorApiScheme,
): Palette | null => {
  const raw = data.colors;
  if (!raw || raw.length === 0) {
    return null;
  }
  const hexes = raw
    .map((c) => c?.hex?.value)
    .filter((v): v is string => typeof v === "string" && isHexColor(v))
    .map((v) => normalizeHex(v));
  if (hexes.length === 0) {
    return null;
  }

  // Build the local palette from the API's first color as the seed (falling back
  // to the requested seed), so the "surprise" drives the actual painted roles.
  // `swatches`/`themeColors` are not overridden: those are the colors the engine
  // paints, so they stay derived from the roles — never the raw API harmony,
  // which the engine doesn't paint.
  return generatePalette(hexes[0] ?? seed, mode);
};

export interface PaletteSourceDeps {
  /** Injected fetch (defaults to global). */
  fetchImpl?: typeof fetch;
  /** Optional persistent cache (e.g. chrome.storage-backed). */
  cache?: PaletteCacheStore;
  /**
   * Optional in-memory (session) cache tier, injected so it is scoped to the
   * owner rather than a module global. The caller passes one long-lived `Map`
   * across requests (e.g. the popup) to get the fast in-memory tier; tests pass
   * a fresh `Map` per case for isolation. When absent, the memory tier is
   * skipped (the persistent cache + fallback still apply).
   */
  memoryCache?: Map<string, Palette>;
}

/**
 * Resolves a palette from the local source. Pure, synchronous, never fails.
 */
export const localPalette = (seed: string, mode: ColorMode): Palette =>
  generatePalette(seed, mode);

/**
 * Resolves a palette from the API source with full resilience:
 *  1. in-memory cache hit → return immediately,
 *  2. persistent cache hit → warm memory + return,
 *  3. fetch → parse → cache; on any failure (network, bad JSON, malformed
 *     payload) → fall back to local generation (and do not cache the fallback,
 *     so a later online retry can still reach the API).
 *
 * Always resolves with a valid `Palette`, never `undefined`/throws.
 */
export const apiPalette = async (
  seed: string,
  mode: ColorMode,
  deps: PaletteSourceDeps = {},
): Promise<Palette> => {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const memoryCache = deps.memoryCache;
  const key = paletteCacheKey(seed, mode);

  const cached = memoryCache?.get(key);
  if (cached) {
    return cached;
  }

  if (deps.cache) {
    try {
      const persisted = await deps.cache.get(key);
      if (persisted) {
        memoryCache?.set(key, persisted);
        return persisted;
      }
    } catch {
      // Cache read failures are non-fatal — fall through to the network.
    }
  }

  try {
    const resp = await fetchImpl(apiSchemeUrl(seed, mode));
    const data = (await resp.json()) as ColorApiScheme;
    const palette = paletteFromApiResponse(seed, mode, data);
    if (!palette) {
      throw new Error("malformed color api response");
    }
    memoryCache?.set(key, palette);
    if (deps.cache) {
      try {
        await deps.cache.set(key, palette);
      } catch {
        // Persisting is best-effort; the in-memory cache still holds.
      }
    }
    return palette;
  } catch {
    // Fallback: local generation always succeeds offline.
    return localPalette(seed, mode);
  }
};
