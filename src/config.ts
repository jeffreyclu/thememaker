import type { ColorMode, HtmlElements } from "./types";

export const modes: ColorMode[] = [
  "monochrome",
  "monochrome-dark",
  "monochrome-light",
  "complement",
  "analogic-complement",
  "triad",
  "quad",
];

export const htmlElements: HtmlElements = {
  darkContainer: ["body", "main", "div"],
  mediumContainer: ["pre", "code"],
  lightContainer: ["button", "td", "th"],
  clearContainer: [
    "header",
    "footer",
    "article",
    "section",
    "aside",
    "nav",
    "tbody",
    "ul",
    "li",
  ],
  darkText: ["h4", "h5", "h6", "li"],
  mediumText: ["h3", "h2", "a", "ul"],
  lightText: ["h1", "p", "span"],
};

/** Max number of schemes retained in the persisted history queue. */
export const MAX_HISTORY = 10;
