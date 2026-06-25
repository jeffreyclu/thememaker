/**
 * Pure popup state model + reducer.
 *
 * The React popup binds to this state via `useReducer` (see `PopupProvider`);
 * all transitions live here so they stay unit-testable without a DOM or
 * chrome.*. High-frequency vs low-frequency concerns aren't an issue at this
 * scale (one small document), so a single reducer keeps it simple.
 */
import { dequeueScheme } from "../../lib/storage/history";
import {
  defaultFavoriteName,
  historyLabel,
  schemeDetailRows,
} from "./scheme-view-model";
import { clampIntensity, DEFAULT_INTENSITY } from "../../types";
import type { ColorMode, Intensity, RoleOverrides, Scheme } from "../../types";
import type { Favorite } from "../../lib/storage/storage";

export { hydratePartial, type HydrateInputs } from "./hydrate";

export type ModeSelection = ColorMode | "random";

export interface PopupState {
  /** The scheme currently selected/active in the popup, if any. */
  current: Scheme | null;
  /** Persisted, bounded history (most-recent last). */
  history: Scheme[];
  /** The selected color mode ("random" picks one per generate). */
  mode: ModeSelection;
  /** Surface-coverage dial (0–100) the in-page engine repaints with. */
  intensity: Intensity;
  /** Whether the current/next scheme is flipped light↔dark (Invert toggle). */
  invert: boolean;
  /** Saved GLOBAL favorites (insertion order). */
  favorites: Favorite[];
  /** Whether a Thememaker style is applied on the active tab. */
  applied: boolean;
  /** Active tab origin, for the per-site toggle. */
  origin: string | null;
  /** Per-site enabled flag (Phase 3 consumes this for auto-reapply). */
  siteEnabled: boolean;
  /**
   * The custom-theme editor's per-role color overrides (override-key → hex),
   * layered on top of the current scheme's palette. Empty → the pure generated
   * theme. These ride on the current scheme so Apply-to-site / Save-favorite
   * capture them.
   */
  overrides: RoleOverrides;
  /** Whether pick mode was requested (waiting on the page for a click). */
  picking: boolean;
  /** Whether the details disclosure is open. */
  showDetails: boolean;
  /** Whether the favorites disclosure is open. */
  showFavorites: boolean;
  /** Whether the history disclosure is open. */
  showHistory: boolean;
  /** Whether a generate request is in flight. */
  loading: boolean;
  /** Last error message, if the most recent action failed. */
  error: string | null;
  /**
   * Id of the just-saved favorite. Non-null briefly after Save — drives the
   * "Saved ✓" button + status confirmation and the row highlight; the controller
   * clears it after a moment.
   */
  savedFavoriteId: string | null;
}

export const initialPopupState: PopupState = {
  current: null,
  history: [],
  mode: "random",
  intensity: DEFAULT_INTENSITY,
  invert: false,
  favorites: [],
  applied: false,
  origin: null,
  siteEnabled: false,
  overrides: {},
  picking: false,
  showDetails: false,
  showFavorites: false,
  showHistory: false,
  loading: false,
  error: null,
  savedFavoriteId: null,
};

export type PopupAction =
  | { type: "hydrate"; partial: Partial<PopupState> }
  | { type: "selectMode"; mode: ModeSelection }
  | { type: "selectIntensity"; intensity: Intensity }
  | { type: "toggleInvert" }
  | { type: "setFavorites"; favorites: Favorite[] }
  | { type: "favoriteSaved"; favorites: Favorite[]; id: string }
  | { type: "clearSaveFeedback" }
  | { type: "applyFavorite"; scheme: Scheme }
  | { type: "generateStart" }
  | { type: "generateSuccess"; scheme: Scheme; history: Scheme[] }
  | { type: "generateError"; error: string }
  | { type: "selectHistory"; index: number }
  | { type: "applied"; applied: boolean }
  | { type: "reset" }
  | { type: "setOverride"; role: string; color: string }
  | { type: "clearOverride"; role: string }
  | { type: "clearOverrides" }
  | { type: "setPicking"; picking: boolean }
  | { type: "toggleDetails" }
  | { type: "toggleFavorites" }
  | { type: "toggleHistory" }
  | { type: "setSiteEnabled"; enabled: boolean };

