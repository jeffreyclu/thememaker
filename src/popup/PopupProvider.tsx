/**
 * Popup state provider.
 *
 * Thin composition root: `usePopupController` (a hook) owns ALL business logic
 * (reducer, chrome-backed actions, hydration); this component only publishes its
 * `state` + `actions` through the two contexts. The contexts and their reader
 * hooks live in `hooks/usePopupContext`.
 */
import { type ReactElement, type ReactNode } from "react";

import { ActionsContext, StateContext } from "./hooks/usePopupContext";
import { usePopupController } from "./hooks/usePopupController";

export const PopupProvider = ({
  children,
}: {
  children: ReactNode;
}): ReactElement => {
  const { state, actions } = usePopupController();
  return (
    <ActionsContext.Provider value={actions}>
      <StateContext.Provider value={state}>{children}</StateContext.Provider>
    </ActionsContext.Provider>
  );
};
