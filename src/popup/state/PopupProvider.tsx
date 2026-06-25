/**
 * The popup's view-state provider, the outer of the two providers.
 *
 * One `useReducer` holds the popup's view state (disclosures, in-flight/error
 * flags, just-saved confirmation, pick mode). Publishes the state through
 * `PopupStateContext` and the stable dispatch through `PopupStoreContext`; the
 * `usePopup` actions hook reads the store and builds the intents. State + store
 * are separate contexts so action consumers don't re-render from state churn.
 *
 * `App` nests `SchemeProvider` inside this provider, so the scheme actions can
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
  type PopupAction,
  type PopupState,
} from "./popup-reducer";

// Exported so tests can read/seed the live view state.
export const PopupStateContext = createContext<PopupState | null>(null);

/** The popup view store the `usePopup` actions hook reads (view dispatch). */
export interface PopupStore {
  dispatch: (action: PopupAction) => void;
}

export const PopupStoreContext = createContext<PopupStore | null>(null);

export const PopupProvider = ({
  children,
}: {
  children: ReactNode;
}): ReactElement => {
  const [state, dispatch] = useReducer(popupReducer, popupInitialState);

  // `dispatch` is stable for the popup's life, so the store is built once.
  const store = useMemo<PopupStore>(() => ({ dispatch }), []);

  return (
    <PopupStoreContext.Provider value={store}>
      <PopupStateContext.Provider value={state}>
        {children}
      </PopupStateContext.Provider>
    </PopupStoreContext.Provider>
  );
};

/** Reads the popup view store. Throws outside a `PopupProvider`. */
export const usePopupStore = (): PopupStore => {
  const store = useContext(PopupStoreContext);
  if (!store) {
    throw new Error("usePopupStore must be used within a PopupProvider");
  }
  return store;
};

/** Reads the live popup view state. Throws outside a `PopupProvider`. */
export const usePopupState = (): PopupState => {
  const state = useContext(PopupStateContext);
  if (!state) {
    throw new Error("usePopupState must be used within a PopupProvider");
  }
  return state;
};
