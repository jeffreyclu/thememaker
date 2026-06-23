/**
 * Pure popup state model + reducer.
 *
 * The popup view (`view.ts`) is a thin renderer bound to this state; all
 * transitions live here so they are unit-testable without a DOM or chrome.*.
 * High-frequency vs low-frequency concerns aren't an issue at this scale (one
 * small document), so a single reducer keeps it simple.
 */
import { dequeueScheme } from "../lib/theme-engine";
import { DEFAULT_INTENSITY } from "../types";
import type { ColorMode, Intensity, Scheme, SchemeDetails } from "../types";

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
  /** Whether to use thecolorapi.com ("surprise me") instead of local generation. */
  surprise: boolean;
  /** Whether a Thememaker style is applied on the active tab. */
  applied: boolean;
  /** Active tab origin, for the per-site toggle. */
  origin: string | null;
  /** Per-site enabled flag (Phase 3 consumes this for auto-reapply). */
  siteEnabled: boolean;
  /** Whether the details disclosure is open. */
  showDetails: boolean;
  /** Whether a generate request is in flight. */
  loading: boolean;
  /** Last error message, if the most recent action failed. */
  error: string | null;
}

export const initialPopupState: PopupState = {
  current: null,
  history: [],
  mode: "random",
  intensity: DEFAULT_INTENSITY,
  surprise: false,
  applied: false,
  origin: null,
  siteEnabled: false,
  showDetails: false,
  loading: false,
  error: null,
};

export type PopupAction =
  | { type: "hydrate"; partial: Partial<PopupState> }
  | { type: "selectMode"; mode: ModeSelection }
  | { type: "selectIntensity"; intensity: Intensity }
  | { type: "toggleSurprise" }
  | { type: "generateStart" }
  | { type: "generateSuccess"; scheme: Scheme; history: Scheme[] }
  | { type: "generateError"; error: string }
  | { type: "selectHistory"; index: number }
  | { type: "applied"; applied: boolean }
  | { type: "reset" }
  | { type: "toggleDetails" }
  | { type: "toggleSite" };

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
    case "toggleSurprise":
      return { ...state, surprise: !state.surprise };
    case "generateStart":
      return { ...state, loading: true, error: null };
    case "generateSuccess":
      return {
        ...state,
        loading: false,
        error: null,
        current: action.scheme,
        history: action.history,
        applied: true,
      };
    case "generateError":
      return { ...state, loading: false, error: action.error };
    case "selectHistory": {
      const scheme = dequeueScheme(state.history, action.index);
      if (!scheme) {
        return state;
      }
      return { ...state, current: scheme, applied: true, error: null };
    }
    case "applied":
      return { ...state, applied: action.applied };
    case "reset":
      return { ...state, current: null, applied: false, error: null };
    case "toggleDetails":
      return { ...state, showDetails: !state.showDetails };
    case "toggleSite":
      return { ...state, siteEnabled: !state.siteEnabled };
    default:
      return state;
  }
};

/** @returns the friendly label for a scheme history entry. */
export const historyLabel = (scheme: Scheme, index: number): string => {
  const { rootColorName, colorMode } = scheme.schemeDetails;
  return `${index + 1}. ${rootColorName ?? "scheme"} (${colorMode})`;
};

/**
 * @returns details rows for the current scheme: a list of "tag,tag: #hex"
 * grouped by color (the same grouping the legacy details panel showed).
 */
export const schemeDetailRows = (
  scheme: Scheme,
): Array<{ tags: string; color: string }> => {
  const byColor: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(scheme)) {
    if (key === "schemeDetails") {
      continue;
    }
    const color = value as string;
    (byColor[color] ??= []).push(key);
  }
  return Object.entries(byColor).map(([color, tags]) => ({
    tags: tags.join(","),
    color,
  }));
};

/** @returns the seed metadata for the current scheme, if any. */
export const currentSchemeDetails = (state: PopupState): SchemeDetails | null =>
  state.current?.schemeDetails ?? null;
