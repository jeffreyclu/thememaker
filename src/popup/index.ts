/**
 * Popup controller / composition root.
 *
 * Wires together the pure reducer (`state.ts`), the view (`view.ts`), the
 * storage adapter, the theming engine, and message passing to the background.
 * This is the ONLY popup module that touches `chrome.*`.
 *
 * Flow on each user action:
 *   user gesture → engine computes scheme/CSS → sendMessage(APPLY_SCHEME) →
 *   background injects into active tab via chrome.scripting → response →
 *   persist history/site-state → reducer → render.
 */
import "./popup.css";

import {
  defaultFavoriteName,
  hydratePartial,
  initialPopupState,
  popupReducer,
  type ModeSelection,
  type PopupAction,
  type PopupState,
} from "./state";
import { bindEvents, populateModes, queryRefs, render } from "./view";
import {
  applyPayloadForScheme,
  generateForSelection,
  invertScheme,
  schemeWithIntensity,
} from "./engine-bridge";
import { sendMessage, sendToContent } from "../lib/messages";
import {
  createChromeStorage,
  originFromUrl,
  DEFAULT_SITE_STATE,
  type Favorite,
} from "../lib/storage";
import { siteStateReducer } from "../lib/site-state";
import type { Palette } from "../lib/palette";
import { clampIntensity } from "../types";
import type { Intensity } from "../types";

const storage = createChromeStorage();
// Session-scoped in-memory palette cache for the API source. Owned here (not a
// module global in color-source) and reused across Generate clicks so repeated
// seed+mode lookups skip both the network and the persistent store.
const paletteMemoryCache = new Map<string, Palette>();
const refs = queryRefs(document);
populateModes(refs.mode);

let state: PopupState = initialPopupState;

const dispatch = (action: PopupAction): void => {
  state = popupReducer(state, action);
  render(state, refs);
};

/** The active tab's id, cached so pick-mode messages can target the page. */
let activeTabId: number | null = null;

/** Resolves the active tab's origin for per-site persistence. */
const activeOrigin = async (): Promise<string | null> => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTabId = tab?.id ?? null;
  return originFromUrl(tab?.url);
};

/** Hydrates initial popup state from storage + the active tab. */
const hydrate = async (): Promise<void> => {
  const [settings, history, favorites, origin] = await Promise.all([
    storage.getSettings(),
    storage.getHistory(),
    storage.getFavorites(),
    activeOrigin(),
  ]);
  const site = origin ? await storage.getSiteState(origin) : DEFAULT_SITE_STATE;

  // Ask the background whether a Thememaker style is already on the tab.
  let applied = false;
  try {
    const resp = await sendMessage({ type: "QUERY_STATE" });
    applied = Boolean(resp.applied);
  } catch {
    // Non-injectable tab (chrome://, etc.) — leave applied=false.
  }

  // Restore this origin's persisted theme (palette + saved intensity) as the
  // popup's `current` scheme, so the intensity slider / details / re-apply have
  // something to act on after a reload or popup reopen on a persisted site —
  // otherwise `current` is null and the slider is a no-op even though the
  // content script already themed the page.
  const partial = hydratePartial({
    settings,
    history,
    favorites,
    origin,
    site,
    applied,
  });

  // Storage is the single source of truth for overrides: the in-page floating
  // control writes them onto this origin's saved scheme, which `hydratePartial`
  // already restored into `partial.overrides`. So a pick made on the page is
  // reflected here simply by reading storage on open — no handoff/stash needed.
  dispatch({ type: "hydrate", partial });
};

const applyCurrentScheme = async (): Promise<void> => {
  if (!state.current) {
    return;
  }
  // Reuse the palette already on the current scheme (the last generated one);
  // only the intensity + the live custom-theme overrides change — NO new colors
  // are GENERATED (the overrides are the user's explicit picks).
  const { palette, options } = applyPayloadForScheme(
    state.current,
    state.intensity,
    state.overrides,
  );
  const resp = await sendMessage({
    type: "APPLY_SCHEME",
    palette,
    options,
    scheme: state.current,
  });
  if (!resp.ok) {
    dispatch({ type: "generateError", error: resp.error ?? "apply failed" });
    return;
  }
  dispatch({ type: "applied", applied: Boolean(resp.applied) });
};

/**
 * AUTO-SAVE the current look for this origin. There is no manual Apply/Save:
 * every change (generate, override edit, intensity, history pick) is immediately
 * applied to the page AND persisted, and the site is ENABLED so a reload
 * restores it. Captures palette + live intensity + overrides. No-op when there's
 * nothing to save (no origin / no current scheme).
 */
const persistTheme = async (): Promise<void> => {
  if (!state.origin || !state.current) {
    return;
  }
  const next = siteStateReducer(await storage.getSiteState(state.origin), {
    type: "enable",
    scheme: schemeWithIntensity(
      state.current,
      state.intensity,
      state.overrides,
    ),
  });
  await storage.setSiteState(state.origin, next);
  if (!state.siteEnabled) {
    dispatch({ type: "setSiteEnabled", enabled: true });
  }
};

/**
 * Commits the CURRENT scheme: applies it live to the page, then persists it for
 * this origin. The single "apply-live + persist" path shared by the history /
 * favorite / invert / intensity handlers — each only has to dispatch its unique
 * action, then call this. Any throw (messaging/storage failure) is caught and
 * surfaced as an error so the popup can never strand in a disabled/"Generating…"
 * state with `loading` stuck on.
 */
