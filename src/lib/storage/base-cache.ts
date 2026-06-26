/**
 * The synchronous, same-origin base-color cache for flash elimination.
 *
 * `chrome.storage` is async, so at `document_start` we can't know the theme before
 * the browser paints the site's original background. The reload flash is avoided by
 * caching the base background the engine painted onto html/body, in the page's own
 * `localStorage` (synchronous, same-origin). At the top of `document_start`, before
 * any async read, the content script reads this and early-paints that exact hex
 * onto `<html>`, so the first frame is already themed.
 *
 * `baseBackgroundFor` is the fallback base when no per-origin cache exists yet (the
 * first themed load): for the common default-white body it equals what the engine
 * paints, so the early paint matches the final paint. No `chrome.*` here.
 */
import { isHexColor, normalizeHex } from "../color";
/**
 * Namespaced page `localStorage` key under which the engine caches the exact base
 * background it painted onto html/body for the current origin (read synchronously
 * at `document_start` to early-paint the themed base — no reload flash).
 */
const BASE_CACHE_KEY = "__thememaker_base__";
import type { Palette } from "../palette";
import type { ApplyOptions } from "../../types";

// Re-exported so existing consumers keep importing the cache key from here too.
export { BASE_CACHE_KEY };

/**
 * The themed page background (html/body base surface) a palette resolves to when
 * the page has no own body background, the common case: a default page body's
 * computed `background-color` is transparent, so the engine's base blend
 * `mix(originalBodyBg, themedBase, factor)` returns `themedBase` in full (mixing
 * from an unparseable/transparent source yields the destination). The engine paints
 * `roles.bg` directly, and this returns exactly that. Used as the fallback early
 * paint when no per-origin cache exists yet (first themed load); once the engine
 * runs it caches the resolved base, so later loads read that instead and the early
 * paint matches the final paint.
 *
 * `options` is accepted for signature stability (the base equals `roles.bg`
 * regardless of intensity for a transparent body) and to honor a `bg` override.
 */
export const baseBackgroundFor = (
  palette: Palette,
  options: ApplyOptions,
): string => {
  const surfaces = palette.surfaces ?? [];
  // A `bg` override recolors the page base, so the early paint must honor it too
  // (otherwise the first frame flashes the generated base before the engine
  // repaints with the override).
  const overrideBg = options.overrides?.bg;
  if (overrideBg && isHexColor(overrideBg)) {
    return normalizeHex(overrideBg);
  }
  return palette.roles?.bg ?? surfaces[surfaces.length - 1] ?? "#808080";
};

/**
 * Reads the cached base background hex for the current origin from the page's own
 * `localStorage` (synchronous, same-origin). Returns `null` when absent or when
 * `localStorage` is unavailable / throws (private-mode, blocked, etc.).
 */
export const readBaseCache = (): string | null => {
  try {
    return window.localStorage.getItem(BASE_CACHE_KEY);
  } catch {
    return null;
  }
};

/** Caches `hex` as this origin's base background. Silent on any failure. */
export const writeBaseCache = (hex: string): void => {
  try {
    window.localStorage.setItem(BASE_CACHE_KEY, hex);
  } catch {
    // localStorage unavailable / quota / blocked — early paint just won't have a
    // cache next load; not fatal.
  }
};

/** Clears this origin's cached base so a reset/disabled site won't early-paint. */
export const clearBaseCache = (): void => {
  try {
    window.localStorage.removeItem(BASE_CACHE_KEY);
  } catch {
    // ignore
  }
};
