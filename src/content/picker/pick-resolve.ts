/**
 * PURE pick RESOLVERS: given a clicked/hovered element, decide whether it's
 * pickable, which CSS property a pick recolors, the resulting `<tag>|<prop>`
 * override key, and the element's current color (to seed the row).
 *
 * Split out of `pick.ts` so the live session (overlay + listeners) stays small.
 * The button classifier and the rgb()→hex parser are SHARED with the engine, so
 * they live in `lib/classify.ts` (D2) and `lib/color-runtime.ts` (D3); this
 * module imports them rather than re-implementing them.
 */
import { isButtonLike } from "../../lib/classify";
import { cssColorToHex } from "../../lib/color/color-runtime";
import { makeOverrideKey } from "../../lib/override-grammar";

/**
 * True when the element renders its OWN non-transparent background.
 *
 * `getComputedStyle().backgroundColor` is always an `rgb()`/`rgba()` value (or
 * `"transparent"`), and {@link cssColorToHex} already encodes exactly "is this a
 * real, non-transparent color?" — it returns null for `transparent` and for
 * alpha 0. So "has own background" is precisely "that value parses to a color".
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
 * internals + void structural tags). EVERYTHING else — containers, toolbars,
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

/** True when `el` has a DIRECT (immediate) non-whitespace text node child. */
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
 * that owns a background → its BACKGROUND; a text-bearing leaf → its text COLOR;
 * a plain container/wrapper → its BACKGROUND (so toolbars/sections recolor).
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

/** The per-TAG override key for a clicked element: `<tag>|<background|color>`. */
export const pickKeyFor = (el: Element): string =>
  makeOverrideKey(el.tagName.toLowerCase(), propForElement(el));

/**
 * Seed when NOTHING opaque is found walking up the ancestor chain for a
 * background pick. We assume a default white page — the common case. CAVEAT: on a
 * page whose base is dark via some mechanism we can't read (e.g. a body bg the
 * walk missed), this seeds a too-light starting swatch; the user simply re-picks
 * the color. Never seed black here (a transparent element must not paint a tag
 * black). See {@link cssColorToHex}.
 */
const ASSUMED_PAGE_BG = "#ffffff";
/** Seed for an unparseable text color or any thrown lookup — a neutral mid-gray. */
const NEUTRAL_TEXT = "#808080";

/**
 * The element's CURRENT color for `prop`, as `#rrggbb`, to pre-fill the input.
 * For a BACKGROUND on a transparent element we walk UP to the first ancestor
 * with a real (opaque) background, so the picker seeds with what is actually
 * VISIBLE behind the element — never black, and no jarring jump on apply.
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
