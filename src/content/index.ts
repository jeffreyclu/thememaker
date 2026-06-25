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
 * executeScript path injected into), and holds the SINGLE long-lived `Engine`
 * instance (`content/engine-instance.ts`): the Engine's encapsulated state and
 * the single `<style id="themeMaker">` are shared across the auto-reapply,
 * popup-apply, and picker paths, so they never double-apply (all write the same
 * style in place) and never conflict.
 *
 * ## Flash elimination
 *
 * Reload-flash prevention is the ENGINE's job, not this script's: the engine
 * remembers the last themed base and, told to, repaints it synchronously at
 * `document_start` before any async read. This script just decides WHETHER to
 * theme and calls `engine.preventReloadFlash()` / `engine.cancelReloadFlash()` /
 * `engine.applyWhenReady()` — it holds NO theming logic of its own.
 */
import { STYLE_ELEMENT_ID } from "../lib/engine/theme-dom-constants";
import { loadDecision } from "../lib/storage/site-state";
import { engine } from "./engine-instance";
import { readSiteState } from "./site-storage";
import { applyLive, hidePicker, showPicker } from "./picker/picker-session";
import { runApply, runQuery, runReset } from "./apply-handlers";
import type {
  ContentMessage,
  ContentReplyMessage,
  MessageResponse,
} from "../lib/messaging";

/** The content-script entry point. Exported for unit testing. */
export const runContentScript = async (): Promise<void> => {
  // Only http(s) pages carry a real origin worth theming; chrome://, about:,
  // and data: URLs have opaque/absent origins and aren't injectable anyway.
  const origin = location.origin;
  if (!origin || origin === "null") {
    return;
  }

  // Synchronously, BEFORE any async read: repaint the last themed base so the
  // first frame is already themed (no reload flash). No-op if this origin was
  // never themed.
  engine.preventReloadFlash();

  // The async per-site read decides whether to actually theme.
  const site = await readSiteState(origin);
  const decision = loadDecision(site);
  if (!decision.apply) {
    // Not themed (e.g. disabled/cleared) — undo the flash placeholder.
    engine.cancelReloadFlash();
    return;
  }

  // Theme when the DOM is ready (the engine paints a fallback base first if this
  // is the very first themed load with no remembered base).
  engine.applyWhenReady(decision.palette, decision.options);
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
      return runApply(message.palette, message.options, message.scheme);
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

export { showPicker, hidePicker } from "./picker/picker-session";
export { STYLE_ELEMENT_ID };
