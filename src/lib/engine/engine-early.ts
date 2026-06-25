/**
 * The early-paint DOM primitives for flash elimination.
 *
 * `chrome.storage` is async, so at `document_start` the content script can't know
 * the theme before the browser paints the site's original background. These
 * helpers read the cached base from the page's own `localStorage` and synchronously
 * tint `<html>` with a stand-in `<style>` before any async read, so the very first
 * frame is already the themed base. The full `apply()` later overwrites the
 * html/body rule with the precise (body-aware) base and `clearEarlyBaseStyle`
 * drops the stand-in.
 *
 * Pure DOM, no `chrome.*`.
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
