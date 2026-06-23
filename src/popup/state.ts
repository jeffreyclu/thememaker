/**
 * Pure popup state model + reducer.
 *
 * The popup view (`view.ts`) is a thin renderer bound to this state; all
 * transitions live here so they are unit-testable without a DOM or chrome.*.
 * High-frequency vs low-frequency concerns aren't an issue at this scale (one
 * small document), so a single reducer keeps it simple.
 */
import { dequeueScheme } from "../lib/theme-engine";
import { describeColor } from "../lib/color-names";
import { clampIntensity, DEFAULT_INTENSITY } from "../types";
import type {
  ColorMode,
  Intensity,
  RoleOverrides,
  Scheme,
  SchemeDetails,
} from "../types";
import {
  DEFAULT_SETTINGS,
  type Favorite,
  type Settings,
  type SiteState,
} from "../lib/storage";

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
  /** The user-chosen seed color (`#rrggbb`) the picker reflects. */
  seed: string;
  /** When true, Generate uses a fresh RANDOM seed (ignores {@link PopupState.seed}). */
  useRandomSeed: boolean;
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
  /** Whether the customize (element-picker) disclosure is open. */
  showCustomize: boolean;
  /** Whether the favorites disclosure is open. */
  showFavorites: boolean;
  /** Whether the history disclosure is open. */
  showHistory: boolean;
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
  seed: DEFAULT_SETTINGS.seed,
  useRandomSeed: DEFAULT_SETTINGS.useRandomSeed,
  favorites: [],
  applied: false,
  origin: null,
  siteEnabled: false,
  overrides: {},
  picking: false,
  showDetails: false,
  showCustomize: false,
  showFavorites: false,
  showHistory: false,
  loading: false,
  error: null,
};

/** Inputs for {@link hydratePartial}: persisted storage + active-tab state. */
export interface HydrateInputs {
  settings: Settings;
  history: Scheme[];
  /** Saved GLOBAL favorites. */
  favorites: Favorite[];
  origin: string | null;
  site: SiteState;
  /** Whether the active tab already has a Thememaker style applied. */
  applied: boolean;
}

/**
 * Computes the popup's initial state patch from persisted storage + the active
 * tab. Crucially it restores this origin's saved theme as `current` (with its
 * saved intensity) so the intensity slider / details / re-apply work after a
 * reload or a popup reopen on a persisted site: the popup is recreated every
 * time it opens, so without this `current` is null and the slider is a no-op
 * even though the content script already themed the page.
 */
export const hydratePartial = (inputs: HydrateInputs): Partial<PopupState> => {
  const savedScheme = inputs.site.savedScheme ?? null;
  const savedIntensity = savedScheme?.schemeDetails?.intensity;
  return {
    mode: inputs.settings.mode,
    // Prefer the saved scheme's intensity so the dial matches what is on the
    // page; clamp to the selectable range (migrates old/out-of-range values).
    intensity: clampIntensity(savedIntensity ?? inputs.settings.intensity),
    seed: inputs.settings.seed,
    useRandomSeed: inputs.settings.useRandomSeed,
    favorites: inputs.favorites,
    history: inputs.history,
    origin: inputs.origin,
    siteEnabled: inputs.site.enabled,
    applied: inputs.applied,
    current: savedScheme,
    // Restore the saved custom-theme overrides so reopening the popup on a
    // persisted site shows (and keeps re-applying) the user's picks.
    overrides: savedScheme?.schemeDetails?.overrides ?? {},
  };
};

export type PopupAction =
  | { type: "hydrate"; partial: Partial<PopupState> }
  | { type: "selectMode"; mode: ModeSelection }
  | { type: "selectIntensity"; intensity: Intensity }
  | { type: "setSeed"; seed: string }
  | { type: "toggleRandomSeed" }
  | { type: "setFavorites"; favorites: Favorite[] }
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
  | { type: "toggleCustomize" }
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
    case "setSeed":
      // Choosing a seed implies the user wants THAT color, not a random one.
      return { ...state, seed: action.seed, useRandomSeed: false };
    case "toggleRandomSeed":
      return { ...state, useRandomSeed: !state.useRandomSeed };
    case "setFavorites":
      return { ...state, favorites: action.favorites };
    case "applyFavorite":
      // A favorite becomes the current scheme (so the slider / Apply / Details
      // act on it) and is marked applied; history is untouched. Its saved custom
      // overrides become the live editor state.
      return {
        ...state,
        current: action.scheme,
        applied: true,
        error: null,
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
    case "toggleCustomize":
      return { ...state, showCustomize: !state.showCustomize };
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

/** @returns the friendly label for a scheme history entry. */
export const historyLabel = (scheme: Scheme, index: number): string => {
  const { rootColorName, rootColor, colorMode } = scheme.schemeDetails;
  // Fall back to naming the root color on the fly so legacy entries (saved
  // before names were stored) show a real name instead of "scheme".
  const name = rootColorName ?? describeColor(rootColor);
  return `${index + 1}. ${name} (${colorMode})`;
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

/** A human label for an override row's role key (e.g. `textPrimary` → "Body text"). */
const OVERRIDE_ROLE_LABELS: Record<string, string> = {
  bg: "Page background",
  surface: "Card surface",
  surfaceAlt: "Code surface",
  textPrimary: "Body text",
  textSecondary: "Muted text",
  heading: "Headings",
  link: "Links",
  primary: "Primary button",
  secondary: "Secondary button",
  border: "Borders",
  accent: "Accents",
};

export const overrideRoleLabel = (role: string): string =>
  OVERRIDE_ROLE_LABELS[role] ?? role;

/**
 * The base (generated) color for an override-key from the current scheme's
 * palette, used to SEED a color input when the user hasn't overridden it yet.
 * Falls back to a neutral gray when the scheme/palette is absent.
 */
export const baseColorForRole = (state: PopupState, role: string): string => {
  const roles = state.current?.schemeDetails?.palette?.roles as
    | Record<string, string>
    | undefined;
  return roles?.[role] ?? "#808080";
};

/**
 * The override rows to render in the customize panel: each currently-overridden
 * role with its picked color, in insertion order.
 */
export const overrideRows = (
  state: PopupState,
): Array<{ role: string; color: string; label: string }> =>
  Object.entries(state.overrides).map(([role, color]) => ({
    role,
    color,
    label: overrideRoleLabel(role),
  }));

/**
 * @returns the default favorite name for a scheme: its color name + mode (the
 * same friendly label the details/history derive), e.g. "Brandy Rose
 * (analogic-complement)". Used to pre-fill the save-favorite input.
 */
export const defaultFavoriteName = (scheme: Scheme): string => {
  const { rootColorName, rootColor, colorMode } = scheme.schemeDetails;
  const name = rootColorName ?? describeColor(rootColor);
  return `${name} (${colorMode})`;
};
