/**
 * PURE adaptive mapping core.
 *
 * This is the heart of the v2 engine and the canonical, unit-tested reference
 * for the logic that runs IN THE PAGE. It takes synthetic "detected node"
 * records (what the in-page DOM-walk produces from `getComputedStyle`) plus a
 * palette + options, and returns the style DECISIONS and the CSS string to
 * inject. It NEVER touches the DOM, so classification → mapping → contrast is
 * testable by feeding fixtures.
 *
 * The live DOM-walk (`inject.ts`) is a thin adapter: it builds `DetectedNode[]`
 * and `:root` variables, then runs a SELF-CONTAINED port of this exact
 * algorithm (it can't import across the `executeScript` boundary). Keep the two
 * in lockstep; the tests here pin the behavior.
 *
 * ## Algorithm (two passes)
 *
 * The page's `<html>` and `<body>` ALWAYS receive a base surface background +
 * an AA-readable base text color — so the page background always changes and a
 * readable default is inherited everywhere.
 *
 *  - PASS 1 (surfaces): decide a NEW background for html, body, and every
 *    element that OWNS a non-transparent background. The new background is a
 *    BLEND from the element's ORIGINAL color toward the mapped palette surface,
 *    by the intensity factor. Borders are only painted at the top of the dial.
 *  - PASS 2 (text): for EVERY text-bearing node, compute its EFFECTIVE new
 *    background — the new (blended) background of the nearest ancestor-or-self
 *    that pass 1 themed, defaulting to the base — and set its color to a
 *    blended-but-AA-safe color against it. This makes invisible text impossible:
 *    contrast is enforced against the background that actually renders behind it.
 *
 * Intensity is a PERCENTAGE: "how much of the theme is applied versus the
 * original" (100 = fully themed; lower = tint toward the page's own colors). It
 * applies UNIFORMLY to every surface/text color, so the dial always has a
 * visible, continuous effect on every site. Text readability (pass 2) is ALWAYS
 * enforced regardless of intensity.
 */
import {
  luminanceBucket,
  mixHex,
  nudgeToAA,
  type LuminanceBucket,
} from "./color";
import type { Palette, PaletteRoles } from "./palette";
import type { ApplyOptions, Intensity } from "../types";

/**
 * The COARSE kind an element plays in the two-pass machinery: surfaces get a
 * background (pass 1), text gets a foreground against its effective bg (pass 2),
 * borders get a border color. This drives the pass split + effective-bg lookup.
 */
export type NodeRole = "surface" | "text" | "border";

/**
 * The FINE semantic role an element plays, used to pick which palette slot
 * colors it. This is what spends the whole palette: distinct roles get distinct
 * colors. Derived from `tagName` + lightweight signals (see `classifySemantic`).
 */
export type SemanticRole =
  | "heading" // h1, h2 (titles)
  | "subheading" // h3–h6 (section headers)
  | "body" // p, li, span, td — default reading text
  | "emphasis" // strong, em, b, i, mark, dfn — inline emphasis (accent hue)
  | "quote" // blockquote, q, cite — quoted text (its own hue)
  | "muted" // small, figcaption, time, caption, .muted-ish
  | "link" // a — its own accent
  | "primaryButton" // emphasised button (filled accent)
  | "secondaryButton" // subtler button (outlined/surface)
  | "code" // pre, code, kbd, samp surfaces
  | "card" // elevated/card surface (article, section, figure)
  | "banner" // header, nav — top-of-page chrome (its own tint)
  | "complementary" // aside, footer — side/bottom chrome (its own tint)
  | "surface" // generic non-page surface
  | "page" // html/body base surface
  | "divider"; // hr, border/divider

/**
 * A node detected in the page, reduced to what mapping needs. Produced in-page
 * via `getComputedStyle`; here we accept it as a fixture for testing.
 */
