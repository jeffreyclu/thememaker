/**
 * The picker's STATE PROVIDER — the single home for the live session state the
 * vanilla `picker` object used to hold: the `overrides` map, the `palette`, and
 * the `intensity`.
 *
 * The override-map transitions (the former `picker-panel-model` —
 * `withPickedRole` / `withRoleColor` / `withoutRole`) ARE the overrides state
 * machine, so they live HERE as the {@link overridesReducer}: a pick seeds a NEW
 * key with the element's current color, clear/clear-all drop keys, and a re-seed
 * replaces the whole map (the popup's APPLY_LIVE). All transitions are immutable.
 *
 * Split by UPDATE FREQUENCY into two contexts so consumers re-render minimally:
 *  - `PickerStateContext` holds the fast-changing `overrides` map (the rows
 *    re-render as the user picks/clears) plus the host's `onClose`;
 *  - `PickerActionsContext` exposes STABLE writers + a live-theme accessor the
 *    apply/persist hooks use without re-subscribing.
 *
 * Two ways the overrides advance, mirroring the vanilla panel exactly:
 *  - `dispatch` (pick / clear / clear-all / re-seed) → the rows re-render;
 *  - `patchColor` updates ONLY the live ref, NOT state → NO re-render. The row
 *    color input is uncontrolled, so a color drag must not remount it (that would
 *    close the native dialog); the new color still reaches the next apply/persist
 *    through the ref.
 */
import {
  createContext,
  useContext,
  useMemo,
  useReducer,
  useRef,
  type Dispatch,
  type ReactElement,
  type ReactNode,
} from "react";

import { isHexColor, normalizeHex } from "../../lib/color/color";
import { FALLBACK_COLOR } from "../../lib/override-keys";
import type { Palette } from "../../lib/palette";
import type { RoleOverrides } from "../../types";

/** The current live theme the apply/persist hooks read (via a ref accessor). */
export interface PickerTheme {
  palette: Palette;
  intensity: number;
  overrides: RoleOverrides;
}

/** An overrides state transition (the former immutable model functions). */
export type OverridesAction =
  | { type: "pick"; key: string; currentColor: string }
  | { type: "clearRole"; key: string }
  | { type: "clearAll" }
  | { type: "reseed"; overrides: RoleOverrides };

/** The overrides state machine — immutable; returns the SAME ref on a no-op. */
export const overridesReducer = (
  state: RoleOverrides,
  action: OverridesAction,
): RoleOverrides => {
  switch (action.type) {
    case "pick": {
      // Seed a NEW key with the element's current color (no jarring jump);
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

interface PickerActions {
  /** Apply an overrides transition AND re-render (pick / clear / clear-all). */
  dispatch: Dispatch<OverridesAction>;
  /** Advance the live color for apply/persist WITHOUT re-rendering (drag). */
  patchColor: (key: string, color: string) => void;
  /** The live theme (palette + intensity + latest overrides). */
  getTheme: () => PickerTheme;
  /** Host (shim) callback that hides the picker — Done / Esc delegate here. */
  onClose: () => void;
}

interface PickerState {
  overrides: RoleOverrides;
  onClose: () => void;
}

const PickerStateContext = createContext<PickerState | null>(null);
const PickerActionsContext = createContext<PickerActions | null>(null);

export const PickerProvider = ({
  palette,
  intensity,
  overrides: seedOverrides,
  onClose,
  children,
}: {
  palette: Palette;
  intensity: number;
  overrides: RoleOverrides;
  onClose: () => void;
  children: ReactNode;
}): ReactElement => {
  const [overrides, dispatch] = useReducer(overridesReducer, seedOverrides);

  // RE-SEED on prop change (the popup's APPLY_LIVE pushes new overrides). A
  // render-phase dispatch (React re-renders immediately, no extra commit) keeps
  // this to the rare re-seed via the identity compare — not every render.
  const seedRef = useRef(seedOverrides);
  if (seedRef.current !== seedOverrides) {
    seedRef.current = seedOverrides;
    dispatch({ type: "reseed", overrides: seedOverrides });
  }

  // The live overrides for apply/persist — diverges from `overrides` state only
  // during an uncontrolled color drag (`patchColor`), re-synced on every render.
  const liveOverridesRef = useRef<RoleOverrides>(overrides);
  liveOverridesRef.current = overrides;

  // Current palette/intensity for the live-theme accessor (no re-subscribe).
  const themeRef = useRef({ palette, intensity });
  themeRef.current = { palette, intensity };

  const actions = useMemo<PickerActions>(
    () => ({
      dispatch,
      patchColor: (key, color) => {
        liveOverridesRef.current = mergeColor(
          liveOverridesRef.current,
          key,
          color,
        );
      },
      getTheme: () => ({
        palette: themeRef.current.palette,
        intensity: themeRef.current.intensity,
        overrides: liveOverridesRef.current,
      }),
      onClose,
    }),
    [onClose],
  );

  const state = useMemo<PickerState>(
    () => ({ overrides, onClose }),
    [overrides, onClose],
  );

  return (
    <PickerActionsContext.Provider value={actions}>
      <PickerStateContext.Provider value={state}>
        {children}
      </PickerStateContext.Provider>
    </PickerActionsContext.Provider>
  );
};

/** The live overrides map + host close. Throws outside the provider. */
export const usePickerState = (): PickerState => {
  const state = useContext(PickerStateContext);
  if (!state) {
    throw new Error("usePickerState must be used within a PickerProvider");
  }
  return state;
};

/** The stable writers + live-theme accessor. Throws outside the provider. */
export const usePickerActions = (): PickerActions => {
  const actions = useContext(PickerActionsContext);
  if (!actions) {
    throw new Error("usePickerActions must be used within a PickerProvider");
  }
  return actions;
};
