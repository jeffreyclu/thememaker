/**
 * The per-element surface painter for one element.
 *
 * Surface color = `mix(frozenOriginal, fixedTheme, factor)`. `fixedTheme`
 * (`fill.bg`) is a pure function of role (never the original bg), so same-role
 * surfaces share one theme color and recycled nodes never drift; `frozenOriginal`
 * (captured once and frozen) only feeds the blend. The element is tagged once with
 * a stable `[data-thememaker="N"]` id + (for tinted semantic surfaces) a
 * `data-tm-surf` token; once in `doneSet` it is never re-walked.
 *
 * Text is not colored per-element: role colors come from the root-scoped tag rules
 * (`role-rules.ts`), so newly created/typed text is instantly correct. This painter
 * only emits a surface's background + its inherited subtree color + the box-shadow
 * softening, preserving real image backgrounds and alpha.
 */
import {
  alphaOf,
  mixCss,
  parseCssColor,
  rgbTupleToHex,
  withAlpha,
} from "../color/color-runtime";
import { hasImageBackground, isSkippable } from "./role-classify";
import { ROOT_MARKER_ATTR, SURFACE_TOKEN_ATTR } from "./theme-dom-constants";
import type { ResolvedRoles } from "./engine-roles";
import type { EngineState, OriginalStyle } from "./engine-types";
import type { SurfaceFill } from "./role-classify";

/** Hard cap on total themed surfaces so the <style> + work can't grow unbounded. */
export const MAX_THEMED = 12000;

/** Everything the per-element painter reads/mutates for an apply. */
export interface SurfaceContext {
  state: EngineState;
  doneSet: WeakSet<Element>;
  originals: WeakMap<Element, OriginalStyle>;
  factor: number;
  roleText: ResolvedRoles["roleText"];
  surfaceFillFor: (el: HTMLElement) => SurfaceFill;
}

/**
 * Returns an element's frozen original bg/fg, capturing it once. On first sighting
 * the live computed style is the original; afterwards the cached value is read so
 * detection never sees our own themed output (idempotent).
 */
export const originalStyleOf = (
  el: HTMLElement,
  originals: WeakMap<Element, OriginalStyle>,
): OriginalStyle => {
  const cached = originals.get(el);
  if (cached) {
    return cached;
  }
  const cs = getComputedStyle(el);
  const captured: OriginalStyle = {
    bg: cs.backgroundColor || null,
    fg: cs.color || null,
    bgImage: cs.backgroundImage || null,
    boxShadow: cs.boxShadow || null,
  };
  originals.set(el, captured);
  return captured;
};

/**
 * Tag + emit the per-element surface rule for one element. Returns its CSS rule, or
 * null if it is not a surface / is skipped / is image-backed / is capped.
 *
 * Detects against the frozen original bg (not our themed output) so re-apply is
 * idempotent; non-surfaces are not frozen (a node later recycled to own a bg gets
 * themed when re-checked). The label color floors against the deterministic
 * `fill.bg` so it is stable + AA at every intensity.
 */
export const processElement = (
  el: HTMLElement,
  ctx: SurfaceContext,
): string | null => {
  const { state, doneSet, originals, factor, roleText, surfaceFillFor } = ctx;
  if (doneSet.has(el) || isSkippable(el)) {
    return null;
  }
  // Honor the total themed-surface budget. Past the cap, stop tagging new surfaces
  // (already-themed ones keep their frozen rules). Warn once.
  if (state.themedCount >= MAX_THEMED) {
    if (!state.capped) {
      state.capped = true;
      try {
        // eslint-disable-next-line no-console
        console.warn(
          `[thememaker] themed-element budget reached (${MAX_THEMED}); ` +
            `further new elements on this page are left un-themed to stay fast.`,
        );
      } catch {
        // console unavailable — ignore.
      }
    }
    return null;
  }

  // Only elements that own a (non-transparent) background are surfaces; everything
  // else inherits / matches a role tag rule. Non-surfaces are not added to
  // `doneSet`, so a node later recycled to own a background (e.g. a virtualized
  // list swapping a row's bg class) gets themed when re-checked. Only tagged
  // surfaces are frozen.
  const orig = originalStyleOf(el, originals);
  const bgRgb = parseCssColor(orig.bg ?? "");
  if (!bgRgb) {
    return null;
  }

  // Preserve real image backgrounds: if the frozen original `background-image` is a
  // `url(...)` asset, do not paint a solid over it or strip it. Freeze it so it is
  // left alone — text still inherits.
  if (hasImageBackground(orig.bgImage)) {
    doneSet.add(el);
    return null;
  }

  doneSet.add(el);
  state.themedCount += 1;
  let id = el.getAttribute(ROOT_MARKER_ATTR);
  if (id === null) {
    id = String(state.nextId);
    state.nextId += 1;
    el.setAttribute(ROOT_MARKER_ATTR, id);
  }
  const frozenOriginal = rgbTupleToHex(bgRgb);
  // Fixed theme by role (never `bucketOf(frozenOriginal)`); blend from the frozen
  // original toward it by the intensity factor.
  const fill = surfaceFillFor(el);
  const background = mixCss(frozenOriginal, fill.bg, factor);
  // Tag tinted semantic surfaces (card/code/banner/comp) with their role token so
  // the scoped role-text rules floor text inside them against this surface.
  if (fill.surf && el.getAttribute(SURFACE_TOKEN_ATTR) !== fill.surf) {
    el.setAttribute(SURFACE_TOKEN_ATTR, fill.surf);
  }
  // The surface sets the inherited body-text color for its subtree, floored against
  // its deterministic fixed-theme bg (`fill.bg`) — stable + readable.
  const color = roleText(fill.label, fill.bg, false);
  // Preserve the original's transparency: a semi-transparent overlay/scrim stays
  // see-through (themed) instead of becoming an opaque slab over the content.
  const alpha = alphaOf(orig.bg ?? "");
  const bgValue = alpha < 1 ? withAlpha(background, alpha) : background;
  // Soften drop shadows: an element that had a box-shadow keeps a gentle, neutral
  // elevation; elements with no shadow stay flat.
  const shadowDecl =
    orig.boxShadow && orig.boxShadow !== "none"
      ? " box-shadow: 0 1px 3px rgba(0,0,0,0.2), 0 6px 16px rgba(0,0,0,0.12) !important;"
      : "";
  return `[${ROOT_MARKER_ATTR}="${id}"] { background-color: ${bgValue} !important; background-image: none !important; color: ${color} !important; text-shadow: none !important;${shadowDecl} }`;
};
