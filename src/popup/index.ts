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
  initialPopupState,
  popupReducer,
  type ModeSelection,
  type PopupAction,
  type PopupState,
} from "./state";
import { bindEvents, populateModes, queryRefs, render } from "./view";
import { applyPayloadForScheme, generateForSelection } from "./engine-bridge";
import { sendMessage } from "../lib/messages";
import { createChromeStorage, originFromUrl } from "../lib/storage";
import { siteStateReducer } from "../lib/site-state";
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
  const [settings, history, origin] = await Promise.all([
    storage.getSettings(),
    storage.getHistory(),
    activeOrigin(),
  ]);
  const site = origin ? await storage.getSiteState(origin) : { enabled: false };

  // Ask the background whether a Thememaker style is already on the tab.
  let applied = false;
  try {
    const resp = await sendMessage({ type: "QUERY_STATE" });
    applied = Boolean(resp.applied);
  } catch {
    // Non-injectable tab (chrome://, etc.) — leave applied=false.
  }

  dispatch({
    type: "hydrate",
    partial: {
      mode: settings.mode,
      // Clamp persisted intensity into the selectable range (migrates any old
      // 0 / out-of-range value forward).
      intensity: clampIntensity(settings.intensity),
      surprise: settings.surprise,
      history,
      origin,
      siteEnabled: site.enabled,
      applied,
    },
  });
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
 * Debounced commit of the intensity slider: persists the new value and, when a
 * theme is currently applied, LIVE re-applies the same palette at the new
 * intensity. Debounced so dragging the slider doesn't flood the page with
 * executeScript calls; the latest value always wins.
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
    })();
  }, INTENSITY_DEBOUNCE_MS);
};

const handlers = {
  onGenerate: async (): Promise<void> => {
    dispatch({ type: "generateStart" });
    // Local generation is instant + offline; the API "surprise" path falls back
    // to local on any failure, so generation never returns undefined.
    const result = await generateForSelection({
      selection: state.mode,
      intensity: state.intensity,
      surprise: state.surprise,
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
  },

  onSave: async (): Promise<void> => {
    if (!state.current || !state.origin) {
      return;
    }
    const next = siteStateReducer(await storage.getSiteState(state.origin), {
      type: "rememberScheme",
      scheme: state.current,
    });
    await storage.setSiteState(state.origin, next);
    refs.status.textContent = "Saved for this site.";
  },

  onReset: async (): Promise<void> => {
    const resp = await sendMessage({ type: "RESET_SCHEME" });
    if (!resp.ok) {
      dispatch({ type: "generateError", error: resp.error ?? "reset failed" });
      return;
    }
    if (state.origin) {
      const next = siteStateReducer(await storage.getSiteState(state.origin), {
        type: "forgetScheme",
      });
      await storage.setSiteState(state.origin, next);
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

  onToggleSurprise: async (): Promise<void> => {
    dispatch({ type: "toggleSurprise" });
    await storage.setSettings({ surprise: state.surprise });
  },

  onToggleDetails: (): void => {
    dispatch({ type: "toggleDetails" });
  },

  onToggleSite: async (): Promise<void> => {
    dispatch({ type: "toggleSite" });
    if (!state.origin) {
      return;
    }
    const next = siteStateReducer(await storage.getSiteState(state.origin), {
      type: "toggle",
    });
    await storage.setSiteState(state.origin, next);
  },

  onSelectHistory: async (index: number): Promise<void> => {
    dispatch({ type: "selectHistory", index });
    await applyCurrentScheme();
  },
};

bindEvents(refs, handlers);
void hydrate();
