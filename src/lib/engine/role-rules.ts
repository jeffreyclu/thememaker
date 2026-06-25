/**
 * The ROOT-scoped ROLE-TEXT CSS emitter.
 *
 * Text color is delivered by INHERITANCE + tag/role selectors emitted ONCE — NOT
 * per element — so any newly-created or typed `<p>/<a>/<h1>/…` is the right color
 * the instant it exists (no observer round-trip → no per-keystroke flash), and
 * the walk/observer never touch text.
 *
 * SPECIFICITY (the real-SPA fix): bare tag selectors are (0,0,1), which a site's
 * single-CLASS `!important` color beats. We SCOPE every role rule under the stable
 * ROOT MARKER attribute on `<html>` (`[data-thememaker]`), lifting page-level
 * rules to (0,1,1) — beating a single site class — while STILL being a descendant
 * selector, so new/typed nodes match instantly. Per-surface variants scope one
 * level deeper (0,2,1). Each rule floors its role seed against a DETERMINISTIC
 * reference surface. Pure string building over the resolved roles.
 */
import { contrastRatio } from "../color/color";
import { ROOT_MARKER_ATTR, SURFACE_TOKEN_ATTR } from "./theme-dom-constants";
import type { ResolvedRoles } from "./engine-roles";

/**
 * Builds the role-text rules for one reference-surface strategy + scope. `refFor`
 * maps a seed → the bg it floors against; `scope` is "" for the page level or a
 * `[data-tm-surf="…"]` token for a tinted surface variant.
 */
const roleRulesFor = (
  roles: ResolvedRoles,
  refFor: (seed: string, large: boolean) => string,
  scope: string,
): string[] => {
  const ROOT = `[${ROOT_MARKER_ATTR}]`;
  const prefix = scope ? `${ROOT} ${scope}` : ROOT;
  const sel = (tags: string): string =>
    tags
      .split(", ")
      .map((t) => `${prefix} ${t}`)
      .join(", ");
  const c = (seed: string, large: boolean): string =>
    roles.roleText(seed, refFor(seed, large), large);
  return [
    `${sel("p, li, td, th, dd, dt, span, div")} { color: ${c(roles.roleTextPrimary, false)} !important; }`,
    `${sel("a")} { color: ${c(roles.roleLink, false)} !important; }`,
    `${sel("h1, h2")} { color: ${c(roles.roleHeading, true)} !important; }`,
    `${sel("h3, h4, h5, h6")} { color: ${c(roles.roleAccent, true)} !important; }`,
    `${sel("small, figcaption, caption, time, label")} { color: ${c(roles.roleTextSecondary, false)} !important; }`,
    `${sel("strong, em, b, i, mark, dfn")} { color: ${c(roles.rolePrimary, false)} !important; }`,
    `${sel("blockquote, q, cite")} { color: ${c(roles.roleSecondary, false)} !important; }`,
  ];
};

/**
 * Builds the FULL set of role-text rules: the page-level rules (floored against
 * the harder of {themedBase, roleSurface} so they're AA on the page base AND any
 * generic surface), then one scoped variant per tinted surface role (floored
 * against THAT fixed surface).
 */
export const buildRoleRules = (
  roles: ResolvedRoles,
  surfaceRoleBg: Record<string, string>,
): string[] => {
  // The PAGE-LEVEL role rules must be readable on BOTH the page base AND a generic
  // surface (which lands on `roleSurface`). Floor each page-level seed against
  // whichever of {themedBase, roleSurface} gives it LOWER contrast (the harder
  // case) — AA against both endpoints and every blend between them.
  const harderRef = (seed: string): string => {
    const a = roles.themedBase;
    const b = roles.roleSurface;
    if (a === b) {
      return a;
    }
    return contrastRatio(seed, a) <= contrastRatio(seed, b) ? a : b;
  };
  const rules: string[] = [];
  for (const r of roleRulesFor(roles, harderRef, "")) {
    rules.push(r);
  }
  for (const key of Object.keys(surfaceRoleBg)) {
    const ref = surfaceRoleBg[key];
    for (const r of roleRulesFor(
      roles,
      () => ref,
      `[${SURFACE_TOKEN_ATTR}="${key}"]`,
    )) {
      rules.push(r);
    }
  }
  return rules;
};
