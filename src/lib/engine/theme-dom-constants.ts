/**
 * The DOM identifiers Thememaker owns on a themed page (D8) — the single source
 * of truth for the `<style>` element ids, the per-element/root marker attribute,
 * and the synchronous base-color cache key.
 *
 * Before Phase 1 these were re-typed as inline string literals inside each
 * serialized `executeScript` payload (which couldn't reference a shared const).
 * Now that the engine is bundled, every page-side module references THESE consts
 * instead of re-inlining the strings, so an id rename is a one-line change.
 *
 * No DOM, no `chrome.*` — just constants.
 */

/** The id of the main `<style>` the engine writes its theme into. */
export const STYLE_ELEMENT_ID = "themeMaker";

/** The id of the sibling `<style>` carrying the per-tag override layer. */
export const OVERRIDE_STYLE_ID = "themeMakerOverrides";

/** The id of the early-paint stand-in `<style>` (the anti-flash base paint). */
export const EARLY_STYLE_ID = "themeMakerEarly";

/** The id of the in-page picker's hover-highlight overlay. */
export const PICK_OVERLAY_ID = "themeMakerPickOverlay";

/**
 * The presence attribute the engine sets on `<html>` AND on every themed
 * surface. As a bare `[data-thememaker]` marker on `<html>` it scopes the
 * role-text rules (lifting them over site single-class colors); as
 * `[data-thememaker="N"]` on a surface it carries the per-element id.
 */
export const ROOT_MARKER_ATTR = "data-thememaker";

/** The attribute a tinted SEMANTIC surface carries so scoped text rules find it. */
export const SURFACE_TOKEN_ATTR = "data-tm-surf";

/**
 * Namespaced `localStorage` key under which the engine caches the EXACT base
 * background it painted onto html/body for the current origin. The content
 * script reads it SYNCHRONOUSLY at `document_start` to early-paint the themed
 * base on the first frame (no reload flash).
 */
export const BASE_CACHE_KEY = "__thememaker_base__";
