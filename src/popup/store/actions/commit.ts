/**
 * Popup commit factory — the shared "apply-live + persist" path.
 *
 * Apply / reset / query are sent DIRECTLY to the active tab's content script
 * (`send`, a `chrome.tabs.sendMessage` request/response). The content script
 * runs the same engine in the page and replies; the popup updates its state from
 * that reply, then persists the look for the origin.
 *
 * Pure over its injected {@link CommitDeps} (no `chrome.*`), so it is testable in
 * isolation.
 */
import { applyPayloadForScheme, schemeWithIntensity } from "../schemes";
import type { CommitDeps } from "./deps";
import type { Intensity, RoleOverrides, Scheme } from "../../types";

const INTENSITY_DEBOUNCE_MS = 120;

/**
 * The exact look to commit (apply + persist): the scheme plus the live intensity
 * + overrides to bake onto it. Actions that change the scheme (history/favorite/
 * invert) pass an explicit snapshot — React's `dispatch` is DEFERRED, so reading
 * `getState()` right after dispatching would see the pre-dispatch scheme. The
 * intensity path omits it (its debounce fires after the dispatch has settled).
 */
export interface LiveScheme {
  scheme: Scheme;
  intensity: Intensity;
  overrides: RoleOverrides;
}

export interface Commit {
  applyCurrentScheme: (live?: LiveScheme) => Promise<void>;
  persistTheme: (live?: LiveScheme) => Promise<void>;
  commitCurrent: (live?: LiveScheme) => Promise<void>;
  scheduleIntensityCommit: (intensity: Intensity) => void;
}

/** Builds the commit machinery over chrome-free {@link CommitDeps}. */
export const makeCommit = (deps: CommitDeps): Commit => {
  const { getState, dispatch, storage, siteState, send } = deps;

  /** The look to commit: an explicit snapshot, or the current reducer state. */
  const resolveLive = (live?: LiveScheme): LiveScheme | null => {
    if (live) {
      return live;
    }
    const state = getState();
    return state.current
      ? {
          scheme: state.current,
          intensity: state.intensity,
          overrides: state.overrides,
        }
      : null;
  };

  /**
   * Applies a scheme to the active tab via the content channel, reusing the
   * palette already on it (only intensity + the live custom overrides change —
   * NO new colors are GENERATED, the overrides are the user's explicit picks).
   * Updates `applied` from the content script's reply.
   */
  const applyCurrentScheme = async (live?: LiveScheme): Promise<void> => {
    const resolved = resolveLive(live);
    if (!resolved) {
      return;
    }
    const { palette, options } = applyPayloadForScheme(
      resolved.scheme,
      resolved.intensity,
      resolved.overrides,
    );
    const resp = await send({
      type: "APPLY_SCHEME",
      palette,
      options,
      scheme: resolved.scheme,
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
  const persistTheme = async (live?: LiveScheme): Promise<void> => {
    const state = getState();
    const resolved = resolveLive(live);
    if (!state.origin || !resolved) {
      return;
    }
    await siteState.persistEnabled(
      state.origin,
      schemeWithIntensity(
        resolved.scheme,
        resolved.intensity,
        resolved.overrides,
      ),
    );
    if (!state.siteEnabled) {
      dispatch({ type: "setSiteEnabled", enabled: true });
    }
  };

  /**
   * Commits a scheme: applies it live to the page, then persists it. The single
   * path shared by the history / favorite / invert / intensity actions. Any throw
   * (messaging/storage) is caught + surfaced so the popup can never strand in a
   * disabled "Generating…" state.
   */
  const commitCurrent = async (live?: LiveScheme): Promise<void> => {
    try {
      await applyCurrentScheme(live);
      await persistTheme(live);
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
   *
   * Takes the target `intensity` explicitly: React's `dispatch` is deferred, so
   * reading it back from `getState()` when the timer fires could see the stale
   * pre-drag value. The current scheme/overrides still come from state.
   */
  let intensityTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleIntensityCommit = (intensity: Intensity): void => {
    if (intensityTimer !== null) {
      clearTimeout(intensityTimer);
    }
    intensityTimer = setTimeout(() => {
      intensityTimer = null;
      void (async () => {
        try {
          const state = getState();
          await storage.setSettings({ intensity });
          const live = state.current
            ? { scheme: state.current, intensity, overrides: state.overrides }
            : undefined;
          // Only LIVE re-apply when a theme is already on the tab; otherwise just
          // persist the new value.
          if (state.current && state.applied) {
            await applyCurrentScheme(live);
          }
          await persistTheme(live);
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
