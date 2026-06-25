/**
 * Early-paint helpers + the body-ready engine runner.
 *
 * Flash elimination: `chrome.storage` is async, so at `document_start` we can't
 * know the theme before the browser paints the site's original background.
 * `paintEarlyBaseColor` synchronously tints `<html>` with the cached exact base
 * BEFORE any async read; the full engine later overwrites it with the precise
 * (body-aware) base and `clearEarlyBase` drops the stand-in.
 *
 * `applyWhenReady` runs the REAL `applyAdaptiveScheme` once a `document.body`
 * exists (deferring to `DOMContentLoaded` otherwise). Shared by the auto-reapply
 * flow (`index.ts`), the in-page picker (`picker-session.ts`), and the popup's
 * APPLY message handler (`message-apply.ts`) so all page-side applies go through
 * one runner.
 */
import { applyAdaptiveScheme } from "../lib/engine";
import { EARLY_STYLE_ID } from "../lib/theme-dom-constants";
import type { Palette } from "../lib/palette";
import type { ApplyOptions } from "../types";

// Re-exported so `content/index.ts` (and its consumers) keep importing the
// early-paint id from here. Canonical home is `theme-dom-constants.ts` (D8).
export { EARLY_STYLE_ID };

/**
 * Paints a base background `hex` onto `<html>` immediately, before the body
 * exists, to remove the reload flash. The full engine later overwrites the
 * html/body rule with the precise (body-aware) base.
 */
export const paintEarlyBaseColor = (hex: string): void => {
  const head = document.head || document.documentElement;
  if (!head) {
    return;
  }
  let style = document.getElementById(
    EARLY_STYLE_ID,
  ) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = EARLY_STYLE_ID;
    head.appendChild(style);
  }
  style.textContent = `html { background-color: ${hex} !important; }`;
};

/** Removes the early-base marker style once the full engine has painted. */
export const clearEarlyBase = (): void => {
  document.getElementById(EARLY_STYLE_ID)?.remove();
};

/** Runs the full adaptive engine once a body is available. */
export const applyWhenReady = (
  palette: Palette,
  options: ApplyOptions,
): void => {
  const run = (): void => {
    applyAdaptiveScheme(palette, options);
    // The engine writes its own html/body base rule into `#themeMaker`; drop the
    // early stand-in so there's a single source of truth for the page base.
    clearEarlyBase();
  };
  if (document.body) {
    run();
  } else {
    document.addEventListener("DOMContentLoaded", run, { once: true });
  }
};
