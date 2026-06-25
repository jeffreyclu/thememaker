/**
 * Popup context objects + reader hooks.
 *
 * The state + actions are published through TWO contexts, SPLIT BY UPDATE
 * FREQUENCY: `StateContext` changes on every reducer transition; `ActionsContext`
 * is referentially stable, so action consumers don't re-render from state churn.
 *
 * The provider writes these (via `StateContext.Provider` / `ActionsContext`);
 * components read them through `usePopupState` / `usePopupActions`.
 */
import { createContext, useContext } from "react";

import type { PopupState } from "../state";
import type { PopupActions } from "../actions/actions";

export const StateContext = createContext<PopupState | null>(null);
export const ActionsContext = createContext<PopupActions | null>(null);

/** Reads the live popup state. Throws outside a provider. */
export const usePopupState = (): PopupState => {
  const state = useContext(StateContext);
  if (!state) {
    throw new Error("usePopupState must be used within a PopupProvider");
  }
  return state;
};

/** Reads the stable popup actions. Throws outside a provider. */
export const usePopupActions = (): PopupActions => {
  const actions = useContext(ActionsContext);
  if (!actions) {
    throw new Error("usePopupActions must be used within a PopupProvider");
  }
  return actions;
};
