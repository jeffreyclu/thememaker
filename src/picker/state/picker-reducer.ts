/**
 * The picker's overrides reducer — the immutable state machine for the live
 * override map (mirrors the popup's reducer files).
 *
 * A pick seeds a new key with the element's current color, clear/clear-all drop
 * keys, and a re-seed replaces the whole map (the popup's APPLY_LIVE); every
 * transition returns the same reference on a no-op. `mergeColor` applies an
 * explicit, validated color edit (the uncontrolled color input's live value).
 */
import { isHexColor, normalizeHex } from "../../lib/color";
import { FALLBACK_COLOR } from "../../lib/overrides";
import type { RoleOverrides } from "../../types";

/** An overrides state transition (immutable). */
export type OverridesAction =
  | { type: "pick"; key: string; currentColor: string }
  | { type: "clearRole"; key: string }
  | { type: "clearAll" }
  | { type: "reseed"; overrides: RoleOverrides };

/** The overrides state machine — immutable; returns the same ref on a no-op. */
export const overridesReducer = (
  state: RoleOverrides,
  action: OverridesAction,
): RoleOverrides => {
  switch (action.type) {
    case "pick": {
      // Seed a new key with the element's current color (no jarring jump);
      // re-picking an existing key keeps its value.
      if (action.key in state) {
        return state;
      }
      const seed = isHexColor(action.currentColor)
        ? normalizeHex(action.currentColor)
        : FALLBACK_COLOR;
      return { ...state, [action.key]: seed };
    }
    case "clearRole": {
      if (!(action.key in state)) {
        return state;
      }
      const next = { ...state };
      delete next[action.key];
      return next;
    }
    case "clearAll":
      return {};
    case "reseed":
      return action.overrides;
  }
};

/** Merge an explicit (validated, normalized) color edit; invalid hex ignored. */
export const mergeColor = (
  state: RoleOverrides,
  key: string,
  color: string,
): RoleOverrides =>
  isHexColor(color) ? { ...state, [key]: normalizeHex(color) } : state;
