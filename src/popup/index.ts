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
import {
  sendMessage,
  sendToContent,
  type ElementPickedMessage,
} from "../lib/messages";
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

/**
 * The picker runs as a DETACHED standalone window when Chrome's action popup
 * can't stay open. That window receives the TARGET page tab + origin via URL
 * query params (it can't resolve them from the active tab — its own window is
 * "active"). `?picker=1&tabId=<n>&origin=<o>` marks picker mode.
 */
const params = new URLSearchParams(location.search);
const isPickerWindow = params.get("picker") === "1";
const paramTabId = Number(params.get("tabId"));
const paramOrigin = params.get("origin");

/** The page tab this UI targets: the param tab in picker mode, else the active tab. */
let targetTabId: number | null =
  isPickerWindow && Number.isFinite(paramTabId) ? paramTabId : null;

/** Resolves the target tab's origin for per-site persistence. */
const activeOrigin = async (): Promise<string | null> => {
  // Picker window: the page is the param tab, NOT this window's active tab.
  if (isPickerWindow) {
    return paramOrigin || null;
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  targetTabId = tab?.id ?? null;
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

  // Restore the live theme the action popup stashed for the picker window
  // (covers a theme generated-but-not-yet-applied, which has no per-site
  // savedScheme). The PICKER WINDOW always uses it (and opens into Customize);
  // the ACTION POPUP only adopts it when it has nothing better restored, so
  // reopening the action popup reflects in-progress custom edits.
  const handoff = await storage.getPickerHandoff();
  if (handoff && (isPickerWindow || !partial.current)) {
    partial.current = handoff.scheme;
    partial.overrides = handoff.overrides ?? {};
    partial.intensity = clampIntensity(handoff.intensity);
    partial.applied = true;
  } else if (handoff && partial.current && handoff.overrides) {
    // Action popup with its own current scheme: merge in the picker's overrides
    // so customizations made in the detached window show up here too.
    partial.overrides = handoff.overrides;
  }
  if (isPickerWindow) {
    partial.showCustomize = true;
  }

  dispatch({ type: "hydrate", partial });
  syncFavoriteName();

  // If the user picked an element while the popup was closed, the content script
  // stashed the role in storage. Consume it (one-shot) and apply it now.
  if (origin && state.current) {
    const picked = await storage.consumePendingPick(origin);
    if (picked) {
      await applyPickedRole(picked);
    }
  }

  // PICKER WINDOW: auto-start pick mode so the user can immediately click the
  // page (the window stays open the whole time).
  if (isPickerWindow && state.current && targetTabId != null) {
    dispatch({ type: "setPicking", picking: true });
    await sendToContent(targetTabId, { type: "START_PICK" });
  }
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
  // Detached picker window: the background injector targets the ACTIVE tab in
  // THIS window (the picker window) — wrong. Send the apply straight to the
  // target page's content script instead, which runs the same engine in place.
  if (isPickerWindow && targetTabId != null) {
    await sendToContent(targetTabId, { type: "APPLY_LIVE", palette, options });
    dispatch({ type: "applied", applied: true });
    return;
  }
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
  const scheme = schemeWithIntensity(
    state.current,
    state.intensity,
    state.overrides,
  );
  const next = siteStateReducer(await storage.getSiteState(state.origin), {
    type: "rememberScheme",
    scheme,
  });
  await storage.setSiteState(state.origin, next);
};

/**
 * Opens the SAME popup UI in a detached standalone window for element picking,
 * passing the target page tab + origin via query params. The window persists
 * while the user clicks the page (unlike the action popup), so picks land live.
 * Best-effort: if `chrome.windows` is unavailable the caller falls back to the
 * storage-handoff path (the action popup reopen consumes the pending pick).
 */
const openPickerWindow = async (
  tabId: number,
  origin: string | null,
): Promise<void> => {
  // Stash the LIVE scheme + overrides + intensity so the detached window (a
  // fresh document that only sees storage) restores exactly the current theme —
  // even if it was generated but not yet applied-to-site.
  try {
    if (state.current) {
      await storage.setPickerHandoff({
        scheme: schemeWithIntensity(
          state.current,
          state.intensity,
          state.overrides,
        ),
        intensity: state.intensity,
        overrides: state.overrides,
      });
    }
  } catch {
    // best-effort
  }
  try {
    const url = chrome.runtime.getURL(
      `src/popup/index.html?picker=1&tabId=${tabId}` +
        (origin ? `&origin=${encodeURIComponent(origin)}` : ""),
    );
    await chrome.windows.create({
      url,
      type: "popup",
      width: 340,
      height: 560,
      focused: true,
    });
  } catch {
    // chrome.windows unavailable — the storage handoff still works on reopen.
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
      await storage.setSettings({ intensity: state.intensity });
      if (state.current && state.applied) {
        await applyCurrentScheme();
      }
      await persistSavedSchemeIfEnabled();
    })();
  }, INTENSITY_DEBOUNCE_MS);
};

