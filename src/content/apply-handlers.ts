/**
 * Page-side APPLY / RESET / QUERY handlers.
 *
 * The popup sends APPLY_SCHEME / RESET_SCHEME / QUERY_STATE to the active tab's
 * content script (`sendToContentWithReply`); these drive the single long-lived
 * {@link engine} (`apply()` via `applyWhenReady`, `reset()`, `isApplied()`).
 *
 * Each handler is total: it returns a typed response and never throws, so the
 * `onMessage` reply channel always resolves (the popup awaits it). Failures
 * become `{ ok: false, error }` rather than rejecting the channel.
 */
import { engine } from "../lib/engine";
import type {
  ApplySchemeResponse,
  QueryStateResponse,
  ResetSchemeResponse,
} from "../lib/messaging";
import type { Palette } from "../lib/palette";
import type { ApplyOptions, Scheme } from "../types";

/**
 * APPLY: theme the page via `engine.applyWhenReady` and report the apply landed.
 * The engine defers to `DOMContentLoaded` if the body isn't there yet, so
 * `applied: true` means "scheduled/applied", before the page necessarily paints.
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
