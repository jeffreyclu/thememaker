/**
 * The popup VIEW store context — the seam between `PopupProvider` (which owns the
 * view reducer) and the `usePopup` actions hook (which reads it via
 * `usePopupStore()`).
 *
 * It exposes only the view `dispatch`. Kept in its own module so the hook consumes
 * it without importing the provider (no import cycle).
 */
import { createContext, useContext } from "react";

import type { PopupAction } from "../popup-reducer";

export interface PopupStore {
  dispatch: (action: PopupAction) => void;
}

export const PopupStoreContext = createContext<PopupStore | null>(null);

/** Reads the popup view store. Throws outside a `PopupProvider`. */
export const usePopupStore = (): PopupStore => {
  const store = useContext(PopupStoreContext);
  if (!store) {
    throw new Error("usePopupStore must be used within a PopupProvider");
  }
  return store;
};
