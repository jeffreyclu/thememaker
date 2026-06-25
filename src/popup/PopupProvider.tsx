/**
 * The popup's VIEW-state provider — the outer of the two providers.
 *
 * THIN composition: ONE `useReducer` holds the popup's view state (disclosures,
 * in-flight/error flags, just-saved confirmation, pick mode). It publishes the
 * state through `PopupStateContext` and the (stable) dispatch through
 * `PopupStoreContext`; the `usePopup` actions hook reads the store and builds the
 * intents. State + store are separate contexts so action consumers don't re-render
 * from state churn.
 *
 * `App` nests `SchemeProvider` INSIDE this provider, so the scheme actions can
 * call `usePopup` to drive the view (loading/error, save confirmation).
 */
import {
  createContext,
  useContext,
  useMemo,
  useReducer,
  type ReactElement,
  type ReactNode,
} from "react";

import {
  popupInitialState,
  popupReducer,
  type PopupState,
} from "./popup-reducer";
import { PopupStoreContext, type PopupStore } from "./hooks/popup-store";

// Exported so tests can read/seed the live view state.
export const PopupStateContext = createContext<PopupState | null>(null);

export const PopupProvider = ({
  children,
}: {
  children: ReactNode;
}): ReactElement => {
  const [state, dispatch] = useReducer(popupReducer, popupInitialState);

  // `dispatch` is stable for the popup's life → a stable deps object.
  const store = useMemo<PopupStore>(() => ({ dispatch }), []);

  return (
    <PopupStoreContext.Provider value={store}>
      <PopupStateContext.Provider value={state}>
        {children}
      </PopupStateContext.Provider>
    </PopupStoreContext.Provider>
  );
};

/** Reads the live popup view state. Throws outside a `PopupProvider`. */
export const usePopupState = (): PopupState => {
  const state = useContext(PopupStateContext);
  if (!state) {
    throw new Error("usePopupState must be used within a PopupProvider");
  }
  return state;
};