const commitCurrent = async (): Promise<void> => {
  try {
    await applyCurrentScheme();
    await persistTheme();
  } catch (e) {
    dispatch({
      type: "generateError",
      error: e instanceof Error ? e.message : "apply failed",
    });
  }
};

/**
 * Debounced commit of the intensity slider: persists the new value and, when a
 * theme is currently applied, LIVE re-applies the same palette at the new
 * intensity. Debounced so dragging the slider doesn't flood the page with
 * executeScript calls; the latest value always wins. When the per-site toggle
 * is on, also updates the saved scheme so the new intensity survives a reload.
 */
const INTENSITY_DEBOUNCE_MS = 120;
let intensityTimer: ReturnType<typeof setTimeout> | null = null;
const scheduleIntensityCommit = (): void => {
  if (intensityTimer !== null) {
    clearTimeout(intensityTimer);
  }
  intensityTimer = setTimeout(() => {
    intensityTimer = null;
    void (async () => {
      try {
        await storage.setSettings({ intensity: state.intensity });
        // Only LIVE re-apply when a theme is already on the tab; otherwise just
        // persist the new value. `commitCurrent` would always apply, so the
        // apply step stays inline here behind the `applied` guard.
        if (state.current && state.applied) {
          await applyCurrentScheme();
        }
        await persistTheme();
      } catch (e) {
        dispatch({
          type: "generateError",
          error: e instanceof Error ? e.message : "apply failed",
        });
      }
    })();
  }, INTENSITY_DEBOUNCE_MS);
};

/** @returns a stable, collision-resistant favorite id. */
const newFavoriteId = (): string =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `fav-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const handlers = {
  onGenerate: async (): Promise<void> => {
    dispatch({ type: "generateStart" });
    // Wrap the whole flow: generation never throws, but sendMessage / pushHistory
    // / persistTheme can reject, and an uncaught reject after `generateStart`
    // would strand the popup in a disabled "Generating…" state (only
    // generateSuccess/generateError clear `loading`).
    try {
      // Always use the online color source for new requests; the API path falls
      // back to local generation on any failure, and we skip the network
      // entirely when the browser reports it's offline.
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
      const resp = await sendMessage({
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
      // AUTO: a generated scheme is immediately applied (above) AND persisted +
      // enabled for this origin, so it sticks across reloads with no extra click.
      await persistTheme();
    } catch (e) {
      dispatch({
        type: "generateError",
        error: e instanceof Error ? e.message : "generate failed",
      });
    }
  },

  onReset: async (): Promise<void> => {
    const resp = await sendMessage({ type: "RESET_SCHEME" });
    if (!resp.ok) {
      dispatch({ type: "generateError", error: resp.error ?? "reset failed" });
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
    if (activeTabId != null) {
      await sendToContent(activeTabId, { type: "HIDE_PICKER" });
    }
    dispatch({ type: "reset" });
  },

  onSelectMode: async (mode: ModeSelection): Promise<void> => {
    dispatch({ type: "selectMode", mode });
    await storage.setSettings({ mode });
  },

  onSelectIntensity: (intensity: Intensity): void => {
    // Update the dial immediately so the slider + read-out track the drag.
    // Clamp to the selectable floor (0 is never a valid intensity).
    dispatch({ type: "selectIntensity", intensity: clampIntensity(intensity) });
    // Lightly debounce: persist + LIVE re-apply (reusing the applied palette,
    // NO color regeneration) once the user pauses dragging.
    scheduleIntensityCommit();
  },

  onToggleInvert: async (): Promise<void> => {
    dispatch({ type: "toggleInvert" });
    await storage.setSettings({ invert: state.invert });
    // Flip the live theme immediately (if one is applied) by inverting the
    // current scheme's palette and re-applying — no color regeneration.
    if (state.current) {
      dispatch({ type: "applyFavorite", scheme: invertScheme(state.current) });
      await commitCurrent();
    }
  },

  onToggleDetails: (): void => {
    dispatch({ type: "toggleDetails" });
  },

  onPickElement: async (): Promise<void> => {
    if (!state.current || activeTabId == null) {
      return;
    }
    // Show the IN-PAGE floating control on the tab, seeded with the live theme
    // (palette + intensity + current overrides) so it can apply + persist picks
    // itself, then close the popup. Chrome closes the action popup on page focus
    // anyway, which is fine now — the picking UI lives on the page.
    const { palette, options } = applyPayloadForScheme(
      state.current,
      state.intensity,
      state.overrides,
    );
    // Await the send so the SHOW_PICKER message is flushed before the popup
    // closes — no timing guess needed.
    await sendToContent(activeTabId, {
      type: "SHOW_PICKER",
      palette,
      options,
    });
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

  // ONE-CLICK favorite: no name field, no extra step. The current scheme (with
  // its live intensity + custom overrides) is saved under an auto-generated name
  // (color + mode). This is the only manual "save" left, and it's a single tap.
  onSaveFavorite: async (): Promise<void> => {
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
    const favorite = state.favorites.find((f) => f.id === id);
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

bindEvents(refs, handlers);
void hydrate();
