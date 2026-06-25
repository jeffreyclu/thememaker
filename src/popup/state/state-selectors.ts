/**
 * Pure SELECTORS over `PopupState` — the view-model reads the popup state turns
 * into for rendering (override rows/labels, the seed-metadata accessor, the
 * base-color seed for a role). Split out of `state.ts` so the reducer/model file
 * stays focused on transitions; these are read-only derivations.
 */
import {
  labelForOverrideKey,
  overrideRows as overrideRowsBase,
} from "../../lib/override-keys";
import type { PopupState } from ".";
import type { SchemeDetails } from "../../types";

/** @returns the seed metadata for the current scheme, if any. */
export const currentSchemeDetails = (state: PopupState): SchemeDetails | null =>
  state.current?.schemeDetails ?? null;

/** A human label for an override row's role key (e.g. `textPrimary` → "Body text"). */
const OVERRIDE_ROLE_LABELS: Record<string, string> = {
  bg: "Page background",
  surface: "Card surface",
  surfaceAlt: "Code surface",
  textPrimary: "Body text",
  textSecondary: "Muted text",
  heading: "Headings",
  link: "Links",
  primary: "Primary button",
  secondary: "Secondary button",
  border: "Borders",
  accent: "Accents",
};

export const overrideRoleLabel = (role: string): string =>
  labelForOverrideKey(role, {
    roleLabels: OVERRIDE_ROLE_LABELS,
    pageLabel: "Page background",
  });

/**
 * The base (generated) color for an override-key from the current scheme's
 * palette, used to SEED a color input when the user hasn't overridden it yet.
 * Falls back to a neutral gray when the scheme/palette is absent.
 */
export const baseColorForRole = (state: PopupState, role: string): string => {
  const roles = state.current?.schemeDetails?.palette?.roles as
    | Record<string, string>
    | undefined;
  return roles?.[role] ?? "#808080";
};

/**
 * The override rows to render in the customize panel: each currently-overridden
 * role with its picked color, in insertion order.
 */
export const overrideRows = (
  state: PopupState,
): Array<{ role: string; color: string; label: string }> =>
  overrideRowsBase(state.overrides, overrideRoleLabel);

/** Order-independent signature of a per-tag/role override map. */
const overridesSig = (rec: Record<string, string>): string =>
  Object.keys(rec)
    .sort()
    .map((k) => `${k}=${rec[k]}`)
    .join(",");

/**
 * A content signature for "what a Save would capture": the palette identity
 * (root color + mode + invert) plus the live intensity + overrides. Two schemes
 * with the same signature are the same favorite, regardless of object identity.
 */
const saveSignature = (
  details: { rootColor?: string; colorMode?: string; invert?: boolean },
  intensity: number,
  overrides: Record<string, string>,
): string =>
  [
    details.rootColor ?? "",
    details.colorMode ?? "",
    details.invert ? "inv" : "",
    intensity,
    overridesSig(overrides),
  ].join("|");

/**
 * Whether the current scheme — at the live intensity + overrides — is ALREADY in
 * favorites (by content). Drives the Save button's disabled state: you can't save
 * a duplicate, and Save re-enables only once something actually changes.
 */
export const isCurrentSaved = (state: PopupState): boolean => {
  const cur = state.current;
  if (!cur) {
    return false;
  }
  const sig = saveSignature(
    cur.schemeDetails,
    state.intensity,
    state.overrides,
  );
  return state.favorites.some(
    (f) =>
      saveSignature(
        f.scheme.schemeDetails,
        f.scheme.schemeDetails.intensity ?? state.intensity,
        f.scheme.schemeDetails.overrides ?? {},
      ) === sig,
  );
};
