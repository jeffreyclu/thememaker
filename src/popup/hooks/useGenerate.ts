/**
 * `useGenerate` — the Generate flow + the mode selection that feeds it.
 *
 * Generate resolves a palette for the current selection (online color source with
 * a local fallback — see `generateForSelection`), applies it to the page, records
 * history, and persists the look. Loading/error drive the popup view; the session
 * palette cache skips repeat network for repeated seed+mode lookups.
 */
import { useMemo } from "react";

import { generateForSelection } from "../../lib/scheme";
import { createSchemeEffects } from "./scheme-effects";
import { useSchemeStore } from "./scheme-store";
import { usePopup } from "./usePopup";
import { usePersist } from "./usePersist";
import { storage } from "../../lib/storage";
import type { Palette } from "../../lib/palette";
import type { ModeSelection } from "../scheme-reducer";

export interface GenerateActions {
  onGenerate: () => void;
  onSelectMode: (mode: ModeSelection) => void;
}

export const useGenerate = (): GenerateActions => {
  const store = useSchemeStore();
  const popup = usePopup();
  const { getState, dispatch } = store;
  // Generate persists the fresh look through the per-site persistence hook.
  const { persist } = usePersist();

  return useMemo<GenerateActions>(() => {
    const { send } = createSchemeEffects(store, popup);
    // Session-scoped in-memory palette cache for the API source, reused across
    // Generate clicks so repeated seed+mode lookups skip network + persistent store.
    const paletteMemoryCache = new Map<string, Palette>();

    return {
      onGenerate: async (): Promise<void> => {
        const s = getState();
        popup.setLoading(true);
        try {
          const result = await generateForSelection({
            selection: s.mode,
            intensity: s.intensity,
            online: navigator?.onLine ?? true,
            invert: s.invert,
            deps: {
              fetchImpl: fetch,
              cache: storage.paletteCacheStore(),
              memoryCache: paletteMemoryCache,
            },
          });
          const resp = await send({
            type: "APPLY_SCHEME",
            palette: result.palette,
            options: result.options,
            scheme: result.scheme,
          });
          if (!resp.ok) {
            popup.setError(resp.error ?? "apply failed");
            return;
          }
          const history = await storage.pushHistory(result.scheme);
          dispatch({ type: "generateSuccess", scheme: result.scheme, history });
          popup.setLoading(false);
          await persist();
        } catch (e) {
          popup.setError(e instanceof Error ? e.message : "generate failed");
        }
      },

      onSelectMode: async (mode: ModeSelection): Promise<void> => {
        dispatch({ type: "selectMode", mode });
        await storage.setSettings({ mode });
      },
    };
    // `store`/`popup`/`persist` are stable → build the actions once.
  }, [store, popup, persist]);
};
