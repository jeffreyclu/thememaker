/**
 * Bridge from the popup to the v2 (palette-based) engine.
 *
 * The popup CANNOT see the target page's computed styles, so it only generates
 * the PALETTE + OPTIONS; the adaptive detection/mapping/contrast/inject runs
 * in-page (see `inject.ts`). This module wires the dropdown selection to a
 * concrete seed + mode, resolves a palette from the online source
 * (thecolorapi.com, with caching) when the browser is online — falling back to
 * local generation offline or on any failure — and builds a lightweight display
 * `Scheme` for history/swatches.
 */
import { modes } from "../config";
import { describeColor } from "../lib/color/color-names";
import { isHexColor, normalizeHex } from "../lib/color/color";
import { paletteGenerator } from "../lib/palette";
import type { Palette, PaletteSourceDeps } from "../lib/palette";
import type { ModeSelection } from "./state";
import { DEFAULT_INTENSITY } from "../types";
import type {
  ApplyOptions,
  ColorMode,
  Intensity,
  RoleOverrides,
  Scheme,
  SchemeDetails,
} from "../types";

/**
 * @returns the candidate mode list the engine should pick from for a given
 * dropdown selection. "random" → all modes; a specific mode → just that one.
 */
export const modesForSelection = (selection: ModeSelection): string[] =>
  selection === "random" ? modes : [selection];

/** Picks a concrete mode for a selection ("random" → a random configured mode). */
export const resolveMode = (selection: ModeSelection): ColorMode =>
  selection === "random" ? paletteGenerator.randomMode(modes) : selection;

/**
 * Resolves the concrete seed hex Generate should use. When the caller supplies a
 * valid chosen seed it is honored (normalized to `#rrggbb`); otherwise — no
 * seed, or an unparseable one — we fall back to today's behavior of a fresh
 * RANDOM color. Pure + total: always returns a normalized `#rrggbb`.
 */
export const resolveSeed = (seed?: string): string =>
  seed && isHexColor(seed) ? normalizeHex(seed) : paletteGenerator.randomSeed();

/**
 * Builds a display-only `Scheme` from a palette so history/details panels keep
 * working. The palette + intensity ride along on `schemeDetails` so a history
 * entry can be re-applied (the in-page engine consumes the palette, not the
 * per-tag colors).
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
  // Surface the SOURCE-OF-TRUTH theme colors as a role-labeled `colors` map, so
  // the swatch/detail renderers show EXACTLY the colors the engine paints (a
  // swatch == a painted color), labeled by role, with no duplicates and a count
  // that matches the theme's real number of distinct colors.
  const colors: Record<string, string> = {};
  palette.themeColors.forEach((tc) => {
    colors[tc.role] = tc.color;
  });
  return { schemeDetails: details, colors };
};

export interface GeneratePaletteOptions {
  selection: ModeSelection;
  intensity: Intensity;
  /**
   * Use the online color source (thecolorapi.com) for this request. The caller
   * passes the browser's online status; when `true` the API is used (with a
   * built-in fallback to local generation on any failure), when `false`
   * generation is done locally with no network attempt.
   */
  online: boolean;
  /**
   * The user-chosen seed (`#rrggbb`). When absent or invalid, Generate falls
   * back to a fresh random color (today's behavior) via {@link resolveSeed}.
   */
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
 * Generates a palette for the current selection. Uses the online source
 * (thecolorapi.com, cached) when `online` is set, with a real fallback to local
 * generation on any failure; generates locally when offline. NEVER throws.
 */
export const generateForSelection = async (
  opts: GeneratePaletteOptions,
): Promise<GenerateResult> => {
  const mode = resolveMode(opts.selection);
  // Honor the chosen seed when provided + valid; otherwise pick a fresh random
  // color exactly as before.
  const seedHex = resolveSeed(opts.seed);

  const raw: Palette = opts.online
    ? await paletteGenerator.api(seedHex, mode, opts.deps)
    : paletteGenerator.local(seedHex, mode);
  // Invert (light↔dark) when requested; the slider still mutes from there.
  const palette = opts.invert ? paletteGenerator.invert(raw) : raw;

  // Name the seed locally so history/details show a real name (e.g. "Vivid
  // Blue") instead of the "scheme" placeholder.
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
 * Resolves the palette to (re)apply for a scheme: the one stored on it, or — for
 * legacy entries that predate Phase 2 — a fresh local palette regenerated from
 * its seed + mode. One place owns the legacy-fallback rule so every apply path
 * resolves palettes identically.
 */
const resolvePalette = (details: SchemeDetails): Palette =>
  details.palette ??
  paletteGenerator.local(details.rootColor, details.colorMode);

/**
 * Resolves the overrides to bake onto an apply payload: explicitly-passed
 * overrides (the popup's live editor state) win, falling back to whatever the
 * scheme persisted. Returns `undefined` for an absent OR empty map so callers
 * can drop the key — ONE place owns the "empty → no overrides" convention.
 */
const resolveOverrides = (
  details: SchemeDetails,
  overrides?: RoleOverrides,
): RoleOverrides | undefined => {
  const resolved = overrides ?? details.overrides;
  return resolved && Object.keys(resolved).length > 0 ? resolved : undefined;
};

/**
 * Inverts an existing scheme's palette (light↔dark) for the live Invert toggle,
 * preserving its intensity + overrides and flipping the stored `invert` flag.
 * Returns the scheme unchanged when it carries no palette.
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
 * Resolves the apply payload for an EXISTING scheme (e.g. re-applying a history
 * entry). Uses the palette stored on the scheme; regenerates one locally from
 * the seed + mode if the entry predates Phase 2. The current `intensity`
 * setting overrides any stored one so the toggle is always respected.
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
 * Stamps the CURRENT (live) intensity onto a scheme so the persisted per-site
 * `savedScheme` reapplies at exactly the look on screen — capturing the slider
 * position, not the intensity the scheme was generated with. The palette is
 * resolved (regenerated locally for legacy schemes) so the saved scheme always
 * carries a concrete palette the content script can reapply faithfully.
 */
export const schemeWithIntensity = (
  scheme: Scheme,
  intensity: Intensity,
  overrides?: RoleOverrides,
): Scheme => {
  const details = scheme.schemeDetails;
  const palette = resolvePalette(details);
  // Bake the live overrides (the custom-theme editor's picks) onto the saved
  // scheme so favorites + per-site reapply carry the custom theme. An explicit
  // (possibly empty) overrides arg replaces the stored one; omitting it keeps
  // whatever the scheme already had. An empty map drops the key to keep schemes
  // clean (no overrides → no key).
  const resolved = resolveOverrides(details, overrides);
  return {
    ...scheme,
    schemeDetails: {
      ...details,
      palette,
      intensity,
      overrides: resolved,
    },
  };
};
