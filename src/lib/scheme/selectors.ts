/**
 * Read-only scheme selectors + scheme→view-model derivations.
 *
 * The pure, DOM-free read side of the scheme domain: it derives what a consumer
 * renders (override rows, details rows, swatches, history labels, the "already
 * saved?" dedupe check) from a `Scheme` (or a minimal snapshot) without touching
 * React or any state container. Unit-testable in isolation.
 */
import { describeColor } from "../color/color-names";
import {
  labelForOverrideKey,
  overrideRows as overrideRowsBase,
} from "../overrides";
import type { Favorite } from "../storage";
import type {
  Intensity,
  RoleOverrides,
  Scheme,
  SchemeDetails,
} from "../../types";

/** @returns the seed metadata for a scheme, if any. */
export const currentSchemeDetails = (
  scheme: Scheme | null,
): SchemeDetails | null => scheme?.schemeDetails ?? null;

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

/** A human label for an override row's role key (e.g. `textPrimary` → "Body text"). */
export const overrideRoleLabel = (role: string): string =>
  labelForOverrideKey(role, {
    roleLabels: OVERRIDE_ROLE_LABELS,
    pageLabel: "Page background",
  });

/** The override rows to render: each overridden role + its color, insertion order. */
export const overrideRows = (
  overrides: RoleOverrides,
): Array<{ role: string; color: string; label: string }> =>
  overrideRowsBase(overrides, overrideRoleLabel);

/** Order-independent signature of an override map. */
const overridesSig = (rec: Record<string, string>): string =>
  Object.keys(rec)
    .sort()
    .map((k) => `${k}=${rec[k]}`)
    .join(",");

/** A content signature for "what a Save would capture". */
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

/** The live look + saved favorites a {@link isCurrentSaved} check reads. */
export interface SavedCheckInput {
  current: Scheme | null;
  intensity: Intensity;
  overrides: RoleOverrides;
  favorites: Favorite[];
}

/**
 * Whether the current scheme — at the live intensity + overrides — is already a
 * favorite (by content). Drives the Save button's disabled state.
 */
export const isCurrentSaved = (snapshot: SavedCheckInput): boolean => {
  const cur = snapshot.current;
  if (!cur) {
    return false;
  }
  const sig = saveSignature(
    cur.schemeDetails,
    snapshot.intensity,
    snapshot.overrides,
  );
  return snapshot.favorites.some(
    (f) =>
      saveSignature(
        f.scheme.schemeDetails,
        f.scheme.schemeDetails.intensity ?? snapshot.intensity,
        f.scheme.schemeDetails.overrides ?? {},
      ) === sig,
  );
};

// ── Scheme → view-model derivations (pure, read scheme only) ────────────────

/** @returns the friendly label for a scheme history entry. */
export const historyLabel = (scheme: Scheme, index: number): string => {
  const { rootColorName, rootColor, colorMode } = scheme.schemeDetails;
  const name = rootColorName ?? describeColor(rootColor);
  return `${index + 1}. ${name} (${colorMode})`;
};

/** @returns details rows for a scheme: "tag,tag: #hex" grouped by color. */
export const schemeDetailRows = (
  scheme: Scheme,
): Array<{ tags: string; color: string }> => {
  const byColor: Record<string, string[]> = {};
  for (const [label, color] of Object.entries(scheme.colors ?? {})) {
    (byColor[color] ??= []).push(label);
  }
  return Object.entries(byColor).map(([color, tags]) => ({
    tags: tags.join(","),
    color,
  }));
};

/** @returns the distinct painted colors for a scheme (up to 5), in display order. */
export const schemeSwatches = (scheme: Scheme | null): string[] => {
  if (!scheme) {
    return [];
  }
  const seen: string[] = [];
  for (const color of Object.values(scheme.colors ?? {})) {
    if (!seen.includes(color)) {
      seen.push(color);
    }
  }
  return seen.slice(0, 5);
};

/** @returns the default favorite name for a scheme: its color name + mode. */
export const defaultFavoriteName = (scheme: Scheme): string => {
  const { rootColorName, rootColor, colorMode } = scheme.schemeDetails;
  const name = rootColorName ?? describeColor(rootColor);
  return `${name} (${colorMode})`;
};
