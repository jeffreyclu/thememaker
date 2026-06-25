import type { ApplyOptions, Scheme, SchemeDetails } from "../src/types";
import type { Palette } from "../src/lib/palette/palette";

export const mockSchemeDetails: SchemeDetails = {
  rootColor: "#B98790",
  rootColorName: "Brandy Rose",
  colorMode: "analogic-complement",
};

/**
 * A representative display `Scheme`: seed metadata plus the role-labeled
 * `colors` map the popup renders as swatches.
 */
export const mockScheme: Scheme = {
  schemeDetails: mockSchemeDetails,
  colors: {
    primary: "#6F928B",
    heading: "#98BE8B",
    link: "#A6BC89",
    accent: "#7CA9A1",
    secondary: "#759E96",
    text: "#B5BA88",
    surface: "#B8AD86",
  },
};

/** A second scheme for history/multi-entry assertions. */
export const mockScheme2: Scheme = {
  ...mockScheme,
  schemeDetails: {
    rootColor: "#112233",
    rootColorName: "Deep Blue",
    colorMode: "triad",
  },
};

/** A representative palette for Phase 2 apply/contract tests. */
export const mockPalette: Palette = {
  seed: "#6f928b",
  mode: "triad",
  // SOURCE OF TRUTH: distinct painted colors, primary (= seed) first.
  swatches: [
    "#6f928b",
    "#a12b43",
    "#314cb9",
    "#ccaf3e",
    "#cfe2ca",
    "#24423c",
    "#4a9438",
    "#d6e6e3",
    "#f0f4f3",
  ],
  // ascending luminance (dark → light)
  surfaces: ["#16201d", "#2c3f3a", "#6f928b", "#b9cdc8", "#e7eeec"],
  accents: ["#3a5a52", "#5a3a52", "#5a523a"],
  // Semantic roles, matching `generatePalette("#6f928b", "triad")`. `primary` is
  // the seed verbatim (the root color drives the page).
  roles: {
    bg: "#f0f4f3",
    surface: "#d6e6e3",
    surfaceAlt: "#d6bcdc",
    textPrimary: "#24423c",
    textSecondary: "#4a9438",
    heading: "#a12b43",
    link: "#314cb9",
    primary: "#6f928b",
    onPrimary: "#ffffff",
    secondary: "#cfe2ca",
    onSecondary: "#1a1a1a",
    border: "#a6c9c2",
    accent: "#ccaf3e",
  },
  themeColors: [
    { role: "primary", color: "#6f928b" },
    { role: "heading", color: "#a12b43" },
    { role: "link", color: "#314cb9" },
    { role: "accent", color: "#ccaf3e" },
    { role: "secondary", color: "#cfe2ca" },
    { role: "text", color: "#24423c" },
    { role: "muted", color: "#4a9438" },
    { role: "surface", color: "#d6e6e3" },
    { role: "background", color: "#f0f4f3" },
  ],
};

/** Default apply options for tests (mid-dial intensity). */
export const mockOptions: ApplyOptions = { intensity: 50 };
