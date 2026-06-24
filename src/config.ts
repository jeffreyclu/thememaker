/**
 * Static product config: the color-mode list and the history bound.
 */
import type { ColorMode } from "./types";

/** The color modes offered in the popup, in display order. */
export const modes: ColorMode[] = [
  "monochrome",
  "monochrome-dark",
  "monochrome-light",
  "complement",
  "analogic-complement",
  "triad",
  "quad",
];

/** Max number of schemes retained in the persisted history queue. */
export const MAX_HISTORY = 10;
