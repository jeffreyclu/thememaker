/**
 * The popup's scheme-state provider, the inner of the two providers.
 *
 * One `useReducer` holds all scheme-domain state; refs keep `getState` / the
 * active-tab id fresh for the action hooks without rebuilding them. Publishes the
 * state through `SchemeStateContext` and `{getState, dispatch, activeTabId}`
 * through `SchemeStoreContext`; the action hooks (`useGenerate`, `useApplyScheme`,
 * `useFavorites`, `useHistory`, `usePersist`) read the store and compose
 * `usePopup()` for view side effects.
 *
 * Hydrates its own initial state on mount (reading storage + the active tab). No
 * business logic lives in this body; it only wires + renders.
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactElement,
  type ReactNode,
} from "react";

import {
  hydratePartial,
  schemeInitialState,
  schemeReducer,
  type SchemeAction,
  type SchemeState,
} from "./scheme-reducer";
import { sendToContentWithReply } from "../../lib/messaging";
import { storage, Storage, DEFAULT_SITE_STATE } from "../../lib/storage";

// Exported so tests can read the live scheme state.
export const SchemeStateContext = createContext<SchemeState | null>(null);

/** The scheme store the focused action hooks read (refs + dispatch). */
export interface SchemeStore {
  getState: () => SchemeState;
  dispatch: (action: SchemeAction) => void;
  activeTabId: () => number | null;
}

export const SchemeStoreContext = createContext<SchemeStore | null>(null);

export const SchemeProvider = ({
  children,
}: {
  children: ReactNode;
}): ReactElement => {
  const [state, dispatch] = useReducer(schemeReducer, schemeInitialState);

  // `getState` must read the latest state (not a render snapshot), since the
  // async actions read it after `await`s. A ref synced each render gives the
  // built-once actions a stable `getState`.
  const stateRef = useRef(state);
  stateRef.current = state;

  // The active tab id, resolved during hydration; apply/reset/pick target it.
  const activeTabIdRef = useRef<number | null>(null);

  const store = useMemo<SchemeStore>(
    () => ({
      getState: () => stateRef.current,
      dispatch,
      activeTabId: () => activeTabIdRef.current,
    }),
    [],
  );

  // On-open hydration. The popup is recreated each open, so this once-on-mount
  // effect reads persisted storage + the active tab (settings, history,
  // favorites, this origin's saved theme, and whether a style is already
  // applied), then dispatches a single `hydrate` patch. It also records the
  // active tab id so apply/reset/pick messages can target it.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      activeTabIdRef.current = tab?.id ?? null;
      const origin = Storage.originFromUrl(tab?.url);

      const [settings, history, favorites] = await Promise.all([
        storage.getSettings(),
        storage.getHistory(),
        storage.getFavorites(),
      ]);
      const site = origin
        ? await storage.getSiteState(origin)
        : DEFAULT_SITE_STATE;

      // Ask the content script whether a Thememaker style is already on the tab.
      // A non-injectable tab (chrome://, etc.) degrades to applied=false.
      let applied = false;
      if (activeTabIdRef.current != null) {
        const resp = await sendToContentWithReply(activeTabIdRef.current, {
          type: "QUERY_STATE",
        });
        applied = Boolean(resp.applied);
      }

      if (cancelled) {
        return;
      }
      // Storage is the source of truth for overrides: the in-page picker writes
      // them onto this origin's saved scheme, which `hydratePartial` restores
      // into `partial.overrides`.
      const partial = hydratePartial({
        settings,
        history,
        favorites,
        origin,
        site,
        applied,
      });
      dispatch({ type: "hydrate", partial });
    })();
    return () => {
      cancelled = true;
    };
    // Hydration is a once-on-mount effect; `dispatch` is stable for the popup's life.
  }, []);

  return (
    <SchemeStoreContext.Provider value={store}>
      <SchemeStateContext.Provider value={state}>
        {children}
      </SchemeStateContext.Provider>
    </SchemeStoreContext.Provider>
  );
};

/** Reads the live scheme state. Throws outside a `SchemeProvider`. */
export const useSchemeState = (): SchemeState => {
  const state = useContext(SchemeStateContext);
  if (!state) {
    throw new Error("useSchemeState must be used within a SchemeProvider");
  }
  return state;
};

/** Reads the scheme store. Throws outside a `SchemeProvider`. */
export const useSchemeStore = (): SchemeStore => {
  const store = useContext(SchemeStoreContext);
  if (!store) {
    throw new Error("useSchemeStore must be used within a SchemeProvider");
  }
  return store;
};
