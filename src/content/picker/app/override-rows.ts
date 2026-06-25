/**
 * PURE view derivation for the picker rows: maps the live overrides map to the
 * rows the panel renders, with the picker's label wording (`<tag> · background`/
 * `· text`, and the `page` sentinel as "Page · background"). Validates/normalizes
 * each stored hex so an invalid value falls back to a neutral swatch.
 *
 * A thin app-folder wrapper over the SHARED `lib/override-keys` primitives (the
 * popup uses the same row/label builders) — distinct from the overrides state
 * MACHINE in `PickerProvider`: this is read-only presentation, not a transition.
 */
import {
  labelForOverrideKey,
  overrideRows as overrideRowsBase,
  type OverrideRow,
} from "../../../lib/override-keys";
import type { RoleOverrides } from "../../../types";

export type { OverrideRow };

/** A human label for a `<tag>|<prop>` override key, e.g. "div · background". */
export const roleLabel = (key: string): string =>
  labelForOverrideKey(key, { pageLabel: "Page · background" });

/** Rows to render, one per active override, in insertion order (hex validated). */
export const overrideRows = (overrides: RoleOverrides): OverrideRow[] =>
  overrideRowsBase(overrides, roleLabel, true);
