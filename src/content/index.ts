/**
 * Always-on content script, registered for <all_urls> at document_start.
 *
 * On load it restores this origin's saved theme; it also binds the message router
 * (lib/messaging) to its page-side handlers. All theming runs through the single
 * Engine instance; picker control delegates to the in-page picker app.
 */
import { engine } from "../lib/engine";
import { loadDecision } from "../lib/scheme/site-state";
import { storage } from "../lib/storage";
import { installMessageRouter } from "../lib/messaging";
import type {
  ApplySchemeResponse,
  QueryStateResponse,
  ResetSchemeResponse,
} from "../lib/messaging";
import { applyLive, hidePicker, showPicker } from "../picker";
import type { Palette } from "../lib/palette";
import type { ApplyOptions, Scheme } from "../types";

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

/**
 * Page-side reply handlers the router invokes — each drives the single engine and
 * is total (returns a typed response, never throws), so the popup's awaited reply
 * channel always resolves. Exported for tests.
 */
export const runApply = (
  palette: Palette,
  options: ApplyOptions,
  scheme: Scheme,
): ApplySchemeResponse => {
  try {
    engine.applyWhenReady(palette, options);
    return { ok: true, applied: true, scheme };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
};

export const runReset = (): ResetSchemeResponse => {
  try {
    engine.reset();
    return { ok: true, applied: false };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
};

export const runQuery = (): QueryStateResponse => {
  try {
    return { ok: true, applied: engine.isApplied() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
};

declare global {
  interface Window {
    __THEMEMAKER_TEST__?: boolean;
  }
}

// Boot on load. Skipped under unit tests (which set __THEMEMAKER_TEST__).
if (typeof window === "undefined" || !(window as Window).__THEMEMAKER_TEST__) {
  void runContentScript();
  installMessageRouter({
    apply: runApply,
    reset: runReset,
    query: runQuery,
    showPicker,
    hidePicker,
    applyLive,
  });
}
