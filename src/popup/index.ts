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
  schemeWithIntensity,
} from "./engine-bridge";
import { sendMessage } from "../lib/messages";
import {
  createChromeStorage,
  originFromUrl,
  DEFAULT_SITE_STATE,
  type Favorite,
} from "../lib/storage";
import { siteStateReducer } from "../lib/site-state";
import { isHexColor, normalizeHex } from "../lib/color";
import { clampIntensity } from "../types";
import type { Intensity } from "../types";

const storage = createChromeStorage();
const refs = queryRefs(document);
populateModes(refs.mode);

let state: PopupState = initialPopupState;

const dispatch = (action: PopupAction): void => {
  state = popupReducer(state, action);
  render(state, refs);
};

/** Resolves the active tab's origin for per-site persistence. */
const activeOrigin = async (): Promise<string | null> => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
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
  dispatch({
    type: "hydrate",
    partial: hydratePartial({
      settings,
      history,
      favorites,
      origin,
      site,
      applied,
    }),
  });
  syncFavoriteName();
};

const applyCurrentScheme = async (): Promise<void> => {
  if (!state.current) {
    return;
  }
  // Reuse the palette already on the current scheme (the last generated one);
  // only the intensity changes — NO new colors are picked.
  const { palette, options } = applyPayloadForScheme(
    state.current,
    state.intensity,
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
 * While the per-site toggle is ON, mirror the CURRENTLY-applied look into the
 * persisted `savedScheme` (palette + the LIVE intensity), so a reload restores
 * the latest result — this is what makes Generate / history re-apply / slider
 * moves persist across loads. No-op when the site is disabled or there's
 * nothing applied. Reads fresh per-site state so we never clobber `enabled`.
 */
const persistSavedSchemeIfEnabled = async (): Promise<void> => {
  if (!state.origin || !state.siteEnabled || !state.current) {
    return;
  }
  const scheme = schemeWithIntensity(state.current, state.intensity);
  const next = siteStateReducer(await storage.getSiteState(state.origin), {
    type: "rememberScheme",
    scheme,
  });
  await storage.setSiteState(state.origin, next);
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
      await storage.setSettings({ intensity: state.intensity });
      if (state.current && state.applied) {
        await applyCurrentScheme();
      }
      await persistSavedSchemeIfEnabled();
    })();
  }, INTENSITY_DEBOUNCE_MS);
};

/**
 * Pre-fills the favorite-name input with the current scheme's default name
 * (color name + mode) whenever the field is empty, so a one-click Save just
 * works. Leaves a name the user is editing alone.
 */
const syncFavoriteName = (): void => {
  if (state.current && refs.favoriteName.value.trim() === "") {
    refs.favoriteName.value = defaultFavoriteName(state.current);
  }
};

/** @returns a stable, collision-resistant favorite id. */
const newFavoriteId = (): string =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `fav-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const handlers = {
  onGenerate: async (): Promise<void> => {
    dispatch({ type: "generateStart" });
    // Always use the online color source for new requests; the API path falls
    // back to local generation on any failure, and we skip the network entirely
    // when the browser reports it's offline. Either way generation never throws.
    const result = await generateForSelection({
      selection: state.mode,
      intensity: state.intensity,
      online: typeof navigator === "undefined" || navigator.onLine !== false,
      // When "random" is on, omit the seed so the engine picks a fresh color
      // (today's behavior); otherwise Generate uses the chosen seed.
      seed: state.useRandomSeed ? undefined : state.seed,
      deps: { fetchImpl: fetch, cache: storage.paletteCacheStore() },
    });
    const resp = await sendMessage({
      type: "APPLY_SCHEME",
      palette: result.palette,
      options: result.options,
      scheme: result.scheme,
    });
    if (!resp.ok) {
      dispatch({ type: "generateError", error: resp.error ?? "apply failed" });
      return;
    }
    const history = await storage.pushHistory(result.scheme);
    dispatch({ type: "generateSuccess", scheme: result.scheme, history });
    syncFavoriteName();
    // While the site is enabled, a new generate updates what gets reapplied on
    // the next load.
    await persistSavedSchemeIfEnabled();
  },

  onApply: async (): Promise<void> => {
    if (!state.current || !state.origin) {
      return;
    }
    // Persist the live look (palette + current intensity) for this origin AND
    // enable auto-reapply, so the theme sticks across reloads. This is what the
    // old "Apply on this site" toggle used to do, now folded into one button.
    const next = siteStateReducer(await storage.getSiteState(state.origin), {
      type: "enable",
      scheme: schemeWithIntensity(state.current, state.intensity),
    });
    await storage.setSiteState(state.origin, next);
    dispatch({ type: "setSiteEnabled", enabled: true });
    refs.status.textContent = "Applied to this site.";
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

  onSelectSeed: async (hex: string): Promise<void> => {
    // Ignore unparseable input (e.g. a half-typed hex); the view re-renders the
    // last valid value. A valid pick also turns OFF random (reducer does this).
    if (!isHexColor(hex)) {
      return;
    }
    const seed = normalizeHex(hex);
    dispatch({ type: "setSeed", seed });
    await storage.setSettings({ seed, useRandomSeed: false });
  },

  onToggleRandomSeed: async (): Promise<void> => {
    dispatch({ type: "toggleRandomSeed" });
    await storage.setSettings({ useRandomSeed: state.useRandomSeed });
  },

  onToggleDetails: (): void => {
    dispatch({ type: "toggleDetails" });
  },

  onSelectHistory: async (index: number): Promise<void> => {
    dispatch({ type: "selectHistory", index });
    await applyCurrentScheme();
    // Re-applying a history entry while enabled updates the reapply target.
    await persistSavedSchemeIfEnabled();
  },

  onSaveFavorite: async (name: string): Promise<void> => {
    if (!state.current) {
      return;
    }
    const trimmed = name.trim();
    const favorite: Favorite = {
      id: newFavoriteId(),
      name: trimmed === "" ? defaultFavoriteName(state.current) : trimmed,
      scheme: state.current,
    };
    const favorites = await storage.saveFavorite(favorite);
    dispatch({ type: "setFavorites", favorites });
    refs.favoriteName.value = "";
    syncFavoriteName();
  },

  onSelectFavorite: async (id: string): Promise<void> => {
    const favorite = state.favorites.find((f) => f.id === id);
    if (!favorite) {
      return;
    }
    // Make the favorite the current scheme, then apply it live via the same
    // path history re-apply uses (so intensity / Apply-to-site / Details work).
    dispatch({ type: "applyFavorite", scheme: favorite.scheme });
    await applyCurrentScheme();
    await persistSavedSchemeIfEnabled();
  },

  onDeleteFavorite: async (id: string): Promise<void> => {
    const favorites = await storage.deleteFavorite(id);
    dispatch({ type: "setFavorites", favorites });
  },
};

bindEvents(refs, handlers);
void hydrate();