export interface DetectedNode {
  /** A CSS selector that targets this node (e.g. a generated data-attr). */
  selector: string;
  role: NodeRole;
  /**
   * The element's lowercased tag name (e.g. "h1", "a", "button", "pre"). Drives
   * semantic-role classification. Optional so legacy fixtures still type-check
   * (an absent tag falls back to a generic body/surface role).
   */
  tagName?: string;
  /**
   * A coarse "this is a button/CTA" signal the in-page walk computes from
   * tag/role/class (e.g. <button>, role="button", or .btn-like class). Lets the
   * pure core classify primary vs secondary buttons without re-deriving it.
   */
  buttonLike?: boolean;
  /**
   * Whether the in-page walk judged this a PRIMARY (emphasised) button. The
   * heuristic (documented at `classifyButton`) lives in the walk; the pure core
   * also re-derives it from class/text when this is absent so it is testable.
   */
  primary?: boolean;
  /** The button's text content (lowercased), used in primary/secondary heuristics. */
  text?: string;
  /** The element's class attribute (lowercased), used in button heuristics. */
  className?: string;
  /** The node's OWN background color, as hex, if non-transparent. */
  bgColor?: string;
  /** The node's text color, as hex, if resolvable. */
  textColor?: string;
  /** Relative luminance of the relevant color (bg for surfaces, text for text). */
  luminance: number;
  /**
   * Rendered area (px²) of the node. Retained for fixtures/telemetry; the blend
   * model no longer gates surfaces by area (every surface is repainted).
   */
  area?: number;
  /**
   * Index into the SAME `DetectedNode[]` of this node's nearest ancestor, or a
   * negative number / undefined when it has no detected ancestor (its effective
   * background then defaults to the base body background). This is how pass 2
   * resolves the effective background for text.
   */
  parent?: number;
}

/** A CSS custom property detected on `:root`, with its resolved value. */
export interface DetectedVar {
  name: string; // e.g. "--bg", "--color-text"
  value: string; // resolved hex (if it was a color)
}

/** A single resolved style decision the engine will emit as a CSS rule. */
export interface StyleDecision {
  selector: string;
  role: NodeRole;
  /** The fine semantic role this decision was colored from (telemetry/tests). */
  semantic?: SemanticRole;
  /** Background to apply (surfaces only). */
  background?: string;
  /** Text/foreground color to apply. AA-guaranteed against its background. */
  color?: string;
  /** Border color to apply (borders only). */
  borderColor?: string;
}

/** A `:root` variable remap decision. */
export interface VarDecision {
  name: string;
  value: string;
}

export interface MappingResult {
  /** Per-selector style decisions. */
  decisions: StyleDecision[];
  /** `:root` variable overrides (additive layer). */
  vars: VarDecision[];
  /** The assembled CSS string for the `<style id="themeMaker">` element. */
  css: string;
  /** Whether the variable-remap path was taken. */
  variableDriven: boolean;
  /** The base background applied to html/body (and inherited as the default). */
  baseBackground: string;
  /** The base text color, AA against the base background. */
  baseText: string;
}

/** The selectors the engine ALWAYS themes as the page's base surface. */
export const HTML_SELECTOR = "html";
export const BODY_SELECTOR = "body";

/** Maps a luminance bucket onto a surface color from the palette. */
const surfaceForBucket = (
  palette: Palette,
  bucket: LuminanceBucket,
): string => {
  const sorted = palette.surfaces; // ascending luminance (dark → light)
  if (sorted.length === 0) {
    return "#808080";
  }
  if (bucket === "dark") {
    return sorted[0];
  }
  if (bucket === "light") {
    return sorted[sorted.length - 1];
  }
  return sorted[Math.floor(sorted.length / 2)];
};

// ---- semantic role classification ---------------------------------------

const HEADING_TAGS = new Set(["h1", "h2"]);
const SUBHEADING_TAGS = new Set(["h3", "h4", "h5", "h6"]);
const MUTED_TAGS = new Set([
  "small",
  "figcaption",
  "caption",
  "time",
  "cite",
  "label",
]);
const BODY_TAGS = new Set(["p", "li", "span", "td", "dd", "dt"]);
/** Inline emphasis → the accent hue (so emphasised words pop in a 3rd hue). */
const EMPHASIS_TAGS = new Set(["strong", "em", "b", "i", "mark", "dfn", "th"]);
/** Quoted text → its own hue. */
const QUOTE_TAGS = new Set(["blockquote", "q", "cite"]);
const CODE_TAGS = new Set(["pre", "code", "kbd", "samp"]);
/** Cards/panels → the `surface` tint. */
const CARD_TAGS = new Set([
  "article",
  "section",
  "figure",
  "dialog",
  "details",
  "fieldset",
  "blockquote",
]);
/** Top-of-page chrome → the `banner` tint (its own hue). */
const BANNER_TAGS = new Set(["header", "nav"]);
/** Side/bottom chrome → the `complementary` tint (its own hue). */
const COMPLEMENTARY_TAGS = new Set(["aside", "footer"]);
/** Classes that smell "muted/secondary" on common design systems. */
const MUTED_CLASS =
  /(^|[-_ ])(muted|secondary|subtle|meta|caption|help|hint|dim|faint|footnote)([-_ ]|$)/;