/** Pure reducer for all popup state transitions. */
export const popupReducer = (
  state: PopupState,
  action: PopupAction,
): PopupState => {
  switch (action.type) {
    case "hydrate":
      return { ...state, ...action.partial };
    case "selectMode":
      return { ...state, mode: action.mode };
    case "selectIntensity":
      return { ...state, intensity: action.intensity };
    case "toggleInvert":
      return { ...state, invert: !state.invert };
    case "setFavorites":
      return { ...state, favorites: action.favorites };
    case "favoriteSaved":
      // Open favorites + flag the new row so the view can confirm the save
      // (button + status) and briefly highlight where it landed.
      return {
        ...state,
        favorites: action.favorites,
        showFavorites: true,
        savedFavoriteId: action.id,
      };
    case "clearSaveFeedback":
      return { ...state, savedFavoriteId: null };
    case "applyFavorite":
      // A favorite becomes the current scheme (so the slider / Apply / Details
      // act on it) and is marked applied; history is untouched. Its saved
      // intensity + overrides become the live state — so the slider matches the
      // favorite and Save sees it as already-saved (no duplicate re-save).
      return {
        ...state,
        current: action.scheme,
        applied: true,
        error: null,
        intensity: clampIntensity(
          action.scheme.schemeDetails.intensity ?? state.intensity,
        ),
        overrides: action.scheme.schemeDetails.overrides ?? {},
      };
    case "generateStart":
      return { ...state, loading: true, error: null };
    case "generateSuccess":
      // A fresh palette starts from a clean custom theme (the old picks targeted
      // the previous palette's roles and no longer apply).
      return {
        ...state,
        loading: false,
        error: null,
        current: action.scheme,
        history: action.history,
        applied: true,
        overrides: {},
      };
    case "generateError":
      return { ...state, loading: false, error: action.error };
    case "selectHistory": {
      const scheme = dequeueScheme(state.history, action.index);
      if (!scheme) {
        return state;
      }
      return {
        ...state,
        current: scheme,
        applied: true,
        error: null,
        overrides: scheme.schemeDetails.overrides ?? {},
      };
    }
    case "applied":
      return { ...state, applied: action.applied };
    case "reset":
      return {
        ...state,
        current: null,
        applied: false,
        siteEnabled: false,
        error: null,
        overrides: {},
        picking: false,
      };
    case "setOverride":
      return {
        ...state,
        overrides: { ...state.overrides, [action.role]: action.color },
      };
    case "clearOverride": {
      const next = { ...state.overrides };
      delete next[action.role];
      return { ...state, overrides: next };
    }
    case "clearOverrides":
      return { ...state, overrides: {} };
    case "setPicking":
      return { ...state, picking: action.picking };
    case "toggleDetails":
      return { ...state, showDetails: !state.showDetails };
    case "toggleFavorites":
      return { ...state, showFavorites: !state.showFavorites };
    case "toggleHistory":
      return { ...state, showHistory: !state.showHistory };
    case "setSiteEnabled":
      return { ...state, siteEnabled: action.enabled };
    default:
      return state;
  }
};

// `historyLabel` / `schemeDetailRows` / `defaultFavoriteName` are the scheme→view
// derivations (D10), re-exported from the shared view-model; `currentSchemeDetails`
// / `overrideRoleLabel` / `baseColorForRole` / `overrideRows` are the PopupState
// selectors, re-exported from `state-selectors.ts`. Both keep state.ts's existing
// consumers (and tests) on their current import path.
export { historyLabel, schemeDetailRows, defaultFavoriteName };
export {
  currentSchemeDetails,
  overrideRoleLabel,
  baseColorForRole,
  overrideRows,
} from "./state-selectors";
