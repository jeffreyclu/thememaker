/**
 * The popup's view state machine — the PopupProvider's source of truth.
 *
 * Owns the pure parts of the provider's `useReducer` for the popup's own view
 * state (the three disclosures, the in-flight/error flags, the just-saved
 * confirmation, and pick mode). It is DOM-free and `chrome.*`-free, so the state
 * machine stays unit-testable without React. The provider (`PopupProvider.tsx`)
 * binds it via `useReducer`; `usePopup` (the actions hook) dispatches these
 * actions; components read state + call the actions.
 *
 * The scheme domain lives in its own reducer (`scheme-reducer.ts`) so the two
 * domains churn independently — view toggles never re-derive scheme state.
 */

export interface PopupState {
  /** Whether the details disclosure is open. */
  showDetails: boolean;
  /** Whether the favorites disclosure is open. */
  showFavorites: boolean;
  /** Whether the history disclosure is open. */
  showHistory: boolean;
  /** Whether a generate request is in flight. */
  loading: boolean;
  /** Last error message, if the most recent action failed. */
  error: string | null;
  /** Id of the just-saved favorite — drives the "Saved" confirmation + highlight. */
  savedFavoriteId: string | null;
  /** Whether pick mode was requested (waiting on the page for a click). */
  picking: boolean;
}

export const popupInitialState: PopupState = {
  showDetails: false,
  showFavorites: false,
  showHistory: false,
  loading: false,
  error: null,
  savedFavoriteId: null,
  picking: false,
};

export type PopupAction =
  | { type: "toggleDetails" }
  | { type: "toggleFavorites" }
  | { type: "toggleHistory" }
  | { type: "setLoading"; loading: boolean }
  | { type: "setError"; error: string | null }
  | { type: "setSavedFavoriteId"; id: string }
  | { type: "clearSaveFeedback" }
  | { type: "setPicking"; picking: boolean };

/** Pure reducer for all popup view-state transitions. */
export const popupReducer = (
  state: PopupState,
  action: PopupAction,
): PopupState => {
  switch (action.type) {
    case "toggleDetails":
      return { ...state, showDetails: !state.showDetails };
    case "toggleFavorites":
      return { ...state, showFavorites: !state.showFavorites };
    case "toggleHistory":
      return { ...state, showHistory: !state.showHistory };
    case "setLoading":
      // Starting a request clears any stale error; success/failure set it next.
      return {
        ...state,
        loading: action.loading,
        error: action.loading ? null : state.error,
      };
    case "setError":
      return { ...state, loading: false, error: action.error };
    case "setSavedFavoriteId":
      // Open favorites + flag the new row so the view can confirm the save and
      // briefly highlight where it landed.
      return { ...state, showFavorites: true, savedFavoriteId: action.id };
    case "clearSaveFeedback":
      return { ...state, savedFavoriteId: null };
    case "setPicking":
      return { ...state, picking: action.picking };
    default:
      return state;
  }
};
