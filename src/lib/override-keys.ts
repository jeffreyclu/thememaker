/**
 * The `<tag>|<prop>` override-key grammar — the single source of truth shared by
 * the element picker (which produces keys), the engine's override layer (which
 * parses them into CSS), and the popup/panel rows (which label them).
 *
 * An override key is one of:
 *  - `<tag>|<prop>` — a per-tag override, prop ∈ {"background","color"} (e.g.
 *    `div|background`, `h3|color`). `<tag>` is a lowercase HTML tag name, with
 *    `page` as a sentinel for the page base (html/body).
 *  - a bare role key (e.g. `textPrimary`, `bg`) — a generated-scheme role the
 *    popup's customize panel can override; these have no `|`.
 *
 * No DOM, no `chrome.*` — pure string logic so every consumer (popup, picker
 * panel, engine) shares one grammar instead of re-deriving it.
 */
import { isHexColor, normalizeHex } from "./color/color";
import type { RoleOverrides } from "../types";

/** Neutral fallback when a picked element's current color can't be parsed. */
export const FALLBACK_COLOR = "#808080";

/** A parsed override key: either a bare role, or a `<tag>|<prop>` pair. */
export interface ParsedOverrideKey {
  /** The tag/sentinel before the `|`, or null for a bare role key. */
  tag: string | null;
  /** The prop after the `|`, or null for a bare role key. */
  prop: string | null;
  /** The original role/tag part used as a fallback label (no-bar keys). */
  role: string;
}

/** Parses an override key into its `<tag>|<prop>` parts. */
export const parseOverrideKey = (key: string): ParsedOverrideKey => {
  const bar = key.indexOf("|");
  if (bar < 0) {
    return { tag: null, prop: null, role: key };
  }
  return { tag: key.slice(0, bar), prop: key.slice(bar + 1), role: key };
};

/** Builds the per-tag override key for a tag + prop: `<tag>|<prop>`. */
export const makeOverrideKey = (
  tag: string,
  prop: "background" | "color",
): string => `${tag}|${prop}`;

/**
 * Options for {@link labelForOverrideKey}: each consumer supplies its own
 * no-bar role table and its own `page`-sentinel wording, so the shared parse +
 * generic `tag · prop` formatting serves both the popup and the picker panel
 * without changing either's output.
 */
export interface OverrideLabelOptions {
  /** Label table for bare role keys (no `|`); falls back to the key itself. */
  roleLabels?: Record<string, string>;
  /** The full label for the `page` sentinel tag (e.g. "Page background"). */
  pageLabel?: string;
}

/**
 * The human label for an override key. For a bare role key it looks up
 * `roleLabels` (falling back to the key); for a `<tag>|<prop>` key it formats
 * `tag · background|text`, with the `page` sentinel using `pageLabel`.
 */
export const labelForOverrideKey = (
  key: string,
  opts: OverrideLabelOptions = {},
): string => {
  const { tag, prop, role } = parseOverrideKey(key);
  if (tag === null) {
    return opts.roleLabels?.[role] ?? role;
  }
  if (tag === "page" && opts.pageLabel !== undefined) {
    return opts.pageLabel;
  }
  return `${tag} · ${prop === "background" ? "background" : "text"}`;
};

/** A single override row: the key, its label, and a (validated) color. */
export interface OverrideRow {
  /** The override key (named `role` for the panel's data attrs). */
  role: string;
  label: string;
  color: string;
}

/**
 * Maps an override map to rows in insertion order. `labelFor` lets each consumer
 * supply its own label wording; `validateColor` toggles the hex normalization
 * the picker panel needs (and the popup's raw passthrough).
 */
export const overrideRows = (
  overrides: RoleOverrides,
  labelFor: (key: string) => string,
  validateColor = false,
): OverrideRow[] =>
  Object.entries(overrides).map(([role, color]) => ({
    role,
    label: labelFor(role),
    color: validateColor
      ? isHexColor(color)
        ? normalizeHex(color)
        : FALLBACK_COLOR
      : color,
  }));