/** Classes/text that smell "primary CTA" on common design systems. */
const PRIMARY_CLASS =
  /(^|[-_ ])(primary|cta|submit|btn-primary|is-primary|accent|main)([-_ ]|$)/;
/** Classes that smell "secondary/ghost/outline button". */
const SECONDARY_CLASS =
  /(^|[-_ ])(secondary|ghost|outline|tertiary|cancel|link-button|btn-secondary|is-secondary)([-_ ]|$)/;
/** Button label TEXT that reads as a primary action. */
const PRIMARY_TEXT =
  /\b(submit|save|continue|sign up|sign in|log in|buy|checkout|get started|subscribe|confirm|next|send|apply|create|add)\b/;
/** Button label TEXT that reads as a secondary/cancel action. */
const SECONDARY_TEXT =
  /\b(cancel|back|skip|dismiss|close|learn more|details|reset|edit|more)\b/;

/**
 * Decides whether a button-like node is PRIMARY (emphasised, filled accent) or
 * SECONDARY (subtler/outlined). Heuristic, by priority:
 *  1. an explicit `primary` signal from the walk wins;
 *  2. class name signals (`btn-primary`/`cta` → primary; `ghost`/`outline`/
 *     `secondary`/`cancel` → secondary);
 *  3. label text (`Submit`/`Save`/… → primary; `Cancel`/`Back`/… → secondary);
 *  4. the FIRST detected button on a page biases primary (the dominant CTA),
 *     subsequent ones secondary — a coarse "visual order" proxy.
 * Default: primary (a lone button is usually the page's main action).
 */
export const classifyButton = (
  node: DetectedNode,
  orderIndex: number,
): SemanticRole => {
  if (node.primary === true) {
    return "primaryButton";
  }
  if (node.primary === false) {
    return "secondaryButton";
  }
  const cls = (node.className ?? "").toLowerCase();
  const txt = (node.text ?? "").toLowerCase();
  if (SECONDARY_CLASS.test(cls)) {
    return "secondaryButton";
  }
  if (PRIMARY_CLASS.test(cls)) {
    return "primaryButton";
  }
  if (SECONDARY_TEXT.test(txt)) {
    return "secondaryButton";
  }
  if (PRIMARY_TEXT.test(txt)) {
    return "primaryButton";
  }
  // Visual-order proxy: the first button is the dominant CTA.
  return orderIndex === 0 ? "primaryButton" : "secondaryButton";
};

/**
 * Classifies a SURFACE node into a fine semantic role (which palette slot fills
 * its background). Buttons split into primary/secondary; code blocks, cards, and
 * generic surfaces each get their own slot. `orderIndex` is this surface's index
 * among all surfaces (used for the button order heuristic).
 */
export const classifySurface = (
  node: DetectedNode,
  orderIndex: number,
): SemanticRole => {
  const tag = (node.tagName ?? "").toLowerCase();
  if (node.buttonLike || tag === "button") {
    return classifyButton(node, orderIndex);
  }
  if (CODE_TAGS.has(tag)) {
    return "code";
  }
  if (BANNER_TAGS.has(tag)) {
    return "banner";
  }
  if (COMPLEMENTARY_TAGS.has(tag)) {
    return "complementary";
  }
  if (CARD_TAGS.has(tag)) {
    return "card";
  }
  return "surface";
};

/**
 * Classifies a TEXT node into a fine semantic role (which palette slot colors
 * it). Anchors → link; h1/h2 → heading; h3–h6 → subheading; strong/em/… →
 * emphasis; blockquote/cite → quote; small/caption/… or muted-ish class →
 * muted; everything else → body.
 */
