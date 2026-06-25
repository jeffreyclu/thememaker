/**
 * PURE pick RESOLVERS for {@link usePickSession}: given a clicked/hovered
 * element, decide whether it's pickable, which CSS property a pick recolors, the
 * resulting `<tag>|<prop>` override key, and the element's current color (to seed
 * the row).
 *
 * A small pure helper (no React, no `chrome.*`) so the pick hook stays a thin
 * side-effect. The button classifier and the rgb()→hex parser are shared with
 * the engine, in `lib/classify.ts` and `lib/color/color-runtime.ts`; this module
 * imports them rather than re-implementing.
 */
import { isButtonLike } from "./classify";
import { cssColorToHex } from "./color/color-runtime";
import { makeOverrideKey } from "./override-keys";

/**
 * True when the element renders its own non-transparent background.
 *
 * `getComputedStyle().backgroundColor` is always an `rgb()`/`rgba()` value (or
 * `"transparent"`), and {@link cssColorToHex} returns null for `transparent` and
 * for alpha 0. So "has own background" is precisely "that value parses to a color".
 */
const hasOwnBackground = (el: Element): boolean => {
  try {
    return cssColorToHex(getComputedStyle(el).backgroundColor) !== null;
  } catch {
    return false;
  }
};

/**
 * Tags that can't be meaningfully recolored (media + script/style + SVG
 * internals + void structural tags). Everything else — containers, toolbars,
 * the body, hr/dividers, text — is pickable, since per-tag overrides apply to
 * any tag.
 */
const NON_PICKABLE_TAGS = new Set([
  "img",
  "svg",
  "path",
  "use",
  "g",
  "defs",
  "symbol",
  "marker",
  "canvas",
  "video",
  "audio",
  "picture",
  "iframe",
  "embed",
  "object",
  "source",
  "track",
  "br",
  "wbr",
  "script",
  "style",
  "noscript",
  "map",
  "area",
  "col",
  "colgroup",
]);

/** True when `el` has a direct (immediate) non-whitespace text node child. */
const hasDirectText = (el: Element): boolean => {
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === 3 && (node.textContent ?? "").trim().length > 0) {
      return true;
    }
  }
  return false;
};

/** Whether `el` is a recolorable element (anything that's not media/structural). */
export const isPickable = (el: Element): boolean =>
  !NON_PICKABLE_TAGS.has(el.tagName.toLowerCase());

/**
 * The CSS property a pick recolors for `el`: buttons + html/body + any element
 * that owns a background → its background; a text-bearing leaf → its text color;
 * a plain container/wrapper → its background (so toolbars/sections recolor).
 */
export const propForElement = (el: Element): "background" | "color" => {
  const tag = el.tagName.toLowerCase();
  if (tag === "html" || tag === "body" || isButtonLike(el)) {
    return "background";
  }
  if (hasOwnBackground(el)) {
    return "background";
  }
  return hasDirectText(el) ? "color" : "background";
};

/** The per-tag override key for a clicked element: `<tag>|<background|color>`. */
export const pickKeyFor = (el: Element): string =>
  makeOverrideKey(el.tagName.toLowerCase(), propForElement(el));

/**
 * Seed when nothing opaque is found walking up the ancestor chain for a
 * background pick — assume a default white page. On a page whose base is dark via
 * a mechanism the walk can't read (e.g. a missed body bg), this seeds a too-light
 * starting swatch and the user re-picks. Never seed black here, so a transparent
 * element doesn't paint a tag black. See {@link cssColorToHex}.
 */
const ASSUMED_PAGE_BG = "#ffffff";
/** Seed for an unparseable text color or any thrown lookup — a neutral mid-gray. */
const NEUTRAL_TEXT = "#808080";

/**
 * The element's current color for `prop`, as `#rrggbb`, to pre-fill the input.
 * For a background on a transparent element, walks up to the first ancestor with
 * a real (opaque) background, so the picker seeds with what is visible behind the
 * element — never black, and no jarring jump on apply.
 */
export const currentColorFor = (
  el: Element,
  prop: "background" | "color",
): string => {
  try {
    if (prop === "background") {
      let node: Element | null = el;
      while (node) {
        const hex = cssColorToHex(getComputedStyle(node).backgroundColor);
        if (hex) {
          return hex;
        }
        node = node.parentElement;
      }
      return ASSUMED_PAGE_BG; // nothing opaque up the tree → assume a white page
    }
    return cssColorToHex(getComputedStyle(el).color) ?? NEUTRAL_TEXT;
  } catch {
    return NEUTRAL_TEXT;
  }
};
