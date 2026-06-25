/**
 * The EARLY-PAINT DOM primitives — the Engine's flash-elimination internals.
 *
 * `chrome.storage` is async, so at `document_start` the content script can't know
 * the theme before the browser paints the site's original background. The Engine
 * (via these helpers) reads the EXACT cached base from the page's own
 * `localStorage` and synchronously tints `<html>` with a stand-in `<style>` BEFORE
 * any async read, so the very first frame is already the themed base. The full
 * `apply()` later overwrites the html/body rule with the precise (body-aware) base
 * and `clearEarlyBaseStyle` drops the stand-in.
 *
 * Pure DOM (no `chrome.*`); only the `Engine` calls these — the content script
 * never touches early-paint logic itself.
 */
import { EARLY_STYLE_ID } from "./theme-dom-constants";
import { ensureStyleEl } from "./theme-style";

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