export const classifyText = (node: DetectedNode): SemanticRole => {
  const tag = (node.tagName ?? "").toLowerCase();
  const cls = (node.className ?? "").toLowerCase();
  if (tag === "a") {
    return "link";
  }
  if (HEADING_TAGS.has(tag)) {
    return "heading";
  }
  if (SUBHEADING_TAGS.has(tag)) {
    return "subheading";
  }
  if (MUTED_TAGS.has(tag) || MUTED_CLASS.test(cls)) {
    return "muted";
  }
  if (EMPHASIS_TAGS.has(tag)) {
    return "emphasis";
  }
  if (QUOTE_TAGS.has(tag)) {
    return "quote";
  }
  if (BODY_TAGS.has(tag)) {
    return "body";
  }
  return "body";
};

/**
 * The IDEAL palette color for a TEXT semantic role, BEFORE AA enforcement. Each
 * role pulls a DIFFERENT slot so multi-hue palettes spend their whole harmony:
 * heading/link/emphasis/quote/muted carry distinct accent/ink hues. The mapping
 * core then `nudgeToAA`s this against the actual painted background, preserving
 * the hue where possible.
 */
export const textRoleColor = (
  role: SemanticRole,
  roles: PaletteRoles,
): string => {
  switch (role) {
    case "heading":
      return roles.heading;
    case "subheading":
      return roles.accent;
    case "emphasis":
      return roles.primary;
    case "link":
      return roles.link;
    case "quote":
      return roles.secondary;
    case "muted":
      return roles.textSecondary;
    case "body":
    default:
      return roles.textPrimary;
  }
};

/**
 * Classifies CSS variable names by their apparent role from the name, so we can
 * remap them to the right palette slot. Heuristic but effective on the common
 * `--bg` / `--color-text` / `--border` conventions.
 */
export const classifyVarName = (name: string): NodeRole | null => {
  const n = name.toLowerCase();
  if (/(^|[-_])(bg|background|surface|paper|card|panel)([-_]|$)/.test(n)) {
    return "surface";
  }
  if (
    /(^|[-_])(text|fg|foreground|ink|copy|body|heading|link)([-_]|$)/.test(n)
  ) {
    return "text";
  }
  if (/(^|[-_])(border|outline|divider|rule|stroke)([-_]|$)/.test(n)) {
    return "border";
  }
  return null;
};

/**
 * Decides whether the page is "variable-driven" enough to remap CSS variables
 * as well. We require at least one recognizable surface AND one recognizable
 * text variable. The variable remap is an ADDITIVE layer (it does not replace
 * the two-pass surface/text repaint).
 */
export const isVariableDriven = (vars: DetectedVar[]): boolean => {
  let hasSurface = false;
  let hasText = false;
  for (const v of vars) {
    const role = classifyVarName(v.name);
    if (role === "surface") {
      hasSurface = true;
    }
    if (role === "text") {
      hasText = true;
    }
  }
  return hasSurface && hasText;
};

/**
 * Remaps detected `:root` variables onto the palette by role + luminance
 * bucket, enforcing AA between any text var and the chosen primary surface.
 */
export const remapVariables = (
  vars: DetectedVar[],
  palette: Palette,
  rolesOverride?: PaletteRoles,
): VarDecision[] => {
  const out: VarDecision[] = [];
  const roles = rolesOverride ?? palette.roles;
  // Primary surface = the bucket the first surface var falls into (or medium).
  const surfaceVar = vars.find((v) => classifyVarName(v.name) === "surface");
  const primaryBucket: LuminanceBucket = surfaceVar
    ? luminanceBucket(surfaceVar.value)
    : "light";
  const primarySurface = surfaceForBucket(palette, primaryBucket);

  for (const v of vars) {
    const role = classifyVarName(v.name);
    if (role === "surface") {
      out.push({
        name: v.name,
        value: surfaceForBucket(palette, luminanceBucket(v.value)),
      });
    } else if (role === "text") {
      // Route text vars to the matching ROLE color so heading/link vars carry
      // their own accent hue (not all one seed), then AA-nudge against the
      // surface — preserving the hue rather than collapsing to black/white.
      const n = v.name.toLowerCase();
      const seed = /heading|title/.test(n)
        ? roles.heading
        : /link|anchor/.test(n)
          ? roles.link
          : /muted|secondary|subtle/.test(n)
            ? roles.textSecondary
            : roles.textPrimary;
      out.push({
        name: v.name,
        value: nudgeToAA(seed, primarySurface),
      });
    } else if (role === "border") {
      out.push({
        name: v.name,
        value: nudgeToAA(roles.border, primarySurface, true),
      });
    }
  }
  return out;
};

