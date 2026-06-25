/**
 * Always-on content script — entry point + message dispatch.
 *
 * Registered for `<all_urls>` at `run_at: document_start` (see
 * `src/manifest.config.ts`). Two jobs:
 *
 *  1. AUTO-REAPPLY: on every page load it reads the saved per-site state for
 *     this origin from `chrome.storage.local` and, when the site is enabled with
 *     a faithful saved scheme, reapplies the theme — so a reload or revisit
 *     restores the look the user picked, without reopening the popup.
 *  2. MESSAGE DISPATCH: it is now the SINGLE owner of all page-side effects. The
 *     popup sends APPLY_SCHEME / RESET_SCHEME / QUERY_STATE (reply-carrying) and
 *     SHOW_PICKER / HIDE_PICKER / APPLY_LIVE (fire-and-forget) DIRECTLY to this
 *     tab's content script via `chrome.tabs.sendMessage` — there is no longer a
 *     background `chrome.scripting.executeScript` apply path. Because this is
 *     BUNDLED code (imports resolve normally), the engine it runs can `import`
 *     shared modules instead of being a serialized, self-contained function.
 *
 * It runs in the content-script ISOLATED WORLD (the same world the old
 * executeScript path injected into), so the engine's `window.__themeMaker*`
 * state and the single `<style id="themeMaker">` are shared across the
 * auto-reapply, popup-apply, and picker paths: they never double-apply (all
 * write the same style in place) and never conflict.
 *
 * ## Flash elimination (see `early-paint.ts`)
 *
 * `chrome.storage` is async, so at `document_start` we can't know the theme
 * before the browser paints the site's original background — that's the reload
 * flash. We eliminate it with a SYNCHRONOUS, same-origin cache in the page's own
 * `localStorage`: every engine apply caches the EXACT base background it painted
 * (`__thememaker_base__`). At the VERY TOP of `document_start`, BEFORE any async
 * read, we synchronously `readBaseCache()` and, if present, paint that exact hex
 * onto `<html>` — so the first frame is already the themed base (no flash). Then
 * we proceed with the async `loadDecision` + full apply (which rewrites cache).
 *
 * Residual flash: only the VERY FIRST themed load of an origin (no cache yet)
 * falls back to the palette-derived base; every subsequent reload is flash-free.
 * A reset/disable clears the cache so a disabled site never early-paints stale.
 */
import {
  STYLE_ELEMENT_ID,
  baseBackgroundFor,
  readBaseCache,
} from "../lib/inject";
import { loadDecision } from "../lib/site-state";
import {
  applyWhenReady,
  clearEarlyBase,
  paintEarlyBaseColor,
} from "./early-paint";
import { readSiteState } from "./site-storage";
import { applyLive, hidePicker, showPicker } from "./picker-session";
import { runApply, runQuery, runReset } from "./message-apply";
import type {
  ContentMessage,
  ContentReplyMessage,
  MessageResponse,
} from "../lib/messages";

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

/**
 * Handles a fire-and-forget popup → content-script {@link ContentMessage}
 * (the picker control messages, which need no reply). Exported for tests.
 */
export const handleContentMessage = (message: ContentMessage): void => {
  if (message.type === "SHOW_PICKER") {
    showPicker(message.palette, message.options);
  } else if (message.type === "HIDE_PICKER") {
    hidePicker();
  } else if (message.type === "APPLY_LIVE") {
    applyLive(message.palette, message.options);
  }
};

/**
 * Handles a reply-carrying popup → content-script {@link ContentReplyMessage}
 * (APPLY / RESET / QUERY) and returns the typed response the popup awaits. This
 * is where the old executeScript injector now lives. Exported for tests.
 */
export const handleContentReplyMessage = (
  message: ContentReplyMessage,
): MessageResponse => {
  switch (message.type) {
    case "APPLY_SCHEME":
      return runApply(
        applyWhenReady,
        message.palette,
        message.options,
        message.scheme,
      );
    case "RESET_SCHEME":
      return runReset();
    case "QUERY_STATE":
      return runQuery();
    default: {
      const _exhaustive: never = message;
      return {
        ok: false,
        error: `unknown message: ${JSON.stringify(_exhaustive)}`,
      };
    }
  }
};

/** True for the reply-carrying message types (vs. the fire-and-forget set). */
const needsReply = (
  message: ContentMessage | ContentReplyMessage,
): message is ContentReplyMessage =>
  message.type === "APPLY_SCHEME" ||
  message.type === "RESET_SCHEME" ||
  message.type === "QUERY_STATE";

// Side-effect entry: kick off on load. Guarded so importing this module in unit
// tests (which set `__THEMEMAKER_TEST__`) doesn't auto-run against jsdom.
declare global {
  interface Window {
    __THEMEMAKER_TEST__?: boolean;
  }
}
if (typeof window === "undefined" || !(window as Window).__THEMEMAKER_TEST__) {
  void runContentScript();
  // Listen for the popup's direct tab → content-script messages.
  try {
    chrome.runtime.onMessage.addListener(
      (
        message: ContentMessage | ContentReplyMessage,
        _sender,
        sendResponse: (response: MessageResponse) => void,
      ) => {
        if (needsReply(message)) {
          // APPLY / RESET / QUERY: reply with the typed response. The handler is
          // total (never throws), so the channel always resolves. Return `true`
          // — the standard MV3 request/response signal that keeps the channel
          // open so the (here synchronous) `sendResponse` is reliably delivered.
          sendResponse(handleContentReplyMessage(message));
          return true;
        }
        handleContentMessage(message);
        // Fire-and-forget: no async response (channel closes immediately).
        return undefined;
      },
    );
  } catch {
    // chrome.runtime unavailable (non-extension context) — ignore.
  }
}

export {
  EARLY_STYLE_ID,
  applyWhenReady,
  clearEarlyBase,
  paintEarlyBaseColor,
} from "./early-paint";
export { showPicker, hidePicker } from "./picker-session";
export { STYLE_ELEMENT_ID };
