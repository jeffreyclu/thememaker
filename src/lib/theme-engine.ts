/**
 * Pure theming logic, extracted from the legacy `Thememaker` class.
 *
 * Nothing here touches `chrome.*` or injects DOM. It is fully unit-testable
 * under jsdom. The *application* of a scheme to a page lives in the injectable
 * function in `src/lib/inject.ts`; this module only computes the CSS string and
 * scheme objects that injection consumes.
 *
 * Phase 2 note: this is the seam where role detection / contrast enforcement
 * will plug in. `buildSchemeStyle` currently keys purely off tag-name buckets
 * (`isContainerElement`). A future engine swaps that for computed-style /
 * luminance role detection while keeping the same CSS-string output shape.
 */
import {
  htmlElements as defaultHtmlElements,
  modes,
  MAX_HISTORY,
} from "../config";
import type { ColorMode, HtmlElements, Scheme, SchemeDetails } from "../types";

/** The shape returned by thecolorapi.com `/scheme` endpoint (subset we use). */
export interface ColorApiResponse {
  colors?: Array<{ hex?: { value?: string } }>;
  seed?: { name?: { value?: string } };
}

/** @returns a random integer between min and max (inclusive). */
export const randomNum = (min: number, max: number): number =>
  Math.floor(Math.random() * (max - min + 1)) + min;

/** @returns a 6-char hexadecimal color string (no leading '#'). */
export const randomHexColor = (): string =>
  Math.floor(Math.random() * 16777215)
    .toString(16)
    .padStart(6, "0");

/** @returns a random color mode from the supplied list. */
export const randomMode = (availableModes: ColorMode[] = modes): ColorMode =>
  availableModes[randomNum(0, availableModes.length - 1)];

/** @returns the number of distinct colors a scheme needs. */
export const calculateTotalColors = (
  elements: HtmlElements = defaultHtmlElements,
): number => Object.keys(elements).length;

/** @returns a valid thecolorapi.com `/scheme` URL for the given seed. */
export const generateColorApiUrl = (
  schemeDetails: SchemeDetails,
  format: string,
  elements: HtmlElements = defaultHtmlElements,
): string => {
  const { rootColor, colorMode } = schemeDetails;
  const totalColors = calculateTotalColors(elements);
  return (
    "https://www.thecolorapi.com/scheme" +
    `?hex=${rootColor}&mode=${colorMode}` +
    `&format=${format}&count=${totalColors}`
  );
};

export interface FetchColorsResult {
  colors: string[];
  rootColorName?: string;
}

/**
 * Fetches colors from thecolorapi.com and parses them into a flat hex array,
 * plus the seed color's friendly name.
 *
 * Preserves the legacy failure mode: on any error it logs and returns
 * `undefined` (callers handle the absence of colors). This is deliberately the
 * same swallowed-error behavior as before — Phase 2 hardens it.
 */
export const fetchColors = async (
  colorApiUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<FetchColorsResult | undefined> => {
  try {
    const resp = await fetchImpl(colorApiUrl);
    const data = (await resp.json()) as ColorApiResponse;

    if (!data.colors) {
      throw new Error("invalid color data");
    }

    const colors: string[] = [];
    data.colors.forEach((colorObj) => {
      colors.push(colorObj?.hex?.value as string);
    });

    return { colors, rootColorName: data?.seed?.name?.value };
  } catch (e) {
    console.error(e);
    return undefined;
  }
};

/** @returns true if `element` is one of the "container" (background) tags. */
export const isContainerElement = (
  element: string,
  elements: HtmlElements = defaultHtmlElements,
): boolean =>
  elements.darkContainer.includes(element) ||
  elements.mediumContainer.includes(element) ||
  elements.lightContainer.includes(element);

/** @returns true if `element` is one of the text-role tags. */
export const isTextElement = (
  element: string,
  elements: HtmlElements = defaultHtmlElements,
): boolean =>
  elements.darkText.includes(element) ||
  elements.mediumText.includes(element) ||
  elements.lightText.includes(element);

/**
 * Maps a flat array of hex colors onto tag names, producing a `Scheme`.
 *
 * @param colorArr flat array of hex colors (one per html-element bucket)
 * @param schemeDetails seed metadata stored under the `schemeDetails` key
 */
export const generateScheme = (
  colorArr: string[],
  schemeDetails: SchemeDetails,
  elements: HtmlElements = defaultHtmlElements,
): Scheme => {
  const colorScheme = { schemeDetails } as Scheme;

  const buckets = Object.values(elements);
  const totalColors = calculateTotalColors(elements);

  for (let i = 0; i < totalColors; i += 1) {
    const bucket = buckets[i];
    const color = colorArr[i];
    bucket.forEach((element) => {
      colorScheme[element] = color;
    });
  }

  return colorScheme;
};

/**
 * Builds the CSS string applied to a page for a scheme. This is the exact
 * styling the legacy `applyScheme` produced, MINUS the hardcoded extension-UI
 * color hack (which is gone because the UI no longer lives in the page).
 *
 * Pure: returns a string; injection writes it into a <style> element.
 */
export const buildSchemeStyle = (
  scheme: Scheme,
  elements: HtmlElements = defaultHtmlElements,
): string => {
  let schemeStyle = "";
  for (const [key, value] of Object.entries(scheme)) {
    if (key === "schemeDetails") {
      continue;
    }
    if (isContainerElement(key, elements)) {
      schemeStyle += `${key} { color: ${scheme["p"] as string} !important; background-color: ${value as string} !important; }`;
    } else {
      schemeStyle += `${key} { color: ${value as string} !important; background-color: transparent !important; background-image: none !important; }`;
    }
  }
  return schemeStyle;
};

/**
 * Enqueues a scheme into a bounded history queue (most-recent at the end),
 * returning a NEW array (pure — no mutation of the input).
 */
export const enqueueScheme = (
  history: Scheme[],
  scheme: Scheme,
  max: number = MAX_HISTORY,
): Scheme[] => {
  const next = [...history, scheme];
  while (next.length > max) {
    next.shift();
  }
  return next;
};

/**
 * @returns the scheme at `index`, or `null` if the index is out of range /
 * the history is empty.
 */
export const dequeueScheme = (
  history: Scheme[],
  index: number,
): Scheme | null => {
  if (index >= 0 && index < history.length) {
    return history[index];
  }
  return null;
};

export interface GenerateSchemeResult {
  scheme: Scheme;
  details: SchemeDetails;
}

/**
 * Orchestrates a full random scheme generation: seed → API → scheme object.
 * Returns `undefined` if the API call fails (legacy failure mode preserved).
 */
export const generateRandomScheme = async (
  fetchImpl: typeof fetch = fetch,
  availableModes: ColorMode[] = modes,
  elements: HtmlElements = defaultHtmlElements,
): Promise<GenerateSchemeResult | undefined> => {
  const seedDetails: SchemeDetails = {
    rootColor: randomHexColor(),
    colorMode: randomMode(availableModes),
  };

  const url = generateColorApiUrl(seedDetails, "json", elements);
  const fetched = await fetchColors(url, fetchImpl);

  if (!fetched) {
    return undefined;
  }

  const details: SchemeDetails = {
    ...seedDetails,
    rootColorName: fetched.rootColorName,
  };

  const scheme = generateScheme(fetched.colors, details, elements);
  return { scheme, details };
};