/** Synthesizes a representative hex from a luminance value (for bucketing). */
const bucketHexFromLuminance = (lum: number): string => {
  if (lum < 0.15) {
    return "#1a1a1a";
  }
  if (lum < 0.55) {
    return "#808080";
  }
  return "#f0f0f0";
};

/**
 * The fill color + emitted-label color for a SURFACE semantic role. Buttons get
 * their saturated/subtle accent fills with the palette's matching on-color;
 * code/card/generic surfaces get the corresponding tinted surface slot (and a
 * null label, so the two-pass text machinery picks a contrasting ink). Returns
 * `null` to mean "fall through to luminance-bucket mapping" (generic surfaces
 * whose own background should keep the page's light/dark hierarchy).
 */
const surfaceRoleFill = (
  semantic: SemanticRole,
  roles: PaletteRoles,
): { bg: string; label?: string } | null => {
  switch (semantic) {
    case "primaryButton":
      return { bg: roles.primary, label: roles.onPrimary };
    case "secondaryButton":
      return { bg: roles.secondary, label: roles.onSecondary };
    case "code":
      return { bg: roles.surfaceAlt };
    case "card":
      return { bg: roles.surface };
    // Banner (header/nav) and complementary (aside/footer) chrome get their OWN
    // hued surface tints — a heavy mix of an accent toward the page bg, so they
    // read as distinctly-colored regions (not another white) while staying
    // light enough for AA-nudged text. This is a big driver of "more colors on
    // the page": a typical site's header/nav/footer now each show a hue.
    case "banner":
      return { bg: mixHex(roles.heading, roles.bg, 0.86) };
    case "complementary":
      return { bg: mixHex(roles.link, roles.bg, 0.86) };
    default:
      return null;
  }
};

/**
 * Maps a detected surface node's own bg onto a new palette surface, BY ROLE
 * first (buttons/code/cards get their dedicated slots), else by luminance bucket
 * so the page's light/dark surface hierarchy is preserved.
 */
const surfaceBackgroundFor = (
  node: DetectedNode,
  palette: Palette,
  roles: PaletteRoles,
  semantic: SemanticRole,
): string => {
  const roleFill = surfaceRoleFill(semantic, roles);
  if (roleFill) {
    return roleFill.bg;
  }
  const bucket = luminanceBucket(
    node.bgColor ?? bucketHexFromLuminance(node.luminance),
  );
  return surfaceForBucket(palette, bucket);
};

/**
 * The intensity dial as a BLEND FACTOR in [0, 1]: "how much of the theme is
 * applied versus the original". Intensity 100 → 1 (fully themed); lower values
 * mix each themed color back toward the page's original by `1 - factor`.
 *
 * This is the universal, always-visible lever: it affects EVERY repainted
 * surface and text color on EVERY site (no area gating, which produced the
 * "does nothing on some sites" behavior).
 */
export const blendFactor = (intensity: Intensity): number =>
  Math.min(100, Math.max(0, intensity)) / 100;

/** Serializes a style decision into a CSS rule (all props `!important`). */
const decisionToCss = (d: StyleDecision): string => {
  const props: string[] = [];
  if (d.background) {
    props.push(`background-color: ${d.background} !important`);
    // Only clear background-image on elements we actually repaint as surfaces,
    // so we never wipe icons/sprites on non-surface elements.
    props.push(`background-image: none !important`);
  }
  if (d.color) {
    props.push(`color: ${d.color} !important`);
    // Drop any text-shadow on repainted text so halos can't hide it.
    props.push(`text-shadow: none !important`);
  }
  if (d.borderColor) {
    props.push(`border-color: ${d.borderColor} !important`);
  }
  if (props.length === 0) {
    return "";
  }
  return `${d.selector} { ${props.join("; ")}; }`;
};