/**
 * LIVE re-applies the current scheme with the latest overrides (reusing the
 * current palette — NO regeneration) and persists the custom theme if the site
 * is enabled. Used after every override edit so the page updates instantly.
 */
const liveReapplyOverrides = async (): Promise<void> => {
  if (state.current) {
    await applyCurrentScheme();
  }
  await persistSavedSchemeIfEnabled();
  // Keep the handoff fresh so the OTHER window (action popup ⇄ picker window)
  // reflects the latest custom edits when it next opens.
  if (state.current) {
    try {
      await storage.setPickerHandoff({
        scheme: schemeWithIntensity(
          state.current,
          state.intensity,
          state.overrides,
        ),
        intensity: state.intensity,
        overrides: state.overrides,
      });
    } catch {
      // best-effort
    }
  }
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
      scheme: schemeWithIntensity(
        state.current,
        state.intensity,
        state.overrides,
      ),
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

  onToggleCustomize: (): void => {
    dispatch({ type: "toggleCustomize" });
  },

  onPickElement: async (): Promise<void> => {
    if (!state.current || targetTabId == null) {
      return;
    }
    // PICKER WINDOW: stay open and drive pick mode directly. The standalone
    // window does NOT close when the user clicks the page, so it receives the
    // ELEMENT_PICKED broadcast live and applies the override without a reopen.
    if (isPickerWindow) {
      dispatch({ type: "setPicking", picking: true });
      await sendToContent(targetTabId, { type: "START_PICK" });
      return;
    }
    // ACTION POPUP: Chrome's action popup ALWAYS closes when it loses focus, so
    // it can't host a click-the-page flow. Detach the SAME UI into a standalone
    // window (which stays open) and hand it the target tab + origin. This popup
    // then closes; the detached window takes over picking.
    await openPickerWindow(targetTabId, state.origin);
    window.close();
  },

  onSetOverride: async (role: string, color: string): Promise<void> => {
    if (!isHexColor(color)) {
      return;
    }
    dispatch({ type: "setOverride", role, color: normalizeHex(color) });
    await liveReapplyOverrides();
  },

  onClearOverride: async (role: string): Promise<void> => {
    dispatch({ type: "clearOverride", role });
    await liveReapplyOverrides();
  },

  onClearOverrides: async (): Promise<void> => {
    dispatch({ type: "clearOverrides" });
    await liveReapplyOverrides();
  },

  onToggleFavorites: (): void => {
    dispatch({ type: "toggleFavorites" });
  },

  onToggleHistory: (): void => {
    dispatch({ type: "toggleHistory" });
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
      // Bake the live intensity + custom overrides onto the saved scheme so the
      // favorite captures the user's full custom theme.
      scheme: schemeWithIntensity(
        state.current,
        state.intensity,
        state.overrides,
      ),
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

/**
 * Applies a picked role: seeds an override for it with the role's CURRENT
 * (generated or already-overridden) color, opens the customize panel, exits
 * pick mode, and live re-applies. Seeding with the existing color means the
 * picked role is immediately editable (the color input starts on its real
 * color) and the page doesn't visibly jump until the user actually changes it.
 */
const applyPickedRole = async (role: string): Promise<void> => {
  if (!state.current) {
    return;
  }
  const roles = state.current.schemeDetails.palette?.roles as
    | Record<string, string>
    | undefined;
  const seed = state.overrides[role] ?? roles?.[role] ?? "#808080";
  dispatch({ type: "setPicking", picking: false });
  if (!state.showCustomize) {
    dispatch({ type: "toggleCustomize" });
  }
  // Seed the override with the role's CURRENT color so the row appears with its
  // real color (the user then tweaks it). This already counts as an override, so
  // the row is editable immediately.
  dispatch({ type: "setOverride", role, color: normalizeHex(seed) });
  await liveReapplyOverrides();

  // PICKER WINDOW: re-arm pick mode so the user can recolor MORE elements without
  // clicking "Pick element" again — the window stays open the whole time.
  if (isPickerWindow && targetTabId != null) {
    dispatch({ type: "setPicking", picking: true });
    await sendToContent(targetTabId, { type: "START_PICK" });
  }
};

// Listen for an ELEMENT_PICKED broadcast while the popup is still open (rare —
// usually the popup has closed by the time the user clicks the page, in which
// case the pick is consumed from storage on the next open instead).
try {
  chrome.runtime.onMessage.addListener((message: ElementPickedMessage) => {
    if (message.type !== "ELEMENT_PICKED") {
      return;
    }
    if (message.cancelled || !message.role) {
      dispatch({ type: "setPicking", picking: false });
      return;
    }
    void applyPickedRole(message.role);
  });
} catch {
  // chrome.runtime unavailable — ignore.
}

bindEvents(refs, handlers);
void hydrate();
