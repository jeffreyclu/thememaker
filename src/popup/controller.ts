/**
 * Popup commit machinery — the shared "apply-live + persist" path.
 *
 * Apply / reset / query are sent DIRECTLY to the active tab's content script
 * (`ctx.send`, a `chrome.tabs.sendMessage` request/response) instead of through
 * the background's old `chrome.scripting.executeScript` injector. The content
 * script runs the same engine in the page and replies; the popup updates its
 * state from that reply, then persists the look for the origin.
 *
 * Pure over the injected {@link PopupContext} so it is testable without chrome.
 */
import { applyPayloadForScheme, schemeWithIntensity } from "./engine-bridge";
import { siteStateReducer } from "../lib/storage/site-state";
import type { PopupContext } from "./context";

const INTENSITY_DEBOUNCE_MS = 120;

export interface Controller {
  applyCurrentScheme: () => Promise<void>;
  persistTheme: () => Promise<void>;
  commitCurrent: () => Promise<void>;
  scheduleIntensityCommit: () => void;
}

/** Builds the commit machinery over a chrome-free {@link PopupContext}. */
export const makeController = (ctx: PopupContext): Controller => {
  const { getState, dispatch, storage, send } = ctx;

  /**
   * Applies the CURRENT scheme to the active tab via the content channel,
   * reusing the palette already on `current` (only intensity + the live custom
   * overrides change — NO new colors are GENERATED, the overrides are the user's
   * explicit picks). Updates `applied` from the content script's reply.
   */
  const applyCurrentScheme = async (): Promise<void> => {
    const state = getState();
    if (!state.current) {
      return;
    }
    const { palette, options } = applyPayloadForScheme(
      state.current,
      state.intensity,
      state.overrides,
    );
    const resp = await send({
      type: "APPLY_SCHEME",
      palette,
      options,
      scheme: state.current,
    });
    if (!resp.ok) {
      dispatch({ type: "generateError", error: resp.error ?? "apply failed" });
      return;
    }
    dispatch({ type: "applied", applied: Boolean(resp.applied) });
  };

  /**
   * AUTO-SAVE the current look for this origin. There is no manual Apply/Save:
   * every change (generate, override edit, intensity, history pick) is applied
   * AND persisted, and the site is ENABLED so a reload restores it. No-op when
   * there's nothing to save (no origin / no current scheme).
   */
  const persistTheme = async (): Promise<void> => {
    const state = getState();
    if (!state.origin || !state.current) {
      return;
    }
    const next = siteStateReducer(await storage.getSiteState(state.origin), {
      type: "enable",
      scheme: schemeWithIntensity(
        state.current,
        state.intensity,
        state.overrides,
      ),
    });
    await storage.setSiteState(state.origin, next);
    if (!state.siteEnabled) {
      dispatch({ type: "setSiteEnabled", enabled: true });
    }
  };

  /**
   * Commits the CURRENT scheme: applies it live to the page, then persists it.
   * The single path shared by the history / favorite / invert / intensity
   * handlers. Any throw (messaging/storage) is caught + surfaced so the popup
   * can never strand in a disabled "Generating…" state.
   */
  const commitCurrent = async (): Promise<void> => {
    try {
      await applyCurrentScheme();
      await persistTheme();
    } catch (e) {
      dispatch({
        type: "generateError",
        error: e instanceof Error ? e.message : "apply failed",
      });
    }
  };

  /**
   * Debounced commit of the intensity slider: persists the new value and, when a
   * theme is currently applied, LIVE re-applies the same palette at the new
   * intensity. Debounced so dragging the slider doesn't flood the page; the
   * latest value always wins.
   */
  let intensityTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleIntensityCommit = (): void => {
    if (intensityTimer !== null) {
      clearTimeout(intensityTimer);
    }
    intensityTimer = setTimeout(() => {
      intensityTimer = null;
      void (async () => {
        try {
          const state = getState();
          await storage.setSettings({ intensity: state.intensity });
          // Only LIVE re-apply when a theme is already on the tab; otherwise just
          // persist the new value.
          if (state.current && state.applied) {
            await applyCurrentScheme();
          }
          await persistTheme();
        } catch (e) {
          dispatch({
            type: "generateError",
            error: e instanceof Error ? e.message : "apply failed",
          });
        }
      })();
    }, INTENSITY_DEBOUNCE_MS);
  };

  return {
    applyCurrentScheme,
    persistTheme,
    commitCurrent,
    scheduleIntensityCommit,
  };
};
