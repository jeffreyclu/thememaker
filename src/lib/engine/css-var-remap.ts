/**
 * `:root` / `html` CSS custom-property detection + REMAP (the additive var layer).
 *
 * Many modern sites are "variable-driven": their surfaces and text read off a
 * handful of `--bg`/`--text`/`--border` custom properties declared on `:root`.
 * Repainting per-element can't reach those, so the engine DETECTS the color vars
 * a page declares, classifies each (surface/text/border by name), and emits a
 * `:root { --x: … !important }` block that REMAPS them toward the theme — surface
 * vars crossfade to a mapped surface, text vars route to the matching ROLE color
 * AA-floored against the lightest rendered surface, border vars to the role
 * border. Pure derivation over the detected vars + resolved roles.
 */
import { mixCss, parseCssColor, rgbTupleToHex } from "../color/color-runtime";
import { luminanceBucket, luminanceOf, nudgeToAA } from "../color/color";
import type { ResolvedRoles } from "./engine-roles";

/** A detected `:root` color variable + the role its NAME classifies it as. */
export interface DetectedVar {
  name: string;
  value: string;
  role: string;
}

/** Classifies a CSS var NAME into a color role by its semantic substring. */
export const classifyVarName = (
  name: string,
): "surface" | "text" | "border" | null => {
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
 * Walks the page's `:root`/`html` style rules and returns the COLOR custom
 * properties it declares, each classified (surface/text/border) and normalized to
 * hex. Cross-origin sheets that throw on `.cssRules` are skipped; all detection is
 * best-effort (absence just routes to per-element repaint).
 */
export const detectRootVars = (): DetectedVar[] => {
  const root = document.documentElement;
  const rootStyle = getComputedStyle(root);
  const detectedVars: DetectedVar[] = [];
  const seenVars = new Set<string>();
  const collectFromRule = (style: CSSStyleDeclaration): void => {
    for (let i = 0; i < style.length; i += 1) {
      // Index access works in both real browsers and jsdom; `.item(i)` does not
      // exist in jsdom, so avoid it.
      const prop = (style as unknown as Record<number, string>)[i];
      if (prop && prop.startsWith("--") && !seenVars.has(prop)) {
        seenVars.add(prop);
        const declared = style.getPropertyValue(prop).trim();
        const resolved = declared || rootStyle.getPropertyValue(prop).trim();
        const rgb = parseCssColor(resolved);
        if (rgb) {
          const role = classifyVarName(prop);
          if (role) {
            detectedVars.push({ name: prop, value: rgbTupleToHex(rgb), role });
          }
        }
      }
    }
  };
  try {
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList | null = null;
      try {
        rules = sheet.cssRules;
      } catch {
        rules = null; // cross-origin sheet — skip
      }
      if (!rules) {
        continue;
      }
      for (const rule of Array.from(rules)) {
        const sr = rule as CSSStyleRule;
        if (
          sr.selectorText &&
          (sr.selectorText === ":root" || sr.selectorText === "html") &&
          sr.style
        ) {
          collectFromRule(sr.style);
        }
      }
    }
  } catch {
    // Best-effort variable detection; absence just routes to repaint.
  }
  return detectedVars;
};

/** True when the page declares BOTH surface and text color vars (var-driven). */
export const isVariableDriven = (detectedVars: DetectedVar[]): boolean => {
  let hasSurfaceVar = false;
  let hasTextVar = false;
  for (const v of detectedVars) {
    if (v.role === "surface") {
      hasSurfaceVar = true;
    }
    if (v.role === "text") {
      hasTextVar = true;
    }
  }
  return hasSurfaceVar && hasTextVar;
};

/**
 * Builds the `:root` REMAP declarations for the detected vars. Emitted only when
 * the page is var-driven OR intensity is at the max (`factor >= 1`) — otherwise
 * the per-element repaint already covers the page and remapping vars would
 * double-apply. Returns the `--name: value !important;` strings (or [] for none).
 */
export const buildVarDecls = (
  detectedVars: DetectedVar[],
  roles: ResolvedRoles,
): string[] => {
  const {
    factor,
    themedBase,
    roleHeading,
    roleLink,
    roleTextSecondary,
    roleTextPrimary,
    roleBorder,
    surfaceFor,
    roleText,
  } = roles;
  const variableDriven = isVariableDriven(detectedVars);
  const varDecls: string[] = [];
  if (!(variableDriven || factor >= 1)) {
    return varDecls;
  }
  // The RENDERED (blended) value each surface var becomes — what a var-driven
  // element actually paints behind its text. Floor every text/border var against
  // the LIGHTEST of these (the worst case for dark-ish ink), so a remapped
  // link/heading/body is AA against WHICHEVER surface var it lands on (e.g. a link
  // inside a card on `--surface`, not just the page `--bg`).
  const renderedSurface = (val: string): string =>
    mixCss(val, surfaceFor(luminanceBucket(val)), factor);
  let floorSurface = themedBase;
  let floorLum = -1;
  for (const v of detectedVars) {
    if (v.role === "surface") {
      const rendered = renderedSurface(v.value);
      const l = luminanceOf(rendered);
      if (l > floorLum) {
        floorLum = l;
        floorSurface = rendered;
      }
    }
  }
  for (const v of detectedVars) {
    if (v.role === "surface") {
      // Blend each surface var from its ORIGINAL value toward the mapped one.
      const mapped = surfaceFor(luminanceBucket(v.value));
      varDecls.push(
        `${v.name}: ${mixCss(v.value, mapped, factor)} !important;`,
      );
    } else if (v.role === "text") {
      // Route text vars to the matching ROLE color so heading/link vars carry
      // their own accent hue (not all one seed), then AA-nudge against the
      // lightest RENDERED surface (hue-preserving) so it is readable on any of
      // the page's remapped surfaces.
      const n = v.name.toLowerCase();
      const seed = /heading|title/.test(n)
        ? roleHeading
        : /link|anchor/.test(n)
          ? roleLink
          : /muted|secondary|subtle/.test(n)
            ? roleTextSecondary
            : roleTextPrimary;
      varDecls.push(
        `${v.name}: ${roleText(seed, floorSurface, false)} !important;`,
      );
    } else if (v.role === "border") {
      const mapped = nudgeToAA(roleBorder, floorSurface, true);
      varDecls.push(
        `${v.name}: ${mixCss(v.value, mapped, factor)} !important;`,
      );
    }
  }
  return varDecls;
};
