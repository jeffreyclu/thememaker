/**
 * The popup's SCHEME state machine — the SchemeProvider's single source of truth.
 *
 * This module owns the pure parts of the provider's `useReducer`: the scheme
 * state shape, the action union, the reducer, the on-open hydration patch, and the
 * read-only SELECTORS + scheme→view derivations the components render from. It is
 * DOM-free and `chrome.*`-free, so the whole state machine stays unit-testable
 * without React. The provider (`SchemeProvider.tsx`) binds it via `useReducer`;
 * `useScheme` (the actions hook) dispatches these actions and runs the side
 * effects. The pure scheme transforms + read-only view derivations live in the
 * `../lib/scheme` domain.
 *
 * The popup's own VIEW state (disclosures / in-flight / save confirmation) lives
 * in a SEPARATE reducer (`popup-reducer.ts`); scheme actions drive that view via
 * the `usePopup` actions.
 */
import { dequeueScheme } from "../../lib/storage/history";
import { clampIntensity, DEFAULT_INTENSITY } from "../../types";
import type { Intensity, RoleOverrides, Scheme } from "../../types";
import type { Favorite } from "../../lib/storage";
import type { ModeSelection } from "../../lib/scheme";

export type { ModeSelection };

export interface SchemeState {
  /** The scheme currently selected/active in the popup, if any. */
  current: Scheme | null;
  /** Persisted, bounded history (most-recent last). */
  history: Scheme[];
  /** The selected color mode ("random" picks one per generate). */
  mode: ModeSelection;
  /** Surface-coverage dial (10–100) the in-page engine repaints with. */
  intensity: Intensity;
  /** Whether the current/next scheme is flipped light↔dark (Invert toggle). */
  invert: boolean;
  /** Saved GLOBAL favorites (insertion order). */
  favorites: Favorite[];
  /** Whether a Thememaker style is applied on the active tab. */
  applied: boolean;
  /** Active tab origin, for the per-site toggle. */
  origin: string | null;
  /** Per-site enabled flag (the content script auto-reapplies from this). */
  siteEnabled: boolean;
  /** The custom-theme editor's per-role color overrides (override-key → hex). */
  overrides: RoleOverrides;
}

export const schemeInitialState: SchemeState = {
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
};

export type SchemeAction =
  | { type: "hydrate"; partial: Partial<SchemeState> }
  | { type: "selectMode"; mode: ModeSelection }
  | { type: "selectIntensity"; intensity: Intensity }
  | { type: "toggleInvert" }
  | { type: "setFavorites"; favorites: Favorite[] }
  | { type: "applyFavorite"; scheme: Scheme }
  | { type: "generateSuccess"; scheme: Scheme; history: Scheme[] }
  | { type: "selectHistory"; index: number }
  | { type: "applied"; applied: boolean }
  | { type: "reset" }
  | { type: "setSiteEnabled"; enabled: boolean };

/** Pure reducer for all scheme-domain state transitions. */
export const schemeReducer = (
  state: SchemeState,
  action: SchemeAction,
): SchemeState => {
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
    case "applyFavorite":
      // A favorite/invert/selected scheme becomes current + applied; history is
      // untouched. Its saved intensity + overrides become live so the slider
      // matches and Save sees it as already-saved (no duplicate re-save).
      return {
        ...state,
        current: action.scheme,
        applied: true,
        intensity: clampIntensity(
          action.scheme.schemeDetails.intensity ?? state.intensity,
        ),
        overrides: action.scheme.schemeDetails.overrides ?? {},
      };
    case "generateSuccess":
      // A fresh palette starts from a clean custom theme (old picks targeted the
      // previous palette's roles and no longer apply).
      return {
        ...state,
        current: action.scheme,
        history: action.history,
        applied: true,
        overrides: {},
      };
    case "selectHistory": {
      const scheme = dequeueScheme(state.history, action.index);
      if (!scheme) {
        return state;
      }
      return {
        ...state,
        current: scheme,
        applied: true,
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
        overrides: {},
      };
    case "setSiteEnabled":
      return { ...state, siteEnabled: action.enabled };
    default:
      return state;
  }
};

/** Inputs for {@link hydratePartial}: persisted storage + active-tab state. */
export interface HydrateInputs {
  settings: { mode: ModeSelection; intensity: Intensity; invert: boolean };
  history: Scheme[];
  favorites: Favorite[];
  origin: string | null;
  site: { enabled: boolean; savedScheme?: Scheme };
  applied: boolean;
}

/**
 * Computes the popup's initial scheme-state patch. Restores this origin's saved
 * theme as `current` (with its saved intensity/overrides) so the
 * slider/details/re-apply work after a reopen on a persisted site — the popup is
 * recreated each open, so without this `current` is null.
 */
export const hydratePartial = (inputs: HydrateInputs): Partial<SchemeState> => {
  const savedScheme = inputs.site.savedScheme ?? null;
  const saved = savedScheme?.schemeDetails;
  return {
    mode: inputs.settings.mode,
    intensity: clampIntensity(saved?.intensity ?? inputs.settings.intensity),
    invert: saved?.invert ?? inputs.settings.invert ?? false,
    favorites: inputs.favorites,
    history: inputs.history,
    origin: inputs.origin,
    siteEnabled: inputs.site.enabled,
    applied: inputs.applied,
    current: savedScheme,
    overrides: saved?.overrides ?? {},
  };
};

export { DEFAULT_INTENSITY };
