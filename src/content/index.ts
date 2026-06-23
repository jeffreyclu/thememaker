/**
 * Always-on content script — per-site AUTO-REAPPLY.
 *
 * Registered for `<all_urls>` at `run_at: document_start` (see
 * `src/manifest.config.ts`). On EVERY page load it reads the saved per-site
 * state for this origin from `chrome.storage.local` and, when the site is
 * enabled with a faithful saved scheme, reapplies the theme — so a reload or a
 * revisit restores the look the user picked, without reopening the popup.
 *
 * This is a BUNDLED module (imports resolve normally), NOT a serialized
 * `executeScript` function — so it imports the EXISTING engine
 * (`applyAdaptiveScheme`) and the pure load decision (`loadDecision`) instead of
 * duplicating any logic. It runs in the content-script ISOLATED WORLD, the same
 * world `chrome.scripting.executeScript` injects into, so the engine's
 * `window.__themeMaker*` state and the single `<style id="themeMaker">` are
 * shared with the popup's on-demand path: the two paths never double-apply
 * (both write the same style in place) and never conflict.
 *
 * ## Flash elimination
 *
 * `chrome.storage` is async, so at `document_start` we can't know the theme
 * before the browser paints the site's original background — that's the reload
 * flash. We eliminate it with a SYNCHRONOUS, same-origin cache in the page's own
 * `localStorage`: every engine apply caches the EXACT base background it painted
 * (`__thememaker_base__`). At the VERY TOP of `document_start`, BEFORE any async
 * read, we synchronously `readBaseCache()` and, if present, paint that exact hex
 * onto `<html>` — so the first frame is already the themed base (no flash, and
 * since it's the engine's exact base, no early→final second flash either). Then
 * we proceed with the async `loadDecision` + full apply (which rewrites the
 * cache).
 *
 * Residual flash: only the VERY FIRST themed load of an origin (no cache yet)
 * falls back to the palette-derived base; every subsequent reload is flash-free.
 * A reset/disable clears the cache so a disabled site never early-paints stale.
 */
import {
  STYLE_ELEMENT_ID,
  applyAdaptiveScheme,
  baseBackgroundFor,
  readBaseCache,
} from "../lib/inject";
import { loadDecision } from "../lib/site-state";
import { KEYS, type SiteState } from "../lib/storage";
import type { Palette } from "../lib/palette";
import type { ApplyOptions } from "../types";

/** Promise-wraps the single per-site read; resolves `undefined` on any error. */
const readSiteState = (origin: string): Promise<SiteState | undefined> =>
  new Promise((resolve) => {
    try {
      const key = KEYS.sitePrefix + origin;
      chrome.storage.local.get(key, (items) => {
        // Swallow lastError (e.g. extension context invalidated) → no-op.
        void chrome.runtime.lastError;
        resolve(items?.[key] as SiteState | undefined);
      });
    } catch {
      resolve(undefined);
    }
  });

/**
 * Paints a base background `hex` onto `<html>` immediately, before the body
 * exists, to remove the reload flash. Uses its own marker `<style>` so it never
 * collides with the engine's `<style id="themeMaker">`; the full engine later
 * overwrites the html/body rule with the precise (body-aware) base.
 */
const EARLY_STYLE_ID = "themeMakerEarly";
const paintEarlyBaseColor = (hex: string): void => {
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
const clearEarlyBase = (): void => {
  document.getElementById(EARLY_STYLE_ID)?.remove();
};

/** Runs the full adaptive engine once a body is available. */
const applyWhenReady = (palette: Palette, options: ApplyOptions): void => {
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

/** The content-script entry point. Exported for unit testing. */
export const runContentScript = async (): Promise<void> => {
  // Only http(s) pages carry a real origin worth theming; chrome://, about:,
  // and data: URLs have opaque/absent origins and aren't injectable anyway.
  const origin = location.origin;
  if (!origin || origin === "null") {
    return;
  }

  // 1) SYNCHRONOUS, BEFORE any async read: paint the cached EXACT base from the
  // page's own localStorage so the very first frame is already the themed base
  // (no flash). `cached` is null on the first themed load (no cache yet).
  const cached = readBaseCache();
  if (cached) {
    paintEarlyBaseColor(cached);
  }

  // 2) Now the async per-site read decides whether to actually theme.
  const site = await readSiteState(origin);
  const decision = loadDecision(site);
  if (!decision.apply) {
    // Site no longer themed (e.g. cache stale vs. storage) — undo any early
    // paint so we don't tint a page we're not theming.
    clearEarlyBase();
    return;
  }

  // 3) First themed load with no cache: fall back to the palette-derived base so
  // there's still a base paint this load (the engine then caches the exact one).
  if (!cached) {
    paintEarlyBaseColor(baseBackgroundFor(decision.palette, decision.options));
  }

  // 4) Run the full engine when the DOM is ready (it rewrites the cache).
  applyWhenReady(decision.palette, decision.options);
};

// Side-effect entry: kick off on load. Guarded so importing this module in unit
// tests (which set `__THEMEMAKER_TEST__`) doesn't auto-run against jsdom.
declare global {
  interface Window {
    __THEMEMAKER_TEST__?: boolean;
  }
}
if (typeof window === "undefined" || !(window as Window).__THEMEMAKER_TEST__) {
  void runContentScript();
}

export { EARLY_STYLE_ID, paintEarlyBaseColor, clearEarlyBase, applyWhenReady };
export { STYLE_ELEMENT_ID };
