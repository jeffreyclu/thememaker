/**
 * Pure per-site state reducer + content-script load decision.
 *
 * The per-site toggle is wired in the popup and persisted in `chrome.storage`
 * (see `Storage.getSiteState`/`setSiteState`). The `enabled` flag + `savedScheme`
 * drive auto-reapply on every page load via the always-on content script
 * (`src/content/index.ts`), which calls `loadDecision` to decide whether to
 * paint and with what palette/options.
 *
 * Everything here is pure and testable: state transitions and the load
 * decision take plain data and return plain data — no DOM, no `chrome.*`.
 */
import type { ApplyOptions, Scheme } from "../../types";
import { clampIntensity, DEFAULT_INTENSITY } from "../../types";
import type { Palette } from "../palette";
import type { SiteState } from "../storage";

// `enable` is the only transition the app dispatches. The popup owns the "full
// reset" (off + forget) and writes that state directly (see popup `onReset`), so
// no `disable`/`forget` reducer action is needed.
export type SiteAction = { type: "enable"; scheme?: Scheme };

/** Pure reducer: given current per-site state and an action, return the next. */
export const siteStateReducer = (
  state: SiteState,
  action: SiteAction,
): SiteState => {
  switch (action.type) {
    case "enable": {
      // Enabling persists the currently-applied scheme (when supplied) so the
      // content script can faithfully reapply it on the next load. If no scheme
      // is supplied, keep whatever was already remembered (no `savedScheme` key
      // is added when there is nothing to remember).
      const savedScheme = action.scheme ?? state.savedScheme;
      return savedScheme === undefined
        ? { ...state, enabled: true }
        : { ...state, enabled: true, savedScheme };
    }
    default:
      return state;
  }
};

/**
 * The content-script LOAD DECISION, as a pure function.
 *
 * Given an origin's persisted `SiteState`, decide whether the always-on content
 * script should auto-reapply a theme on this page load, and with which palette +
 * options. Auto-apply requires both `enabled` and a saved scheme that carries a
 * concrete `palette` + `intensity` (so the reapply is faithful and needs no
 * regeneration in the page).
 *
 * Pure: no DOM, no storage, no `chrome.*` — the content script reads storage,
 * passes the result here, and acts on the verdict. This is the unit-tested core
 * of the auto-reapply path.
 */
export type LoadDecision =
  | { apply: false }
  | { apply: true; palette: Palette; options: ApplyOptions };

export const loadDecision = (
  state: SiteState | undefined | null,
): LoadDecision => {
  if (!state || !state.enabled) {
    return { apply: false };
  }
  const details = state.savedScheme?.schemeDetails;
  const palette = details?.palette;
  // A faithful reapply needs a concrete palette. Entries without a palette are
  // skipped rather than guessed — the popup re-saves a full palette on the next
  // apply.
  if (!palette) {
    return { apply: false };
  }
  // Clamp the saved intensity into the selectable range; default if absent.
  const intensity = clampIntensity(details?.intensity ?? DEFAULT_INTENSITY);
  // Carry any saved per-role overrides so the auto-reapply restores the custom
  // theme too (the engine AA-floors them just like the generated colors).
  const overrides = details?.overrides;
  const options: ApplyOptions =
    overrides && Object.keys(overrides).length > 0
      ? { intensity, overrides }
      : { intensity };
  return { apply: true, palette, options };
};