/** Serializes `:root` variable overrides into a single rule. */
const varsToCss = (vars: VarDecision[]): string => {
  if (vars.length === 0) {
    return "";
  }
  const body = vars.map((v) => `${v.name}: ${v.value} !important;`).join(" ");
  return `:root { ${body} }`;
};

/**
 * Resolves the EFFECTIVE new background for a node: the new background of the
 * nearest ancestor-or-self that pass 1 themed, walking up the `parent` chain;
 * falls back to `base` when nothing in the chain was themed.
 */
const effectiveBackground = (
  index: number,
  nodes: DetectedNode[],
  paintedBg: Map<number, string>,
  base: string,
): string => {
  let cursor: number | undefined = index;
  let guard = 0;
  while (cursor !== undefined && cursor >= 0 && guard < nodes.length + 1) {
    const bg = paintedBg.get(cursor);
    if (bg) {
      return bg;
    }
    cursor = nodes[cursor]?.parent;
    guard += 1;
  }
  return base;
};

/**
 * Resolves the text color for `effBg` from a ROLE SEED (heading/link/body/…).
 *
 * SOURCE-OF-TRUTH with a READABILITY FLOOR ("exact unless truly unreadable"):
 *  - At FULL intensity (`factor >= 1`) we paint the EXACT swatch/role color —
 *    but always passed through `nudgeToAA` against the effective background.
 *    `nudgeToAA` returns the color UNCHANGED when it already meets the
 *    size-appropriate threshold, so readable swatch colors stay EXACT (the
 *    fidelity the user wants); only a genuinely-unreadable color is nudged to
 *    the nearest readable shade of the SAME hue (never collapsing to black/white
 *    unless no shade of that hue can reach the floor). So a swatch == the DOM
 *    color whenever it is readable, and we never recreate invisible text.
 *  - BELOW full intensity the color blends from the page's ORIGINAL toward the
 *    seed by `factor`, kept AA-readable via the same `nudgeToAA`.
 */
const blendedText = (
  originalText: string | undefined,
  effBg: string,
  seed: string,
  factor: number,
  large = false,
): string => {
  // Full intensity → the swatch color, but floored for readability (unchanged
  // when already readable, so exact-swatch fidelity is preserved).
  if (factor >= 1) {
    return nudgeToAA(seed, effBg, large);
  }
  const themed = nudgeToAA(seed, effBg, large); // AA target, hue-preserving
  if (!originalText) {
    return themed;
  }
  const candidate = mixHex(originalText, themed, factor);
  // Keep the blended color only if it is still AA against the (blended) bg —
  // re-nudge (not just snap) so a blended accent keeps its hue where it can.
  return nudgeToAA(candidate, effBg, large);
};

/**
 * THE mapping core. Given detected nodes + `:root` variables + a palette +
 * options, returns the style decisions and the CSS to inject.
 *
 * Intensity is a BLEND: "how much of the theme is applied versus the original".
 * Every themed color is mixed from the element's ORIGINAL color toward the
 * mapped palette color by `blendFactor(intensity)`.
 *
 * INVARIANTS:
 *  - html and body ALWAYS receive a (blended) base background + readable text.
 *  - EVERY emitted text/background pair passes WCAG AA against the EFFECTIVE
 *    (blended) background that renders behind it.
 *  - At intensity 100 the page is fully themed; lower intensities tint toward
 *    the original, uniformly across ALL surfaces (no per-site dead zones).
 */
