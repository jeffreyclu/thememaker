/**
 * `usePopup` — the popup's VIEW actions API the components bind to.
 *
 * Pure UI intents over the popup-view reducer: open/close the three disclosures,
 * flip the in-flight/error flags, surface the just-saved confirmation (auto-clears
 * after a beat), and toggle pick mode. No `chrome.*`, no async IO — those live in
 * the SCHEME actions, which call THESE actions to drive the view (e.g. generate
 * flips loading/error; save opens favorites + highlights the row).
 *
 * ONE definition: reads the view dispatch from `usePopupStore()` and builds the
 * actions once over the stable dispatch, so consumers get a referentially-stable
 * actions object.
 */
import { useMemo } from "react";

import { usePopupStore } from "../state/PopupProvider";

/** How long the "Saved" confirmation/highlight lingers before clearing. */
const SAVE_FEEDBACK_MS = 2200;

/** The view intents the popup UI binds to. */
export interface PopupActions {
  onToggleDetails: () => void;
  onToggleFavorites: () => void;
  onToggleHistory: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  /** Flags the just-saved favorite, opens the panel, then auto-clears the flag. */
  setSavedFavoriteId: (id: string) => void;
  clearSaveFeedback: () => void;
  setPicking: (picking: boolean) => void;
}

export const usePopup = (): PopupActions => {
  const { dispatch } = usePopupStore();

  return useMemo<PopupActions>(
    () => ({
      onToggleDetails: () => dispatch({ type: "toggleDetails" }),
      onToggleFavorites: () => dispatch({ type: "toggleFavorites" }),
      onToggleHistory: () => dispatch({ type: "toggleHistory" }),
      setLoading: (loading) => dispatch({ type: "setLoading", loading }),
      setError: (error) => dispatch({ type: "setError", error }),
      setSavedFavoriteId: (id) => {
        dispatch({ type: "setSavedFavoriteId", id });
        setTimeout(
          () => dispatch({ type: "clearSaveFeedback" }),
          SAVE_FEEDBACK_MS,
        );
      },
      clearSaveFeedback: () => dispatch({ type: "clearSaveFeedback" }),
      setPicking: (picking) => dispatch({ type: "setPicking", picking }),
    }),
    // `dispatch` is stable for the popup's life → build the actions once.
    [dispatch],
  );
};
