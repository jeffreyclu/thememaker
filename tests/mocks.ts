import type { ApplyOptions, Scheme, SchemeDetails } from "../src/types";
import type { Palette } from "../src/lib/palette";

export const mockResponse = {
  mode: "analogic-complement",
  count: "7",
  colors: [
    { hex: { value: "#6F928B", clean: "6F928B" } },
    { hex: { value: "#759E96", clean: "759E96" } },
    { hex: { value: "#7CA9A1", clean: "7CA9A1" } },
    { hex: { value: "#B8AD86", clean: "B8AD86" } },
    { hex: { value: "#B5BA88", clean: "B5BA88" } },
    { hex: { value: "#A6BC89", clean: "A6BC89" } },
    { hex: { value: "#98BE8B", clean: "98BE8B" } },
  ],
  seed: {
    hex: { value: "#B98790", clean: "B98790" },
    name: {
      value: "Brandy Rose",
      closest_named_hex: "#BB8983",
      exact_match_name: false,
      distance: 519,
    },
  },
};

export const mockUrl =
  "https://www.thecolorapi.com/scheme?hex=B98790&mode=analogic-complement&count=7";
export const mockJsonUrl =
  "https://www.thecolorapi.com/scheme?hex=#B98790&mode=analogic-complement&format=json&count=7";
export const mockHtmlUrl =
  "https://www.thecolorapi.com/scheme?hex=#B98790&mode=analogic-complement&format=html&count=7";

export const mockColorArr = [
  "#6F928B",
  "#759E96",
  "#7CA9A1",
  "#B8AD86",
  "#B5BA88",
  "#A6BC89",
  "#98BE8B",
];

export const mockSchemeDetails: SchemeDetails = {
  rootColor: "#B98790",
  rootColorName: "Brandy Rose",
  colorMode: "analogic-complement",
};

/**
 * The scheme produced by `generateScheme(mockColorArr, mockSchemeDetails)`.
 * Tag -> color mapping is identical to the legacy fixture (only the key order
 * differs, which `toStrictEqual` ignores).
 */
export const mockScheme: Scheme = {
  schemeDetails: mockSchemeDetails,
  a: "#A6BC89",
  article: "#B8AD86",
  aside: "#B8AD86",
  body: "#6F928B",
  button: "#7CA9A1",
  code: "#759E96",
  div: "#6F928B",
  footer: "#B8AD86",
  h1: "#98BE8B",
  h2: "#A6BC89",
  h3: "#A6BC89",
  h4: "#B5BA88",
  h5: "#B5BA88",
  h6: "#B5BA88",
  header: "#B8AD86",
  li: "#B5BA88",
  main: "#6F928B",
  nav: "#B8AD86",
  p: "#98BE8B",
  pre: "#759E96",
  section: "#B8AD86",
  span: "#98BE8B",
  tbody: "#B8AD86",
  td: "#7CA9A1",
  th: "#7CA9A1",
  ul: "#A6BC89",
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

/** A fake `fetch` that always resolves `mockResponse`. */
export const fakeFetch = (async () =>
  Promise.resolve({
    json: () => Promise.resolve(mockResponse),
  })) as unknown as typeof fetch;

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
