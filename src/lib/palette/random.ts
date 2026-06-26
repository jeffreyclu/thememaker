/**
 * Tiny pure RNG helpers for seeding a fresh theme.
 *
 * Nothing here touches `chrome.*` or the DOM; fully unit-testable. These are the
 * "Generate" entry points: a random seed color and a random color mode.
 */
import { modes } from "../../config";
import type { ColorMode } from "../../types";

/** @returns a random integer between `min` and `max` (inclusive). */
const randomInt = (min: number, max: number): number =>
  Math.floor(Math.random() * (max - min + 1)) + min;

/** @returns a random color as a normalized `#rrggbb` hex string. */
export const randomHexColor = (): string =>
  `#${Math.floor(Math.random() * 16777216)
    .toString(16)
    .padStart(6, "0")}`;

/** @returns a random {@link ColorMode} from the supplied list (defaults to all modes). */
export const randomMode = (availableModes: ColorMode[] = modes): ColorMode =>
  availableModes[randomInt(0, availableModes.length - 1)];
