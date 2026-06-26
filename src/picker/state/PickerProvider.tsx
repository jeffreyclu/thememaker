/**
 * The picker's state provider — holds the live session state: the `overrides`
 * map, the `palette`, and the `intensity`.
 *
 * The override-map transitions (`withPickedRole` / `withRoleColor` /
 * `withoutRole`) are the overrides state machine, so they live here as the
 * {@link overridesReducer}: a pick seeds a new key with the element's current
 * color, clear/clear-all drop keys, and a re-seed replaces the whole map (the
 * popup's APPLY_LIVE). All transitions are immutable.
 *
 * Split by update frequency into two contexts so consumers re-render minimally:
 *  - `PickerStateContext` holds the fast-changing `overrides` map (the rows
 *    re-render as the user picks/clears) plus the host's `onClose`;
 *  - `PickerActionsContext` exposes stable writers + a live-theme accessor the
 *    apply/persist hooks use without re-subscribing.
 *
 * Two ways the overrides advance:
 *  - `dispatch` (pick / clear / clear-all / re-seed) re-renders the rows;
 *  - `patchColor` updates only the live ref, not state, so it triggers no
 *    re-render. The row color input is uncontrolled, so a color drag must not
 *    remount it (that would close the native dialog); the new color still reaches
 *    the next apply/persist through the ref.
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

import { mergeColor, overridesReducer } from "./picker-reducer";
import type { OverridesAction } from "./picker-reducer";
import type { Palette } from "../../lib/palette";
import type { RoleOverrides } from "../../types";

/** The current live theme the apply/persist hooks read (via a ref accessor). */
export interface PickerTheme {
  palette: Palette;
  intensity: number;
  overrides: RoleOverrides;
}

interface PickerActions {
  /** Apply an overrides transition and re-render (pick / clear / clear-all). */
  dispatch: Dispatch<OverridesAction>;
  /** Advance the live color for apply/persist without re-rendering (drag). */
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

  // Re-seed on prop change (the popup's APPLY_LIVE pushes new overrides). A
  // render-phase dispatch (React re-renders immediately, no extra commit), gated
  // by the identity compare so it fires only on an actual re-seed.
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
