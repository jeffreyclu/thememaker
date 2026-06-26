/**
 * `useApplyScheme` — the applied-theme lifecycle on the active tab.
 *
 * Owns the live re-apply paths: the debounced intensity slider (latest value
 * wins, re-applies + persists), the Invert toggle (flips the live palette), the
 * Customize handoff (SHOW_PICKER + close the popup), and Reset (clear the page +
 * per-site state + hide the picker). The deferred-dispatch snapshot logic lives
 * here — these paths pass an explicit `LiveScheme` to `commitCurrent`.
 */
import { useEffect, useMemo, useRef } from "react";

import { applyPayloadForScheme, invertScheme } from "../../lib/scheme";
import { schemeClient } from "../client/scheme-client";
import { useSchemeStore } from "../state/SchemeProvider";
import { usePopup } from "./usePopup";
import { storage } from "../../lib/storage";
import { clampIntensity, type Intensity } from "../../types";

const INTENSITY_DEBOUNCE_MS = 120;

export interface ApplyActions {
  onReset: () => void;
  onSelectIntensity: (intensity: Intensity) => void;
  onToggleInvert: () => void;
  onPickElement: () => void;
}

export const useApplyScheme = (): ApplyActions => {
  const store = useSchemeStore();
  const popup = usePopup();
  const { getState, dispatch, activeTabId } = store;

  // The debounced intensity timer, in a ref so unmount can clear a pending commit
  // (otherwise a late `setTimeout` calls `setError` on an unmounted popup).
  const intensityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (intensityTimer.current !== null) {
        clearTimeout(intensityTimer.current);
      }
    },
    [],
  );

  return useMemo<ApplyActions>(() => {
    const {
      send,
      sendNoReply,
      applyCurrentScheme,
      persistTheme,
      commitCurrent,
    } = schemeClient(store, popup);

    // Debounced commit of the intensity slider: persists the new value and, when
    // a theme is applied, re-applies the same palette live at the new intensity.
    // The latest value always wins. Takes `intensity` explicitly (dispatch is
    // deferred); the current scheme/overrides come from state.
    const scheduleIntensityCommit = (intensity: Intensity): void => {
      if (intensityTimer.current !== null) {
        clearTimeout(intensityTimer.current);
      }
      intensityTimer.current = setTimeout(() => {
        intensityTimer.current = null;
        void (async () => {
          try {
            const s = getState();
            await storage.setSettings({ intensity });
            const live = s.current
              ? { scheme: s.current, intensity, overrides: s.overrides }
              : undefined;
            if (s.current && s.applied) {
              await applyCurrentScheme(live);
            }
            await persistTheme(live);
          } catch (e) {
            popup.setError(e instanceof Error ? e.message : "apply failed");
          }
        })();
      }, INTENSITY_DEBOUNCE_MS);
    };

    return {
      onReset: async (): Promise<void> => {
        const s = getState();
        const resp = await send({ type: "RESET_SCHEME" });
        if (!resp.ok) {
          popup.setError(resp.error ?? "reset failed");
          return;
        }
        if (s.origin) {
          await storage.setSiteState(s.origin, {
            enabled: false,
            savedScheme: undefined,
          });
        }
        if (activeTabId() != null) {
          await sendNoReply({ type: "HIDE_PICKER" });
        }
        dispatch({ type: "reset" });
        popup.setError(null);
        popup.setPicking(false);
      },

      onSelectIntensity: (intensity: Intensity): void => {
        const clamped = clampIntensity(intensity);
        dispatch({ type: "selectIntensity", intensity: clamped });
        scheduleIntensityCommit(clamped);
      },

      onToggleInvert: async (): Promise<void> => {
        dispatch({ type: "toggleInvert" });
        await storage.setSettings({ invert: getState().invert });
        const current = getState().current;
        if (current) {
          const scheme = invertScheme(current);
          dispatch({ type: "applyFavorite", scheme });
          popup.setError(null);
          await commitCurrent({
            scheme,
            intensity: clampIntensity(
              scheme.schemeDetails.intensity ?? getState().intensity,
            ),
            overrides: scheme.schemeDetails.overrides ?? {},
          });
        }
      },

      onPickElement: async (): Promise<void> => {
        const s = getState();
        if (!s.current || activeTabId() == null) {
          return;
        }
        const { palette, options } = applyPayloadForScheme(
          s.current,
          s.intensity,
          s.overrides,
        );
        await sendNoReply({ type: "SHOW_PICKER", palette, options });
        window.close();
      },
    };
    // `store`/`popup` are stable for the popup's life → build the actions once.
  }, [store, popup]);
};
