/**
 * `usePopupController` — the popup's business-logic hook.
 *
 * Drives the whole popup: owns the reducer state, builds the chrome-backed
 * action {@link ActionDeps} ONCE (refs keep `getState` / the active-tab id fresh
 * without rebuilding actions), wires the commit + action factories over them,
 * and runs hydration on mount. The provider just renders the contexts from what
 * this returns — ALL side-effecting logic lives here, not in the JSX.
 */
import { useMemo, useReducer, useRef } from "react";

import { initialPopupState, popupReducer, type PopupState } from "../state";
import { makeCommit } from "../actions/commit";
import { makeActions, type PopupActions } from "../actions/actions";
import type { ActionDeps } from "../actions/deps";
import { useHydrate } from "./useHydrate";
import { useSiteState } from "./useSiteState";
import { sendToContent, sendToContentWithReply } from "../../lib/messaging";
import { storage } from "../../lib/storage";

export interface PopupController {
  state: PopupState;
  actions: PopupActions;
}

export const usePopupController = (): PopupController => {
  const [state, dispatch] = useReducer(popupReducer, initialPopupState);

  // `getState` must always read the LATEST state (not a render snapshot), since
  // the async actions read it after `await`s. A ref synced each render gives the
  // built-once deps a stable `getState` without rebuilding the actions.
  const stateRef = useRef(state);
  stateRef.current = state;

  // The active tab id, resolved during hydration; apply/reset/pick messages
  // target it. A ref so the built-once deps always read the current value.
  const activeTabIdRef = useRef<number | null>(null);

  // Per-site enable/persist business logic — a stable hook api (built once).
  const siteState = useSiteState();

  // Build the chrome-backed deps + actions ONCE — stable for the popup's life.
  // `storage` / `siteState` are stable for the popup's life (singleton + memo).
  const actions = useMemo(() => {
    const deps: ActionDeps = {
      getState: () => stateRef.current,
      dispatch,
      storage,
      siteState,
      send: (message) =>
        activeTabIdRef.current == null
          ? Promise.resolve({ ok: false, applied: false } as never)
          : sendToContentWithReply(activeTabIdRef.current, message),
      sendNoReply: (message) =>
        activeTabIdRef.current == null
          ? Promise.resolve()
          : sendToContent(activeTabIdRef.current, message),
      activeTabId: () => activeTabIdRef.current,
      closeWindow: () => window.close(),
    };
    return makeActions(deps, makeCommit(deps));
  }, []);

  // Hydrate settings/history/favorites/this origin's saved theme + applied flag.
  useHydrate(storage, activeTabIdRef, dispatch);

  return { state, actions };
};
