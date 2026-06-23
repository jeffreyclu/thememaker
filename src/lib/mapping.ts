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
  ensureContrast,
  luminanceBucket,
  mixHex,
  type LuminanceBucket,
} from "./color";
import type { Palette } from "./palette";
import type { ApplyOptions, Intensity } from "../types";

/** The role an element plays once classified by computed style. */
export type NodeRole = "surface" | "text" | "border";

/**
 * A node detected in the page, reduced to what mapping needs. Produced in-page
 * via `getComputedStyle`; here we accept it as a fixture for testing.
 */
export interface DetectedNode {
  /** A CSS selector that targets this node (e.g. a generated data-attr). */
  selector: string;
  role: NodeRole;
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

/**
 * The BASE surface the page background is painted with. We bias toward a
 * lighter, calmer surface from the palette so the page reads as an intentional
 * "paper", with text/accents layered on top.
 */
export const baseSurface = (palette: Palette): string =>
  surfaceForBucket(palette, "light");

/** Picks the accent the engine uses as a text seed (first/most-saturated). */
const textSeed = (palette: Palette): string =>
  palette.accents[0] ?? palette.swatches[0] ?? "#333333";

/** Picks the accent used as a border seed. */
const borderSeed = (palette: Palette): string =>
  palette.accents[palette.accents.length - 1] ??
  palette.swatches[palette.swatches.length - 1] ??
  "#888888";

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
): VarDecision[] => {
  const out: VarDecision[] = [];
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
      out.push({
        name: v.name,
        value: ensureContrast(textSeed(palette), primarySurface),
      });
    } else if (role === "border") {
      out.push({
        name: v.name,
        value: ensureContrast(borderSeed(palette), primarySurface, true),
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

/** Maps a detected surface node's own bg onto a new palette surface. */
const surfaceBackgroundFor = (node: DetectedNode, palette: Palette): string => {
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
 * Picks an AA-readable text color for `effBg`, then blends the ORIGINAL text
 * toward it by `factor` — but never below readability. The blended result is
 * AA-checked; if blending toward the original breaks contrast, we snap to the
 * fully-themed AA color so text is NEVER unreadable at any intensity.
 */
const blendedText = (
  originalText: string | undefined,
  effBg: string,
  palette: Palette,
  factor: number,
): string => {
  const themed = ensureContrast(textSeed(palette), effBg); // AA target
  if (!originalText || factor >= 1) {
    return themed;
  }
  const candidate = mixHex(originalText, themed, factor);
  // Keep the blended color only if it is still AA against the (blended) bg.
  return ensureContrast(candidate, effBg);
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

  // ---- base surface: always themed (blended) ----------------------------
  const themedBase = baseSurface(palette);
  // The page's original base bg/text default to white/black when unknown.
  const originalBaseBg = nodes.find(
    (n) => n.selector === BODY_SELECTOR,
  )?.bgColor;
  const baseBackground = mixHex(
    originalBaseBg ?? "#ffffff",
    themedBase,
    factor,
  );
  const baseText = blendedText("#111111", baseBackground, palette, factor);

  // ---- variable remap (additive) ----------------------------------------
  // Remap when the page is variable-driven, OR at the top of the dial.
  const varDecisions =
    variableDriven || intensity >= 100 ? remapVariables(vars, palette) : [];

  // ---- PASS 1: surfaces (ALL of them — blended toward the palette) -------
  // paintedBg maps node index → its NEW (blended) background for pass-2 lookup.
  const paintedBg = new Map<number, string>();
  const surfaceDecisions: StyleDecision[] = [];
  nodes.forEach((node, i) => {
    if (node.role !== "surface") {
      return;
    }
    const original = node.bgColor ?? bucketHexFromLuminance(node.luminance);
    const mapped = surfaceBackgroundFor(node, palette);
    const background = mixHex(original, mapped, factor);
    paintedBg.set(i, background);
    surfaceDecisions.push({
      selector: node.selector,
      role: "surface",
      background,
      color: blendedText(node.textColor, background, palette, factor),
    });
  });

  // ---- borders: only at the top of the dial ------------------------------
  const borderDecisions: StyleDecision[] =
    intensity >= 100
      ? nodes
          .filter((n) => n.role === "border")
          .map((n) => ({
            selector: n.selector,
            role: "border" as const,
            borderColor: ensureContrast(
              borderSeed(palette),
              surfaceForBucket(palette, "medium"),
              true,
            ),
          }))
      : [];

  // ---- PASS 2: text (ALWAYS) — AA against the EFFECTIVE blended bg --------
  const textDecisions: StyleDecision[] = [];
  nodes.forEach((node, i) => {
    if (node.role !== "text") {
      return;
    }
    const effBg = effectiveBackground(i, nodes, paintedBg, baseBackground);
    textDecisions.push({
      selector: node.selector,
      role: "text",
      color: blendedText(node.textColor, effBg, palette, factor),
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
