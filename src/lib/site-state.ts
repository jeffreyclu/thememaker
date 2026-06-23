/**
 * Pure per-site state reducer.
 *
 * The per-site toggle is wired in the popup and persisted in `chrome.storage`
 * (see `ThememakerStorage.getSiteState`/`setSiteState`). Phase 3 consumes the
 * `enabled` flag for auto-reapply via optional host permissions. For Phase 1 we
 * only need correct, testable state transitions — no dynamic content-script
 * registration.
 */
import type { Scheme } from "../types";
import type { SiteState } from "./storage";

export type SiteAction =
  | { type: "enable" }
  | { type: "disable" }
  | { type: "toggle" }
  | { type: "rememberScheme"; scheme: Scheme }
  | { type: "forgetScheme" };

/** Pure reducer: given current per-site state and an action, return the next. */
export const siteStateReducer = (
  state: SiteState,
  action: SiteAction,
): SiteState => {
  switch (action.type) {
    case "enable":
      return { ...state, enabled: true };
    case "disable":
      // Disabling a site forgets its remembered scheme so a later re-enable is
      // a clean slate (matches "off means off").
      return { ...state, enabled: false, savedScheme: undefined };
    case "toggle":
      return state.enabled
        ? siteStateReducer(state, { type: "disable" })
        : siteStateReducer(state, { type: "enable" });
    case "rememberScheme":
      return { ...state, savedScheme: action.scheme };
    case "forgetScheme":
      return { ...state, savedScheme: undefined };
    default:
      return state;
  }
};
