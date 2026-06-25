/**
 * The mode selection type + seed/mode resolution for generation.
 *
 * Pure + total (never throws), DOM-free and `chrome.*`-free. The dropdown value
 * ("random" or a concrete color mode) and the helpers that turn it — plus an
 * optional chosen seed — into a concrete `{ seed, mode }` for a generate request.
 */
import { modes } from "../../config";
import { isHexColor, normalizeHex } from "../color/color";
import { paletteGenerator } from "../palette";
import type { ColorMode } from "../../types";

/** The mode dropdown's value: a concrete color mode, or "random". */
export type ModeSelection = ColorMode | "random";

/** @returns the candidate mode list for a selection ("random" → all modes). */
export const modesForSelection = (selection: ModeSelection): string[] =>
  selection === "random" ? modes : [selection];

/** Picks a concrete mode for a selection ("random" → a random configured mode). */
export const resolveMode = (selection: ModeSelection): ColorMode =>
  selection === "random" ? paletteGenerator.randomMode(modes) : selection;

/**
 * Resolves the concrete seed hex Generate should use: a valid chosen seed
 * (normalized to `#rrggbb`), else a fresh random color. Pure + total.
 */
export const resolveSeed = (seed?: string): string =>
  seed && isHexColor(seed) ? normalizeHex(seed) : paletteGenerator.randomSeed();
