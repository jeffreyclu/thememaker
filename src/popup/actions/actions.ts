/**
 * Popup action factory.
 *
 * `makeActions(deps, commit)` returns the `PopupActions` object the provider
 * exposes to components. Each action dispatches its unique reducer action, then
 * delegates the shared "apply-live + persist" to the {@link Commit}. All
 * page-side effects go through `send` / `sendNoReply` (the content channel) — no
 * `chrome.*` here; the provider injects them via {@link ActionDeps}.
 */
import {
  generateForSelection,
  invertScheme,
  applyPayloadForScheme,
  schemeWithIntensity,
} from "../schemes";
import { defaultFavoriteName, type ModeSelection } from "../state";
import { dequeueScheme } from "../../lib/storage/history";
import type { Commit } from "./commit";
import type { ActionDeps } from "./deps";
import type { Palette } from "../../lib/palette/palette";
import type { Favorite } from "../../lib/storage";
import { clampIntensity, type Intensity } from "../../types";

/** The intents the popup UI binds to. */
export interface PopupActions {
  /** Generate a fresh scheme — auto-applies + auto-persists for this origin. */
  onGenerate: () => void;
  onReset: () => void;
  onSelectMode: (mode: ModeSelection) => void;
  /** Fired as the slider is dragged (debounced live re-apply). */
  onSelectIntensity: (intensity: Intensity) => void;
  /** Toggle invert (light↔dark) — flips the live theme. */
  onToggleInvert: () => void;
  onToggleDetails: () => void;
  /** Open the in-page floating picker control (Customize). */
  onPickElement: () => void;
  onToggleFavorites: () => void;
  onToggleHistory: () => void;
  onSelectHistory: (index: number) => void;
  /** Save the current scheme as a favorite (one click, auto-named). */
  onSaveFavorite: () => void;
  /** Apply a saved favorite as the current scheme. */
  onSelectFavorite: (id: string) => void;
  /** Delete a saved favorite. */
  onDeleteFavorite: (id: string) => void;
}

/** @returns a stable, collision-resistant favorite id. */
const newFavoriteId = (): string =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `fav-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const makeActions = (deps: ActionDeps, commit: Commit): PopupActions => {
  const { getState, dispatch, storage, send, sendNoReply } = deps;
  const { commitCurrent, scheduleIntensityCommit } = commit;

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
        await commit.persistTheme();
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
      const tabId = deps.activeTabId();
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
      const clamped = clampIntensity(intensity);
      dispatch({ type: "selectIntensity", intensity: clamped });
      // Debounce: persist + LIVE re-apply (reusing the applied palette, NO color
      // regeneration) once the user pauses dragging. Pass the clamped value so the
      // debounced commit doesn't read a stale intensity back from state.
      scheduleIntensityCommit(clamped);
    },

    onToggleInvert: async (): Promise<void> => {
      dispatch({ type: "toggleInvert" });
      await storage.setSettings({ invert: getState().invert });
      // Flip the live theme immediately (if one is applied). Pass the inverted
      // scheme snapshot to commit — React's `dispatch` is deferred, so commit
      // can't read it back from `getState()` yet (mirrors the reducer's
      // `applyFavorite`: intensity from the scheme, else the live one).
      const current = getState().current;
      if (current) {
        const scheme = invertScheme(current);
        dispatch({ type: "applyFavorite", scheme });
        await commitCurrent({
          scheme,
          intensity: clampIntensity(
            scheme.schemeDetails.intensity ?? getState().intensity,
          ),
          overrides: scheme.schemeDetails.overrides ?? {},
        });
      }
    },

    onToggleDetails: (): void => {
      dispatch({ type: "toggleDetails" });
    },

    onPickElement: async (): Promise<void> => {
      const state = getState();
      const tabId = deps.activeTabId();
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
      deps.closeWindow();
    },

    onToggleFavorites: (): void => {
      dispatch({ type: "toggleFavorites" });
    },

    onToggleHistory: (): void => {
      dispatch({ type: "toggleHistory" });
    },

    onSelectHistory: async (index: number): Promise<void> => {
      // Apply the picked entry live and auto-persist it as this origin's theme.
      // Resolve the scheme here too: React's `dispatch` is deferred, so commit
      // can't read the selected entry back from `getState()` yet. Matches the
      // reducer's `selectHistory` (keeps the live intensity; overrides from the
      // entry).
      const scheme = dequeueScheme(getState().history, index);
      dispatch({ type: "selectHistory", index });
      if (scheme) {
        await commitCurrent({
          scheme,
          intensity: getState().intensity,
          overrides: scheme.schemeDetails.overrides ?? {},
        });
      }
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
      // Confirm the save: open favorites, flag the new row (button + status +
      // highlight), then clear the transient confirmation after a moment.
      dispatch({ type: "favoriteSaved", favorites, id: favorite.id });
      setTimeout(() => dispatch({ type: "clearSaveFeedback" }), 2200);
    },

    onSelectFavorite: async (id: string): Promise<void> => {
      const favorite = getState().favorites.find((f) => f.id === id);
      if (!favorite) {
        return;
      }
      // Selecting a favorite applies it live AND auto-persists it for this
      // origin. Pass the snapshot to commit (React's `dispatch` is deferred);
      // mirrors the reducer's `applyFavorite` (intensity + overrides from the
      // favorite's scheme, else the live intensity).
      const { scheme } = favorite;
      dispatch({ type: "applyFavorite", scheme });
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
};
