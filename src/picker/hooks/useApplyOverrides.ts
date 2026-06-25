/**
 * `useApplyOverrides` — the panel's WRITE intents: editing a row's color,
 * clearing a role, or clearing all. Each advances the live overrides, applies the
 * result LIVE through the engine, and persists it onto this origin's saved scheme
 * (SERIALIZED, so overlapping color-drag writes can't lose an update). This is the
 * React home of the vanilla `applyAndPersist` + the `panelHandlers` color/clear.
 *
 * `onColorChange` uses `patchColor` (live ref, NO re-render): the row color input
 * is uncontrolled, so a drag must not remount it. `onClearRole`/`onClearAll`
 * `dispatch` so the rows repaint, exactly like the vanilla `render`. The reducer
 * derives the resulting map (single source of truth) so apply/persist see the
 * exact same state React commits.
 */
import { useMemo } from "react";

import { optionsFor } from "../client/apply-options";
import { persistOverrides } from "../client/persist-overrides";
import {
  mergeColor,
  overridesReducer,
  usePickerActions,
  type OverridesAction,
} from "../state/PickerProvider";
import { engine } from "../../lib/engine";
import type { RoleOverrides } from "../../types";

/** The three row intents the panel binds to. */
export interface ApplyIntents {
  onColorChange: (role: string, color: string) => void;
  onClearRole: (role: string) => void;
  onClearAll: () => void;
}

export const useApplyOverrides = (): ApplyIntents => {
  const { getTheme, dispatch, patchColor } = usePickerActions();

  return useMemo<ApplyIntents>(() => {
    const apply = (overrides: RoleOverrides): void => {
      const { palette, intensity } = getTheme();
      engine.applyWhenReady(palette, optionsFor(intensity, overrides));
      void persistOverrides({ palette, intensity, overrides });
    };
    // A clear/clear-all: dispatch + apply the reducer's resulting map.
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
    };
  }, [getTheme, dispatch, patchColor]);
};
