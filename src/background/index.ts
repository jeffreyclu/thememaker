/**
 * MV3 service worker — the message-passing hub.
 *
 * The popup sends typed messages (`APPLY_SCHEME` / `RESET_SCHEME` /
 * `QUERY_STATE`); the worker routes them through `routeMessage`, which uses a
 * `chrome.scripting`-backed injector to act on the active tab. Centralizing
 * injection here (rather than in the popup) keeps active-tab resolution and the
 * injection seam in one place for Phase 3's command routing / cross-tab work.
 */
import { createChromeInjector, routeMessage } from "../lib/router";
import type { ThememakerMessage } from "../lib/messages";

const injector = createChromeInjector();

chrome.runtime.onInstalled.addListener(() => {
  console.log("[Thememaker] service worker installed");
});

chrome.runtime.onMessage.addListener(
  (message: ThememakerMessage, _sender, sendResponse) => {
    routeMessage(message, injector)
      .then(sendResponse)
      .catch((e: unknown) => {
        sendResponse({
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      });
    // Returning true keeps the message channel open for the async response.
    return true;
  },
);

export {};
