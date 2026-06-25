/**
 * `useHistory` — re-applying a scheme from the persisted history.
 *
 * Selecting an entry makes it current + applied and re-applies it live (its saved
 * overrides become the live overrides). The deferred-dispatch SNAPSHOT rule
 * applies: the picked scheme is read BEFORE dispatching and passed explicitly to
 * `commitCurrent`, since `getState()` right after `dispatch` would still see the
 * pre-dispatch scheme.
 */
import { useMemo } from "react";

import { useSchemeEffects } from "./useSchemeEffects";
import { useSchemeStore } from "../SchemeProvider";
import { usePopup } from "./usePopup";
import { dequeueScheme } from "../../lib/storage/history";

export interface HistoryActions {
  onSelectHistory: (index: number) => void;
}

export const useHistory = (): HistoryActions => {
  const store = useSchemeStore();
  const popup = usePopup();
  const effects = useSchemeEffects(store, popup);
  const { getState, dispatch } = store;

  return useMemo<HistoryActions>(() => {
    const { commitCurrent } = effects;

    return {
      onSelectHistory: async (index: number): Promise<void> => {
        const scheme = dequeueScheme(getState().history, index);
        dispatch({ type: "selectHistory", index });
        if (scheme) {
          popup.setError(null);
          await commitCurrent({
            scheme,
            intensity: getState().intensity,
            overrides: scheme.schemeDetails.overrides ?? {},
          });
        }
      },
    };
    // `store`/`popup` are stable for the popup's life → build the actions once.
  }, [store, popup, effects]);
};
