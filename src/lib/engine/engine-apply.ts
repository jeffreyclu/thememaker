/**
 * The per-apply resolution step — pure "palette + options into base CSS + paint
 * context", so the `Engine` class stays a thin scheduler.
 *
 * It runs the role/var/surface resolution, captures the frozen body original
 * through the Engine's caches, caches the exact base background for the next load's
 * early paint, and returns the base rules (the html/body base + the :root remap +
 * the root-scoped role-text rules) plus the `SurfaceContext` the time-sliced walk
 * paints each surface with. No scheduling, observer, or state ownership — those
 * live on the Engine.
 */
import { mixCss } from "../color/color-runtime";
import { writeBaseCache } from "./base-cache";
import { resolveRoles } from "./engine-roles";
import { buildVarDecls, detectRootVars } from "./css-var-remap";
import { buildRoleRules } from "./role-rules";
import {
  buildButtonOrder,
  makeSurfaceFillFor,
  surfaceRoleBg,
} from "./role-classify";
import { originalStyleOf, type SurfaceContext } from "./engine-surface";
import type { EngineState, OriginalStyle } from "./engine-types";
import type { Palette } from "../palette";
import type { ApplyOptions } from "../../types";

/** The resolved pieces an apply hands to the Engine's scheduler. */
export interface ResolvedApply {
  /** The base rules (html/body base + :root remap + role-text tag rules). */
  baseParts: string[];
  /** The per-element surface painter's context. */
  surfaceCtx: SurfaceContext;
}

/**
 * Resolves `palette` + `options` into the base CSS rules + the surface paint
 * context, using the Engine's persistent caches (`state`, `originals`, `doneSet`).
 */
export const resolveApply = (
  palette: Palette,
  options: ApplyOptions,
  state: EngineState,
  originals: WeakMap<Element, OriginalStyle>,
  doneSet: WeakSet<Element>,
): ResolvedApply => {
  // Resolve the palette + options into concrete role colors (distinct slots per
  // role, overrides, the intensity blend `factor`, the `themedBase`, the tinted
  // banner/comp surfaces, the `roleText` AA floor).
  const roles = resolveRoles(palette, options);
  const { factor, themedBase, roleTextPrimary, roleText } = roles;

  // Detect + remap :root CSS variables (surface vars blend, text vars route to the
  // role color AA-floored, border vars remap).
  const varDecls = buildVarDecls(detectRootVars(), roles);

  // Base surface (html/body): always painted, blended from the page's frozen
  // original body background toward the themed base by the intensity factor.
  const bodyOriginal: OriginalStyle = document.body
    ? originalStyleOf(document.body, originals)
    : { bg: null, fg: null, bgImage: null, boxShadow: null };
  const baseBackground = mixCss(
    bodyOriginal.bg || "#ffffff",
    themedBase,
    factor,
  );
  // Cache the exact resolved base for this origin so the Engine can paint it
  // synchronously at document_start next load (no reload flash). Best-effort.
  writeBaseCache(baseBackground);
  // Base ink: floored against the deterministic `themedBase` (not the blended
  // base), so it is identical at every intensity / re-apply / reload.
  const baseText = roleText(roleTextPrimary, themedBase, false);

  // Semantic surface classification: `buttonOrder` captured once (the first button
  // is the deterministic CTA); `surfaceFillFor` closes over the resolved roles.
  const buttonOrder = buildButtonOrder();
  const surfaceRoleBgMap = surfaceRoleBg(roles);
  const surfaceFillFor = makeSurfaceFillFor(roles, buttonOrder);
  const surfaceCtx: SurfaceContext = {
    state,
    doneSet,
    originals,
    factor,
    roleText,
    surfaceFillFor,
  };

  // The base rules, emitted once: the :root remap, the html/body base, then the
  // root-scoped role-text tag rules (inherited, so new/typed text is instantly the
  // right color).
  const baseParts: string[] = [];
  if (varDecls.length > 0) {
    baseParts.push(`:root { ${varDecls.join(" ")} }`);
  }
  baseParts.push(
    `html { background-color: ${baseBackground} !important; background-image: none !important; color: ${baseText} !important; }`,
    `body { background-color: ${baseBackground} !important; background-image: none !important; color: ${baseText} !important; }`,
  );
  for (const r of buildRoleRules(roles, surfaceRoleBgMap)) {
    baseParts.push(r);
  }
  return { baseParts, surfaceCtx };
};
