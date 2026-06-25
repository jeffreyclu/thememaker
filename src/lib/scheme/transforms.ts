/**
 * Pure scheme transforms — the scheme domain the popup's state machine and its
 * action hooks build on.
 *
 * The popup cannot see the target page's computed styles, so it only generates
 * the palette + options; the adaptive detection/mapping/contrast/inject runs
 * in-page. This module resolves a palette from the online source (cached) when
 * online — falling back to local generation offline or on any failure — and
 * builds the lightweight display `Scheme` (history/swatches) plus the
 * apply/persist transforms (`applyPayloadForScheme`, `schemeWithIntensity`,
 * `invertScheme`).
 *
 * Everything here is pure + total (never throws), DOM-free and `chrome.*`-free,
 * so it stays unit-testable and is shared by the content-script/persistence tests
 * that replay the popup's persist semantics.
 */
import { describeColor } from "../color/color-names";
import { paletteGenerator } from "../palette";
import type { Palette, PaletteSourceDeps } from "../palette";
import { DEFAULT_INTENSITY } from "../../types";
import type {
  ApplyOptions,
  Intensity,
  RoleOverrides,
  Scheme,
  SchemeDetails,
} from "../../types";
import { resolveMode, resolveSeed, type ModeSelection } from "./mode";

/**
 * Builds a display-only `Scheme` from a palette so history/details work. The
 * palette + intensity ride on `schemeDetails` so an entry can be re-applied (the
 * in-page engine consumes the palette, not the per-tag colors).
 */
export const schemeFromPalette = (
  palette: Palette,
  intensity: Intensity,
  rootColorName?: string,
): Scheme => {
  const details: SchemeDetails = {
    rootColor: palette.seed,
    colorMode: palette.mode,
    rootColorName,
    palette,
    intensity,
  };
  const colors: Record<string, string> = {};
  palette.themeColors.forEach((tc) => {
    colors[tc.role] = tc.color;
  });
  return { schemeDetails: details, colors };
};

export interface GeneratePaletteOptions {
  selection: ModeSelection;
  intensity: Intensity;
  /** Use the online color source for this request (with a local fallback). */
  online: boolean;
  /** The user-chosen seed (`#rrggbb`); random fallback when absent/invalid. */
  seed?: string;
  /** Injected source deps (fetch + cache) for the API path. */
  deps?: PaletteSourceDeps;
  /** Flip the generated palette light↔dark. */
  invert?: boolean;
}

export interface GenerateResult {
  palette: Palette;
  scheme: Scheme;
  options: ApplyOptions;
}

/**
 * Generates a palette for the current selection. Uses the online source (cached)
 * when `online`, with a fallback to local generation on any failure; generates
 * locally when offline. Never throws.
 */
export const generateForSelection = async (
  opts: GeneratePaletteOptions,
): Promise<GenerateResult> => {
  const mode = resolveMode(opts.selection);
  const seedHex = resolveSeed(opts.seed);

  const raw: Palette = opts.online
    ? await paletteGenerator.api(seedHex, mode, opts.deps)
    : paletteGenerator.local(seedHex, mode);
  const palette = opts.invert ? paletteGenerator.invert(raw) : raw;

  const scheme = schemeFromPalette(
    palette,
    opts.intensity,
    describeColor(palette.seed),
  );
  if (opts.invert) {
    scheme.schemeDetails.invert = true;
  }
  return { palette, scheme, options: { intensity: opts.intensity } };
};

/**
 * Resolves the palette to (re)apply: the one stored on the scheme, or — when a
 * scheme has none — a fresh local palette regenerated from its seed + mode.
 */
const resolvePalette = (details: SchemeDetails): Palette =>
  details.palette ??
  paletteGenerator.local(details.rootColor, details.colorMode);

/**
 * Resolves the overrides to bake onto an apply payload: explicit overrides win,
 * falling back to whatever the scheme persisted. `undefined` for an absent OR
 * empty map (callers drop the key — "empty → no overrides").
 */
const resolveOverrides = (
  details: SchemeDetails,
  overrides?: RoleOverrides,
): RoleOverrides | undefined => {
  const resolved = overrides ?? details.overrides;
  return resolved && Object.keys(resolved).length > 0 ? resolved : undefined;
};

/**
 * Inverts a scheme's palette (light↔dark) for the live Invert toggle, preserving
 * intensity + overrides and flipping `invert`. Unchanged when it has no palette.
 */
export const invertScheme = (scheme: Scheme): Scheme => {
  const details = scheme.schemeDetails;
  if (!details.palette) {
    return scheme;
  }
  const palette = paletteGenerator.invert(details.palette);
  const next = schemeFromPalette(
    palette,
    details.intensity ?? DEFAULT_INTENSITY,
    describeColor(palette.seed),
  );
  next.schemeDetails.overrides = details.overrides;
  next.schemeDetails.invert = !details.invert;
  return next;
};

/**
 * Resolves the apply payload for an existing scheme. Uses the stored palette;
 * regenerates one locally for entries without one. The current `intensity`
 * overrides any stored one so the toggle is always respected.
 */
export const applyPayloadForScheme = (
  scheme: Scheme,
  intensity: Intensity,
  overrides?: RoleOverrides,
): { palette: Palette; options: ApplyOptions } => {
  const details = scheme.schemeDetails;
  const palette = resolvePalette(details);
  const resolved = resolveOverrides(details, overrides);
  return {
    palette,
    options: resolved ? { intensity, overrides: resolved } : { intensity },
  };
};

/**
 * Stamps the live intensity + overrides onto a scheme so the persisted per-site
 * `savedScheme` reapplies at exactly the look on screen. The palette is resolved
 * (regenerated for schemes without one) so the saved scheme always carries a
 * concrete palette the content script can reapply faithfully.
 */
export const schemeWithIntensity = (
  scheme: Scheme,
  intensity: Intensity,
  overrides?: RoleOverrides,
): Scheme => {
  const details = scheme.schemeDetails;
  const palette = resolvePalette(details);
  const resolved = resolveOverrides(details, overrides);
  return {
    ...scheme,
    schemeDetails: { ...details, palette, intensity, overrides: resolved },
  };
};
