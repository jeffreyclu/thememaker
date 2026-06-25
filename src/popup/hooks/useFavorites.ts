/**
 * `useFavorites` — the saved-favorites flow.
 *
 * Save captures the live look (scheme + intensity + overrides) as a new favorite
 * and confirms it in the view (opens the panel + highlights the row); the Save
 * button's dedupe-disable is the `isCurrentSaved` selector, so a re-save can't
 * duplicate. Select re-applies a favorite, syncing intensity to its saved value
 * (so Save sees it as already-saved). Delete drops it from storage.
 */
import { useMemo } from "react";

import { schemeWithIntensity, defaultFavoriteName } from "../../lib/scheme";
import { createSchemeEffects } from "./scheme-effects";
import { useSchemeStore } from "./scheme-store";
import { usePopup } from "./usePopup";
import { storage } from "../../lib/storage";
import type { Favorite } from "../../lib/storage";
import { clampIntensity } from "../../types";

export interface FavoriteActions {
  onSaveFavorite: () => void;
  onSelectFavorite: (id: string) => void;
  onDeleteFavorite: (id: string) => void;
}

/** @returns a stable, collision-resistant favorite id. */
const newFavoriteId = (): string =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `fav-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const useFavorites = (): FavoriteActions => {
  const store = useSchemeStore();
  const popup = usePopup();
  const { getState, dispatch } = store;

  return useMemo<FavoriteActions>(() => {
    const { commitCurrent } = createSchemeEffects(store, popup);

    return {
      onSaveFavorite: async (): Promise<void> => {
        const s = getState();
        if (!s.current) {
          return;
        }
        const favorite: Favorite = {
          id: newFavoriteId(),
          name: defaultFavoriteName(s.current),
          scheme: schemeWithIntensity(s.current, s.intensity, s.overrides),
        };
        const favorites = await storage.saveFavorite(favorite);
        dispatch({ type: "setFavorites", favorites });
        popup.setSavedFavoriteId(favorite.id);
      },

      onSelectFavorite: async (id: string): Promise<void> => {
        const favorite = getState().favorites.find((f) => f.id === id);
        if (!favorite) {
          return;
        }
        const { scheme } = favorite;
        dispatch({ type: "applyFavorite", scheme });
        popup.setError(null);
        await commitCurrent({
          scheme,
          intensity: clampIntensity(
            scheme.schemeDetails.intensity ?? getState().intensity,
          ),
          overrides: scheme.schemeDetails.overrides ?? {},
        });
      },

      onDeleteFavorite: async (id: string): Promise<void> => {
        const favorites = await storage.deleteFavorite(id);
        dispatch({ type: "setFavorites", favorites });
      },
    };
    // `store`/`popup` are stable for the popup's life → build the actions once.
  }, [store, popup]);
};
