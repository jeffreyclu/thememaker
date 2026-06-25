/**
 * The per-element SURFACE PAINTER — the DJ-mixer crossfade for ONE element.
 *
 * SURFACE COLOR = `mix(frozenOriginal, fixedTheme, factor)`. `fixedTheme`
 * (`fill.bg`) is a PURE FUNCTION OF ROLE (never the original bg), so identical-
 * role surfaces share one theme color and recycled nodes never drift;
 * `frozenOriginal` (captured ONCE and frozen) only feeds the blend. The element is
 * tagged once with a stable `[data-thememaker="N"]` id + (for tinted semantic
 * surfaces) a `data-tm-surf` token; once in `doneSet` it is never re-walked.
 *
 * TEXT IS NOT COLORED PER-ELEMENT: role colors come from the ROOT-SCOPED tag
 * rules (`role-rules.ts`), so newly created/typed text is instantly correct. This
 * painter only ever emits a surface's background + its inherited subtree color +
 * the box-shadow softening, preserving real image backgrounds and alpha.
 */
import {
  alphaOf,
  mixCss,
  parseCssColor,
  rgbTupleToHex,
  withAlpha,
} from "./color-runtime";
import { hasImageBackground, isSkippable } from "./role-classify";
import { ROOT_MARKER_ATTR, SURFACE_TOKEN_ATTR } from "./theme-dom-constants";
import type { ResolvedRoles } from "./engine-roles";
import type { EngineWindow, OriginalStyle } from "./engine-state";
import type { SurfaceFill } from "./role-classify";

/** Hard cap on total themed surfaces so the <style> + work can't grow unbounded. */
export const MAX_THEMED = 12000;

/** Everything the per-element painter reads/mutates for an apply. */
export interface SurfaceContext {
  w: EngineWindow;
  doneSet: WeakSet<Element>;
  originals: WeakMap<Element, OriginalStyle>;
  factor: number;
  roleText: ResolvedRoles["roleText"];
  surfaceFillFor: (el: HTMLElement) => SurfaceFill;
}

/**
 * Returns an element's FROZEN ORIGINAL bg/fg, capturing it once. On the very
 * first sighting the live computed style IS the original; afterwards we read the
 * cached value so detection never sees our own themed output (idempotent).
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
 * TAG + emit the per-element SURFACE rule for ONE element. Returns its CSS rule,
 * or null if it is not a surface / is skipped / is image-backed / is capped.
 *
 * Detects against the FROZEN ORIGINAL bg (not our themed output) so re-apply is
 * idempotent; NON-surfaces are NOT frozen (a node later recycled to own a bg gets
 * themed when re-checked). The label color floors against the DETERMINISTIC
 * `fill.bg` so it is stable + AA at every intensity.
 */
export const processElement = (
  el: HTMLElement,
  ctx: SurfaceContext,
): string | null => {
  const { w, doneSet, originals, factor, roleText, surfaceFillFor } = ctx;
  if (doneSet.has(el) || isSkippable(el)) {
    return null;
  }
  // Honor the total themed-surface budget. Past the cap we stop tagging new
  // surfaces (already-themed ones keep their frozen rules). Warn once.
  if ((w.__themeMakerThemedCount as number) >= MAX_THEMED) {
    if (!w.__themeMakerCapped) {
      w.__themeMakerCapped = true;
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
  // else inherits / matches a role tag rule. NON-surfaces are NOT added to
  // `doneSet` — so a node later RECYCLED to own a background (virtualized lists
  // swap a row's bg class) gets themed when re-checked. Only TAGGED SURFACES are
  // frozen.
  const orig = originalStyleOf(el, originals);
  const bgRgb = parseCssColor(orig.bg ?? "");
  if (!bgRgb) {
    return null;
  }

  // PRESERVE real image backgrounds: if the FROZEN original `background-image` is
  // a `url(...)` asset (carousel photo, hero/banner art, sprite), do NOT paint a
  // solid over it or strip it. Freeze it so it is left alone — text still inherits.
  if (hasImageBackground(orig.bgImage)) {
    doneSet.add(el);
    return null;
  }

  doneSet.add(el);
  w.__themeMakerThemedCount = (w.__themeMakerThemedCount as number) + 1;
  let id = el.getAttribute(ROOT_MARKER_ATTR);
  if (id === null) {
    id = String(w.__themeMakerNextId as number);
    w.__themeMakerNextId = (w.__themeMakerNextId as number) + 1;
    el.setAttribute(ROOT_MARKER_ATTR, id);
  }
  const frozenOriginal = rgbTupleToHex(bgRgb);
  // FIXED THEME by role (never `bucketOf(frozenOriginal)`); crossfade from the
  // frozen original toward it by the intensity factor.
  const fill = surfaceFillFor(el);
  const background = mixCss(frozenOriginal, fill.bg, factor);
  // Tag tinted SEMANTIC surfaces (card/code/banner/comp) with their role token so
  // the scoped role-text rules floor text inside them against THIS surface.
  if (fill.surf && el.getAttribute(SURFACE_TOKEN_ATTR) !== fill.surf) {
    el.setAttribute(SURFACE_TOKEN_ATTR, fill.surf);
  }
  // The surface sets the inherited body-text color for its subtree, floored
  // against its DETERMINISTIC fixed-theme bg (`fill.bg`) — stable + readable.
  const color = roleText(fill.label, fill.bg, false);
  // Preserve the original's transparency: a semi-transparent overlay/scrim stays
  // see-through (themed) instead of becoming an opaque slab over the content.
  const alpha = alphaOf(orig.bg ?? "");
  const bgValue = alpha < 1 ? withAlpha(background, alpha) : background;
  // Soften drop shadows: an element that HAD a box-shadow keeps a gentle, neutral
  // elevation (cards/menus/dialogs still float); elements with no shadow stay flat.
  const shadowDecl =
    orig.boxShadow && orig.boxShadow !== "none"
      ? " box-shadow: 0 1px 3px rgba(0,0,0,0.2), 0 6px 16px rgba(0,0,0,0.12) !important;"
      : "";
  return `[${ROOT_MARKER_ATTR}="${id}"] { background-color: ${bgValue} !important; background-image: none !important; color: ${color} !important; text-shadow: none !important;${shadowDecl} }`;
};
