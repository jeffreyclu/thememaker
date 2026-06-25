/**
 * The v2 ADAPTIVE THEMING ENGINE — `applyAdaptiveScheme`, the in-page entry point.
 *
 * Runs in the content-script ISOLATED WORLD (bundled code — it `import`s the
 * focused engine modules below; nothing is serialized/injected). It inspects the
 * live page (`getComputedStyle`, `:root` custom properties) and themes it as a
 * "DJ mixer": every themed surface color = `mix(frozenOriginal, fixedTheme,
 * factor)`, `factor = intensity/100`.
 *
 *  - TRACK 2 (`fixedTheme`) is a PURE FUNCTION OF THE ELEMENT'S ROLE / STRUCTURE,
 *    never of its original color. Generic surfaces → ONE fixed palette surface;
 *    semantic surfaces (card/code/banner/button via a `data-tm-surf` token) →
 *    their fixed distinct role colors; text → role colors delivered by
 *    ROOT-SCOPED tag rules. THIS is the SPA fix: on pages that recycle DOM nodes /
 *    swap row backgrounds, the theme color no longer changes with the (volatile)
 *    original bg, so identical rows share one color and a recycled node never drifts.
 *  - TRACK 1 (`frozenOriginal`) is each surface's original bg captured ONCE in a
 *    WeakMap and FROZEN; it feeds ONLY the crossfade blend, never the theme-color
 *    choice. A tagged element is never re-themed.
 *
 * It always themes `<html>` + `<body>` as the base surface, enforces WCAG AA on
 * every text/surface pair against the FIXED reference surface, writes the single
 * `<style id="themeMaker">` IN PLACE (no themeless gap → no flash), and installs
 * an INCREMENTAL, debounced, TIME-SLICED `MutationObserver` for SPA/lazy content.
 *
 * This orchestrator is a thin wiring SPINE; each concern lives in its own module:
 * `engine-roles` (resolve roles) → `css-var-remap` (detect+remap vars) →
 * `engine-state` (page-side state) → `role-classify`/`engine-surface` (the
 * per-element surface painter) → `role-rules` (root-scoped text) → `engine-walk`
 * (time-sliced scheduler) → `engine-overrides` (per-tag layer) → `engine-observer`
 * (pre-paint + deferred MutationObserver). Tested directly via `tests/engine.test.ts`
 * + `tests/overrides.test.ts` + the Playwright e2e specs.
 */
import { mixCss } from "./color-runtime";
import {
  BASE_CACHE_KEY,
  ROOT_MARKER_ATTR,
  STYLE_ELEMENT_ID,
} from "./theme-dom-constants";
import {
  engineWindow,
  initEngineState,
  type EngineWindow,
  type OriginalStyle,
} from "./engine-state";
import { resolveRoles } from "./engine-roles";
import { buildVarDecls, detectRootVars } from "./css-var-remap";
import { buildRoleRules } from "./role-rules";
import {
  buildButtonOrder,
  makeSurfaceFillFor,
  surfaceRoleBg,
} from "./role-classify";
import { originalStyleOf, type SurfaceContext } from "./engine-surface";
import { createWalk } from "./engine-walk";
import { installObserver } from "./engine-observer";
import { applyOverrideLayer } from "./engine-overrides";
import type { Palette } from "./palette";
import type { ApplyOptions } from "../types";

/**
 * The v2 adaptive engine, IN-PAGE entry point.
 *
 * @param palette the generated palette (surfaces ascending by luminance).
 * @param options apply options (numeric 0–100 intensity = theme-vs-original blend).
 * @returns `true` once applied.
 */
