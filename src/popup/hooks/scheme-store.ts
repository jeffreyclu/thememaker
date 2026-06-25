/**
 * The SCHEME store context — the seam between `SchemeProvider` (which owns the
 * reducer + refs) and the focused scheme hooks (which read it via
 * `useSchemeStore()`).
 *
 * It exposes only what the provider naturally owns: `getState` (a ref read of the
 * LATEST reducer state, fresh across the actions' `await`s), `dispatch`, and the
 * resolved active-tab id. Popup side effects are NOT bundled here — a hook that
 * needs them composes `usePopup()` itself. Kept in its own module so the hooks
 * consume it without importing the provider (no import cycle).
 */
import { createContext, useContext } from "react";

import type { SchemeAction, SchemeState } from "../scheme-reducer";

export interface SchemeStore {
  getState: () => SchemeState;
  dispatch: (action: SchemeAction) => void;
  activeTabId: () => number | null;
}

export const SchemeStoreContext = createContext<SchemeStore | null>(null);

/** Reads the scheme store. Throws outside a `SchemeProvider`. */
export const useSchemeStore = (): SchemeStore => {
  const store = useContext(SchemeStoreContext);
  if (!store) {
    throw new Error("useSchemeStore must be used within a SchemeProvider");
  }
  return store;
};
