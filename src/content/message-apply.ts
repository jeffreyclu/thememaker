/**
 * Page-side APPLY / RESET / QUERY handlers — the content-script home of what the
 * background's `chrome.scripting.executeScript` injector used to do.
 *
 * The popup now sends APPLY_SCHEME / RESET_SCHEME / QUERY_STATE DIRECTLY to the
 * active tab's content script (`sendToContentWithReply`), instead of routing
 * them through the worker to be serialized into the page. These drive the SINGLE
 * long-lived {@link engine} (`apply()` via `applyWhenReady`, `reset()`,
 * `isApplied()`) in the same isolated world the executeScript path injected into
 * — so the behavior is identical, and the engine is now ordinary bundled code
 * that can `import` shared modules.
 *
 * Each handler is TOTAL: it returns a typed response and never throws, so the
 * `onMessage` reply channel always resolves (the popup awaits it). Failures
 * become `{ ok: false, error }` rather than rejecting the channel.
 */
import { engine } from "./engine-instance";
import type {
  ApplySchemeResponse,
  QueryStateResponse,
  ResetSchemeResponse,
} from "../lib/storage/messages";
import type { Palette } from "../lib/palette/palette";
import type { ApplyOptions, Scheme } from "../types";

/**
 * APPLY: theme the page via `engine.applyWhenReady` and report the apply landed.
 * The engine defers to `DOMContentLoaded` if the body isn't there yet, so
 * `applied: true` means "scheduled/applied", matching the executeScript path
 * (which also returned before the page necessarily finished painting).
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

/** RESET: tear down the engine's `<style>`; a reset leaves nothing applied. */
export const runReset = (): ResetSchemeResponse => {
  try {
    engine.reset();
    return { ok: true, applied: false };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
};

/** QUERY: report whether a Thememaker style is currently on this page. */
export const runQuery = (): QueryStateResponse => {
  try {
    return { ok: true, applied: engine.isApplied() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
};
