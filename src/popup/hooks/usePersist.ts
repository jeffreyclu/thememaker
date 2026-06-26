/**
 * `usePersist` — per-site theme persistence.
 *
 * Auto-saves the live look for the active origin (so a reload restores it),
 * wrapped so a failure surfaces as a popup error. The
 * apply/intensity/invert/history/favorite flows persist via the client's
 * `commitCurrent`; this hook is the standalone persist the generate flow runs
 * after a fresh apply.
 */
import { useMemo } from "react";

import { schemeClient, type LiveScheme } from "../client/scheme-client";
import { useSchemeStore } from "../state/SchemeProvider";
import { usePopup } from "./usePopup";

export interface PersistActions {
  /** Auto-save the live look for this origin (no-op without origin/scheme). */
  persist: (live?: LiveScheme) => Promise<void>;
}

export const usePersist = (): PersistActions => {
  const store = useSchemeStore();
  const popup = usePopup();

  return useMemo<PersistActions>(() => {
    const { persistTheme } = schemeClient(store, popup);
    return {
      persist: async (live?: LiveScheme): Promise<void> => {
        try {
          await persistTheme(live);
        } catch (e) {
          popup.setError(e instanceof Error ? e.message : "persist failed");
        }
      },
    };
    // `store`/`popup` are stable for the popup's life → build the actions once.
  }, [store, popup]);
};
