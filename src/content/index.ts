/**
 * Always-on content script, registered for <all_urls> at document_start.
 *
 * On load it restores this origin's saved theme; it also installs the listener
 * that routes popup messages. All theming runs through the single Engine
 * instance — this file holds no theming logic of its own.
 */
import { engine } from "../lib/engine";
import { STYLE_ELEMENT_ID } from "../lib/engine/theme-dom-constants";
import { loadDecision } from "../lib/storage/site-state";
import { storage } from "../lib/storage";
import { installMessageRouter } from "./message-router";

/** Restores this origin's saved theme on load (auto-reapply). Exported for tests. */
export const runContentScript = async (): Promise<void> => {
  const origin = location.origin;
  if (!origin || origin === "null") {
    return;
  }

  // Repaint the last themed base synchronously, before the async read, so the
  // first frame is already themed (no flash). No-op if this origin was never themed.
  engine.preventReloadFlash();

  const decision = loadDecision(await storage.getSiteState(origin));
  if (!decision.apply) {
    // Not themed (disabled/cleared) — undo the flash placeholder.
    engine.cancelReloadFlash();
    return;
  }
  engine.applyWhenReady(decision.palette, decision.options);
};

declare global {
  interface Window {
    __THEMEMAKER_TEST__?: boolean;
  }
}

// Boot on load. Skipped under unit tests (which set __THEMEMAKER_TEST__).
if (typeof window === "undefined" || !(window as Window).__THEMEMAKER_TEST__) {
  void runContentScript();
  installMessageRouter();
}

export { showPicker, hidePicker } from "../picker/session";
export { STYLE_ELEMENT_ID };
