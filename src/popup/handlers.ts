/**
 * Popup handler factory.
 *
 * `makeHandlers(ctx, controller)` returns the `PopupHandlers` object the view
 * binds to DOM events. Each handler dispatches its unique reducer action, then
 * delegates the shared "apply-live + persist" to the {@link Controller}. All
 * page-side effects go through `ctx.send` / `ctx.sendNoReply` (the content
 * channel) — no `chrome.*` here.
 */
import {
  generateForSelection,
  invertScheme,
  applyPayloadForScheme,
  schemeWithIntensity,
} from "./engine-bridge";
import { defaultFavoriteName, type ModeSelection } from "./state";
import type { PopupHandlers } from "./view";
import type { Controller } from "./controller";
import type { PopupContext } from "./context";
import type { Palette } from "../lib/palette";
import type { Favorite } from "../lib/storage";
import { clampIntensity, type Intensity } from "../types";

/** @returns a stable, collision-resistant favorite id. */
const newFavoriteId = (): string =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `fav-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const makeHandlers = (
  ctx: PopupContext,
  controller: Controller,
): PopupHandlers => {
  const { getState, dispatch, storage, send, sendNoReply } = ctx;
  const { commitCurrent, scheduleIntensityCommit } = controller;

  // Session-scoped in-memory palette cache for the API source, reused across
  // Generate clicks so repeated seed+mode lookups skip network + persistent store.
  const paletteMemoryCache = new Map<string, Palette>();

  return {
    onGenerate: async (): Promise<void> => {
      const state = getState();
      dispatch({ type: "generateStart" });
      // Wrap the whole flow: generation never throws, but send / pushHistory /
      // persistTheme can reject, and an uncaught reject after `generateStart`
      // would strand the popup in a disabled "Generating…" state.
      try {
        const result = await generateForSelection({
          selection: state.mode,
          intensity: state.intensity,
          online: navigator?.onLine ?? true,
          invert: state.invert,
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
          dispatch({
            type: "generateError",
            error: resp.error ?? "apply failed",
          });
          return;
        }
        const history = await storage.pushHistory(result.scheme);
        dispatch({ type: "generateSuccess", scheme: result.scheme, history });
        // AUTO: a generated scheme is applied (above) AND persisted + enabled.
        await controller.persistTheme();
      } catch (e) {
        dispatch({
          type: "generateError",
          error: e instanceof Error ? e.message : "generate failed",
        });
      }
    },

    onReset: async (): Promise<void> => {
      const state = getState();
      const resp = await send({ type: "RESET_SCHEME" });
      if (!resp.ok) {
        dispatch({
          type: "generateError",
          error: resp.error ?? "reset failed",
        });
        return;
      }
      if (state.origin) {
        // Stop auto-reapply and forget the saved look for this origin.
        await storage.setSiteState(state.origin, {
          enabled: false,
          savedScheme: undefined,
        });
      }
      // Close the in-page floating control if it's open on the tab.
      const tabId = ctx.activeTabId();
      if (tabId != null) {
        await sendNoReply({ type: "HIDE_PICKER" });
      }
      dispatch({ type: "reset" });
    },

    onSelectMode: async (mode: ModeSelection): Promise<void> => {
      dispatch({ type: "selectMode", mode });
      await storage.setSettings({ mode });
    },

    onSelectIntensity: (intensity: Intensity): void => {
      // Update the dial immediately so the slider + read-out track the drag.
      dispatch({
        type: "selectIntensity",
        intensity: clampIntensity(intensity),
      });
      // Debounce: persist + LIVE re-apply (reusing the applied palette, NO color
      // regeneration) once the user pauses dragging.
      scheduleIntensityCommit();
    },

    onToggleInvert: async (): Promise<void> => {
      dispatch({ type: "toggleInvert" });
      await storage.setSettings({ invert: getState().invert });
      // Flip the live theme immediately (if one is applied).
      const current = getState().current;
      if (current) {
        dispatch({ type: "applyFavorite", scheme: invertScheme(current) });
        await commitCurrent();
      }
    },

    onToggleDetails: (): void => {
      dispatch({ type: "toggleDetails" });
    },

    onPickElement: async (): Promise<void> => {
      const state = getState();
      const tabId = ctx.activeTabId();
      if (!state.current || tabId == null) {
        return;
      }
      // Show the IN-PAGE floating control on the tab, seeded with the live theme,
      // then close the popup. The picking UI lives on the page.
      const { palette, options } = applyPayloadForScheme(
        state.current,
        state.intensity,
        state.overrides,
      );
      // Await the send so SHOW_PICKER is flushed before the popup closes.
      await sendNoReply({ type: "SHOW_PICKER", palette, options });
      window.close();
    },

    onToggleFavorites: (): void => {
      dispatch({ type: "toggleFavorites" });
    },

    onToggleHistory: (): void => {
      dispatch({ type: "toggleHistory" });
    },

    onSelectHistory: async (index: number): Promise<void> => {
      // Apply the picked entry live and auto-persist it as this origin's theme.
      dispatch({ type: "selectHistory", index });
      await commitCurrent();
    },

    // ONE-CLICK favorite: the current scheme (with its live intensity + custom
    // overrides) is saved under an auto-generated name (color + mode).
    onSaveFavorite: async (): Promise<void> => {
      const state = getState();
      if (!state.current) {
        return;
      }
      const favorite: Favorite = {
        id: newFavoriteId(),
        name: defaultFavoriteName(state.current),
        scheme: schemeWithIntensity(
          state.current,
          state.intensity,
          state.overrides,
        ),
      };
      const favorites = await storage.saveFavorite(favorite);
      dispatch({ type: "setFavorites", favorites });
    },

    onSelectFavorite: async (id: string): Promise<void> => {
      const favorite = getState().favorites.find((f) => f.id === id);
      if (!favorite) {
        return;
      }
      // Selecting a favorite applies it live AND auto-persists it for this origin.
      dispatch({ type: "applyFavorite", scheme: favorite.scheme });
      await commitCurrent();
    },

    onDeleteFavorite: async (id: string): Promise<void> => {
      const favorites = await storage.deleteFavorite(id);
      dispatch({ type: "setFavorites", favorites });
    },
  };
};