export function applyAdaptiveScheme(
  palette: Palette,
  options: ApplyOptions,
): boolean {
  // ---- resolve the palette + options into concrete ROLE colors ------------
  // The anti-monochrome layer: distinct palette slots for distinct semantic
  // roles, the user's role-keyed overrides layered on, the intensity BLEND
  // `factor`, the `themedBase`, the tinted banner/comp surfaces, and the
  // `roleText` AA floor — all derived once in `engine-roles.ts`.
  const roles = resolveRoles(palette, options);
  const { factor, themedBase, roleTextPrimary, roleText } = roles;

  // ---- detect + remap :root CSS variables (css-var-remap.ts) --------------
  // Var-driven pages read surfaces/text off `:root` custom properties the
  // per-element walk can't reach, so we detect the color vars, classify each, and
  // emit a `:root { --x: … !important }` remap toward the theme (surface vars
  // crossfade, text vars route to the role color AA-floored, border vars remap).
  const varDecls = buildVarDecls(detectRootVars(), roles);

  // ---- per-apply + persistent engine state (shared with the observer) -----
  // The state shape + its persistent-vs-per-apply reset rules live in
  // `engine-state.ts`. `originals` (TRACK 1: each surface's FROZEN original bg/fg)
  // + the monotonic `nextId` persist across applies; the `doneSet` (tagged
  // surfaces), themed counter, and cap flag RESET here per apply (an explicit
  // apply REBUILDS the sheet from scratch — slider drags must recolor everything).
  const w: EngineWindow = engineWindow();
  const { originals, doneSet } = initEngineState(w);

  // Base surface (html/body): ALWAYS painted, crossfaded from the page's FROZEN
  // ORIGINAL body background toward the themed base by the intensity factor.
  const bodyOriginal: OriginalStyle = document.body
    ? originalStyleOf(document.body, originals)
    : { bg: null, fg: null, bgImage: null, boxShadow: null };
  const baseBackground = mixCss(
    bodyOriginal.bg || "#ffffff",
    themedBase,
    factor,
  );
  // Cache the EXACT resolved base for this origin in the page's own localStorage,
  // so the content script can synchronously paint it at document_start on the NEXT
  // load (before any async chrome.storage read) and eliminate the reload flash.
  // Best-effort: silent if localStorage is blocked.
  try {
    window.localStorage.setItem(BASE_CACHE_KEY, baseBackground);
  } catch {
    // localStorage unavailable — no early-paint cache next load; not fatal.
  }
  // Page base ink carries the faintly-tinted body (textPrimary) slot. Floored
  // against the DETERMINISTIC base surface (`themedBase` = roles.bg), NOT the
  // blended `baseBackground`, so the base text color is identical at every
  // intensity / re-apply / reload (stability-first).
  const baseText = roleText(roleTextPrimary, themedBase, false);

  // ---- semantic SURFACE classification (role-classify.ts) -----------------
  // Surfaces are classified by tag/class into roles (code/card/banner/comp/button)
  // that pull dedicated palette slots. TEXT role classification lives in the
  // ROOT-SCOPED tag rules (not here), so the walk only ever touches surfaces.
  // `buttonOrder` is captured once (document order) so the first button is the
  // deterministic CTA; `surfaceFillFor` closes over the resolved roles.
  const buttonOrder = buildButtonOrder();
  const SURFACE_ROLE_BG = surfaceRoleBg(roles);
  const surfaceFillFor = makeSurfaceFillFor(roles, buttonOrder);
  // The per-element SURFACE PAINTER's context (the DJ-mixer crossfade) — passed to
  // the time-sliced walk + the observer's pre-paint path.
  const surfaceCtx: SurfaceContext = {
    w,
    doneSet,
    originals,
    factor,
    roleText,
    surfaceFillFor,
  };

  // ---- write the BASE rules IMMEDIATELY (no themeless gap) -----------------
  const baseParts: string[] = [];
  if (varDecls.length > 0) {
    baseParts.push(`:root { ${varDecls.join(" ")} }`);
  }
  baseParts.push(
    `html { background-color: ${baseBackground} !important; background-image: none !important; color: ${baseText} !important; }`,
    `body { background-color: ${baseBackground} !important; background-image: none !important; color: ${baseText} !important; }`,
  );

  // ---- ROLE TEXT as ROOT-SCOPED TAG rules (role-rules.ts) -----------------
  // Text color is delivered by INHERITANCE + root-scoped tag/role selectors,
  // emitted ONCE — NOT per element — so any newly-created or typed node is the
  // right color the instant it exists (no per-keystroke flash). Page-level rules
  // floor against the harder of {themedBase, roleSurface}; per-surface variants
  // floor against their own tinted surface.
  for (const r of buildRoleRules(roles, SURFACE_ROLE_BG)) {
    baseParts.push(r);
  }

  // ---- write the single <style id="themeMaker"> IN PLACE ------------------
  const head = document.querySelector("head") || document.documentElement;
  let style = document.getElementById(
    STYLE_ELEMENT_ID,
  ) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ELEMENT_ID;
    head.appendChild(style);
  }
  const styleEl = style;
  // Each explicit apply REBUILDS the sheet: start from empty, write base rules,
  // then stream the surface walk in.
  styleEl.textContent = "";
  // ROOT MARKER: a stable presence attribute on <html> that every role-text rule
  // is scoped under, so the engine's text colors clear site single-class
  // specificity. It carries no value, so it never collides with the per-element
  // `[data-thememaker="N"]` surface rules.
  if (!document.documentElement.hasAttribute(ROOT_MARKER_ATTR)) {
    document.documentElement.setAttribute(ROOT_MARKER_ATTR, "");
  }

  // ---- run the TIME-SLICED surface walk (engine-walk.ts) ------------------
  // Write the base rules now, then kick off the surface walk. The first slice runs
  // synchronously inside this call, ABOVE-THE-FOLD first.
  const walk = createWalk(styleEl, surfaceCtx);
  walk.appendRules(baseParts);
  if (document.body) {
    walk.enqueue(document.body, true);
    if (!walk.isDraining()) {
      walk.drainQueue();
    }
  }

  // ---- per-tag custom overrides: a SEPARATE CSS layer ON TOP --------------
  // `options.overrides` maps `<tag>|<prop>` → exact hex; emitted as a sibling
  // `<style id="themeMakerOverrides">` AFTER the main one so it wins.
  applyOverrideLayer(options.overrides, head);

  // ---- install the MutationObserver (engine-observer.ts) ------------------
  // PRE-PAINT in-viewport surfaces synchronously (no white flash) + DEFER the
  // off-screen remainder through the debounced, time-sliced drainer. The last args
  // are stashed on the window for any observer-driven re-paint.
  w.__themeMakerArgs = [palette, options];
  installObserver(walk, doneSet, originals);

  return true;
}
