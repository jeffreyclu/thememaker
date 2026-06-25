/**
 * Popup hydration: the initial state patch derived from persisted storage and
 * the active tab.
 */
import { clampIntensity } from "../../types";
import type { Scheme } from "../../types";
import type { Favorite, Settings, SiteState } from "../../lib/storage/storage";
import type { PopupState } from "./index";

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
 * Computes the popup's initial state patch. Restores this origin's saved theme
 * as `current` (with its saved intensity) so the intensity slider / details /
 * re-apply work after a reload or a popup reopen on a persisted site — the popup
 * is recreated each time it opens, so without this `current` is null.
 */
export const hydratePartial = (inputs: HydrateInputs): Partial<PopupState> => {
  const savedScheme = inputs.site.savedScheme ?? null;
  const saved = savedScheme?.schemeDetails;
  return {
    mode: inputs.settings.mode,
    // Prefer the saved scheme's intensity so the dial matches the page; clamp to
    // the selectable range.
    intensity: clampIntensity(saved?.intensity ?? inputs.settings.intensity),
    invert: saved?.invert ?? inputs.settings.invert ?? false,
    favorites: inputs.favorites,
    history: inputs.history,
    origin: inputs.origin,
    siteEnabled: inputs.site.enabled,
    applied: inputs.applied,
    current: savedScheme,
    // Restore saved custom-theme overrides so reopening on a persisted site
    // keeps re-applying the user's picks.
    overrides: saved?.overrides ?? {},
  };
};
