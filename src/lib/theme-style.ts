/**
 * The Thememaker `<style>` element MANAGEMENT — apply / remove / query the theme.
 *
 * These own the page's single `<style id="themeMaker">` (and the sibling override
 * layer + root marker) WITHOUT running the engine: the popup's RESET path and the
 * content-script query path call these directly. The engine (`engine.ts`) writes
 * the main style in place during an apply; this module creates/removes it and
 * tears down the engine's window state + base cache on reset.
 */
import { engineWindow, teardownEngineState } from "./engine-state";
import { clearBaseCache } from "./base-cache";
import {
  OVERRIDE_STYLE_ID,
  ROOT_MARKER_ATTR,
  STYLE_ELEMENT_ID,
} from "./theme-dom-constants";

// Re-exported so existing consumers keep importing the id from here too.
export { STYLE_ELEMENT_ID };

/**
 * Writes `css` into the Thememaker `<style>`, creating it only if missing (never
 * remove-then-append, so there is no themeless gap / flash on re-apply).
 *
 * @returns `true` once applied.
 */
export function applySchemeStyle(css: string): boolean {
  const head = document.querySelector("head") || document.documentElement;
  let style = document.getElementById(
    STYLE_ELEMENT_ID,
  ) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ELEMENT_ID;
    head.appendChild(style);
  }
  style.textContent = css;
  return true;
}

/**
 * Removes the Thememaker `<style>` if present, and tears down any active
 * MutationObserver / engine state, the override layer, the root marker, and the
 * base-color cache (so a reset/disabled site does NOT early-paint stale next load).
 *
 * @returns `true` if a style element was removed, otherwise `false`.
 */
export function removeSchemeStyle(): boolean {
  teardownEngineState(engineWindow());
  // Clear the cached base background so a reset/disabled site does NOT early-paint
  // a stale theme on its next load. Best-effort.
  clearBaseCache();
  // Drop the per-tag override layer too.
  document.getElementById(OVERRIDE_STYLE_ID)?.remove();
  // Remove the ROOT MARKER from <html> so no stale role-text rules could match.
  document.documentElement.removeAttribute(ROOT_MARKER_ATTR);
  const old = document.getElementById(STYLE_ELEMENT_ID);
  if (old) {
    old.remove();
    return true;
  }
  return false;
}

/** Reports whether a Thememaker style is currently applied on the page. */
export function isSchemeApplied(): boolean {
  return document.getElementById(STYLE_ELEMENT_ID) !== null;
}
