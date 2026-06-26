/**
 * Flash elimination: the early-paint DOM primitives + the synchronous base cache.
 *
 * `chrome.storage` is async, so at `document_start` the content script can't know
 * the theme before the browser paints the site's original background. The fix:
 * cache the base background the engine painted (in the page's own `localStorage`,
 * synchronous + same-origin), then at the top of `document_start` read it and
 * synchronously tint `<html>` with a stand-in `<style>` before any async read — so
 * the very first frame is already the themed base. The full `apply()` later
 * overwrites the html/body rule with the precise (body-aware) base, and
 * `clearEarlyBaseStyle` drops the stand-in.
 *
 * Pure DOM + `localStorage`, no `chrome.*`.
 */
import { EARLY_STYLE_ID } from "./owned-attributes";
import { ensureStyleEl } from "./style-element";
import { isHexColor, normalizeHex } from "../../color";
import type { Palette } from "../../palette";
import type { ApplyOptions } from "../../../types";

/** The page `localStorage` key for this origin's cached base background. */
export const BASE_CACHE_KEY = "__thememaker_base__";

/**
 * Paints a base background `hex` onto `<html>` immediately (a stand-in `<style>`),
 * before the body exists, to remove the reload flash.
 */
export const paintEarlyBaseStyle = (hex: string): void => {
  ensureStyleEl(EARLY_STYLE_ID).textContent =
    `html { background-color: ${hex} !important; }`;
};

/** Removes the early-base stand-in `<style>` once the full engine has painted. */
export const clearEarlyBaseStyle = (): void => {
  document.getElementById(EARLY_STYLE_ID)?.remove();
};

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
 * `localStorage`. Returns `null` when absent or when `localStorage` is unavailable
 * / throws (private-mode, blocked, etc.).
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
    // localStorage unavailable / quota / blocked — the early paint just won't have
    // a cache next load; not fatal.
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
