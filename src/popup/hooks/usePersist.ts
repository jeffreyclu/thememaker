/**
 * `usePersist` — per-site theme persistence.
 *
 * Surfaces the auto-save of the live look for the active origin (so a reload
 * restores it), wrapped so a failure surfaces as a popup error instead of
 * stranding. The apply/intensity/invert/history/favorite flows persist via the
 * shared effect engine's `commitCurrent`; this hook is the standalone persist the
 * generate flow runs after a fresh apply.
 */
import { useMemo } from "react";

import { useSchemeEffects, type LiveScheme } from "./useSchemeEffects";
import { useSchemeStore } from "../SchemeProvider";
import { usePopup } from "./usePopup";

export interface PersistActions {
  /** Auto-save the live look for this origin (no-op without origin/scheme). */
  persist: (live?: LiveScheme) => Promise<void>;
}

export const usePersist = (): PersistActions => {
  const store = useSchemeStore();
  const popup = usePopup();
  const effects = useSchemeEffects(store, popup);

  return useMemo<PersistActions>(() => {
    const { persistTheme } = effects;
    return {
      persist: async (live?: LiveScheme): Promise<void> => {
        try {
          await persistTheme(live);
        } catch (e) {
          popup.setError(e instanceof Error ? e.message : "apply failed");
        }
      },
    };
    // `store`/`popup` are stable for the popup's life → build the actions once.
  }, [store, popup, effects]);
};
