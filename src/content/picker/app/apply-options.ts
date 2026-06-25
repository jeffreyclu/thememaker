/**
 * Pure derivation of the engine {@link ApplyOptions} from the picker's live
 * theme: intensity always, `overrides` ONLY when non-empty (its absence is the
 * "no overrides" convention the persist + `loadDecision` share).
 */
import type { ApplyOptions, RoleOverrides } from "../../../types";

export const optionsFor = (
  intensity: number,
  overrides: RoleOverrides,
): ApplyOptions =>
  Object.keys(overrides).length > 0 ? { intensity, overrides } : { intensity };