export const buildMapping = (
  nodes: DetectedNode[],
  vars: DetectedVar[],
  palette: Palette,
  options: ApplyOptions,
): MappingResult => {
  const intensity: Intensity = options.intensity;
  const factor = blendFactor(intensity);
  const variableDriven = isVariableDriven(vars);
  const roles = palette.roles;

  // ---- base surface: always themed (blended) ----------------------------
  // The themed page background is the `bg` role (the theme's page color).
  const originalBaseBg = nodes.find(
    (n) => n.selector === BODY_SELECTOR,
  )?.bgColor;
  const themedBase = roles.bg;
  const baseBackground = mixHex(
    originalBaseBg ?? "#ffffff",
    themedBase,
    factor,
  );
  // Body ink for the page base (carries the faintly-tinted textPrimary slot).
  const originalBaseFg = nodes.find(
    (n) => n.selector === BODY_SELECTOR,
  )?.textColor;
  const baseText = blendedText(
    originalBaseFg ?? "#111111",
    baseBackground,
    roles.textPrimary,
    factor,
  );

  // ---- variable remap (additive) ----------------------------------------
  // Remap when the page is variable-driven, OR at the top of the dial.
  const varDecisions =
    variableDriven || intensity >= 100
      ? remapVariables(vars, palette, roles)
      : [];

  // ---- PASS 1: surfaces (ALL of them — blended toward the palette) -------
  // paintedBg maps node index → its NEW (blended) background for pass-2 lookup.
  // Surfaces are classified into semantic roles so buttons/code/cards pull their
  // dedicated palette slots (primary ≠ secondary, code ≠ card ≠ page).
  const paintedBg = new Map<number, string>();
  const surfaceDecisions: StyleDecision[] = [];
  // Order index among SURFACE nodes that are button-like — drives the
  // primary-then-secondary button heuristic deterministically.
  let buttonOrder = 0;
  nodes.forEach((node, i) => {
    if (node.role !== "surface") {
      return;
    }
    const isButton = node.buttonLike || (node.tagName ?? "") === "button";
    const semantic = classifySurface(node, isButton ? buttonOrder : 0);
    if (isButton) {
      buttonOrder += 1;
    }
    const original = node.bgColor ?? bucketHexFromLuminance(node.luminance);
    const mapped = surfaceBackgroundFor(node, palette, roles, semantic);
    const background = mixHex(original, mapped, factor);
    paintedBg.set(i, background);
    // Buttons emit their dedicated label color (onPrimary/onSecondary) as the
    // seed; other surfaces use body ink. Either way it is AA-nudged vs the bg.
    const fill = surfaceRoleFill(semantic, roles);
    const labelSeed = fill?.label ?? roles.textPrimary;
    surfaceDecisions.push({
      selector: node.selector,
      role: "surface",
      semantic,
      background,
      color: blendedText(node.textColor, background, labelSeed, factor),
    });
  });

  // ---- borders/dividers: only at the top of the dial ---------------------
  const borderDecisions: StyleDecision[] =
    intensity >= 100
      ? nodes
          .filter((n) => n.role === "border")
          .map((n) => ({
            selector: n.selector,
            role: "border" as const,
            semantic: "divider" as SemanticRole,
            borderColor: nudgeToAA(
              roles.border,
              surfaceForBucket(palette, "medium"),
              true,
            ),
          }))
      : [];

  // ---- PASS 2: text (ALWAYS) — AA against the EFFECTIVE blended bg --------
  // Each text node is classified into a semantic role (heading/link/body/muted)
  // and colored from its OWN palette slot, so multi-hue palettes spend their
  // whole harmony and roles are mutually distinct — then AA-nudged vs effBg.
  const textDecisions: StyleDecision[] = [];
  nodes.forEach((node, i) => {
    if (node.role !== "text") {
      return;
    }
    const semantic = classifyText(node);
    const seed = textRoleColor(semantic, roles);
    const effBg = effectiveBackground(i, nodes, paintedBg, baseBackground);
    // Headings/links are large/emphasised — allow the AA-large threshold so the
    // accent hue survives more often; body/muted use the stricter normal AA.
    const large = semantic === "heading" || semantic === "subheading";
    textDecisions.push({
      selector: node.selector,
      role: "text",
      semantic,
      color: blendedText(node.textColor, effBg, seed, factor, large),
    });
  });

  // Base (html/body) decisions, emitted first so element surfaces win the
  // cascade via their data-attr selectors / specificity.
  const baseDecisions: StyleDecision[] = [
    {
      selector: HTML_SELECTOR,
      role: "surface",
      background: baseBackground,
      color: baseText,
    },
    {
      selector: BODY_SELECTOR,
      role: "surface",
      background: baseBackground,
      color: baseText,
    },
  ];

  const decisions: StyleDecision[] = [
    ...baseDecisions,
    ...surfaceDecisions,
    ...borderDecisions,
    ...textDecisions,
  ];

  const cssParts = [
    varsToCss(varDecisions),
    ...decisions.map(decisionToCss),
  ].filter(Boolean);

  return {
    decisions,
    vars: varDecisions,
    css: cssParts.join("\n"),
    variableDriven,
    baseBackground,
    baseText,
  };
};
