/**
 * `useApplyOverrides` — the picker's apply + persist intents. Each advances the
 * live overrides, applies the result live through the engine (reusing the
 * palette), and persists it onto this origin's saved scheme (serialized, so
 * overlapping color-drag writes can't lose an update).
 *
 * `onColorChange` uses `patchColor` (live ref, no re-render): the row color input
 * is uncontrolled, so a drag must not remount it. `onClearRole`/`onClearAll`/
 * `pick` `dispatch` so the rows repaint. The reducer derives the resulting map
 * (single source of truth) so apply/persist see the exact state React commits.
 * `pick` is the one element-pick commit `usePickSession` calls.
 */
import { useMemo } from "react";

import {
  mergeColor,
  overridesReducer,
  usePickerActions,
  type OverridesAction,
} from "../state/PickerProvider";
import { engine } from "../../lib/engine";
import { persistOverrides } from "../../lib/persist-overrides";
import type { ApplyOptions, RoleOverrides } from "../../types";

/** Engine options from the live theme: `overrides` only when non-empty (its
 * absence is the "no overrides" convention the persist + `loadDecision` share). */
const optionsFor = (
  intensity: number,
  overrides: RoleOverrides,
): ApplyOptions =>
  Object.keys(overrides).length > 0 ? { intensity, overrides } : { intensity };

/** The intents the panel binds, plus the `pick` commit `usePickSession` calls. */
export interface ApplyIntents {
  onColorChange: (role: string, color: string) => void;
  onClearRole: (role: string) => void;
  onClearAll: () => void;
  pick: (key: string, currentColor: string) => void;
}

export const useApplyOverrides = (): ApplyIntents => {
  const { getTheme, dispatch, patchColor } = usePickerActions();

  return useMemo<ApplyIntents>(() => {
    const apply = (overrides: RoleOverrides): void => {
      const { palette, intensity } = getTheme();
      engine.applyWhenReady(palette, optionsFor(intensity, overrides));
      void persistOverrides({ palette, intensity, overrides });
    };
    // Dispatch a transition + apply the reducer's resulting map.
    const commit = (action: OverridesAction): void => {
      const next = overridesReducer(getTheme().overrides, action);
      dispatch(action);
      apply(next);
    };
    return {
      onColorChange: (role, color) => {
        patchColor(role, color);
        apply(mergeColor(getTheme().overrides, role, color));
      },
      onClearRole: (role) => commit({ type: "clearRole", key: role }),
      onClearAll: () => commit({ type: "clearAll" }),
      pick: (key, currentColor) => commit({ type: "pick", key, currentColor }),
    };
  }, [getTheme, dispatch, patchColor]);
};
