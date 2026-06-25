/**
 * In-page ELEMENT PICKER for the custom-theme editor.
 *
 * The always-on content script enters "pick mode" while the in-page floating
 * control (Shadow DOM panel) is shown. In pick mode:
 *  - a HOVER HIGHLIGHT (an isolated, inline-styled, `pointer-events:none` overlay
 *    positioned over the hovered element's bounding rect, at a very high z-index)
 *    tracks the mouse. The overlay is NOT themed by our engine (it carries no
 *    `data-thememaker` attr and is removed before any apply), so it never picks
 *    up palette colors;
 *  - a CLICK (capture phase, `preventDefault` + `stopPropagation`) resolves the
 *    clicked element to a `<tag>|<prop>` OVERRIDE KEY (e.g. `div|background`,
 *    `p|color`, `page|background`) via the local {@link pickKeyFor} and reports
 *    it through `onPicked`. The session RE-ARMS so the user can pick several
 *    elements in a row (the panel stays open);
 *  - an explicit `stop()` (Esc / Done) tears the session down.
 *
 * Elements inside the floating control's own host are EXCLUDED from hovering and
 * picking via the `isExcluded` predicate, so the panel never highlights or
 * recolors itself.
 *
 * This module is SELF-CONTAINED: it speaks the `<tag>|<prop>` override grammar
 * the engine's override layer consumes (`inject.ts`, the `themeMakerOverrides`
 * <style>). It deliberately re-implements its small classifiers (`isButtonLike`,
 * `hasOwnBackground`, rgb→hex) inline rather than importing engine code — the
 * picker only needs a per-tag/prop decision, not the engine's full role taxonomy.
 */
/** The overlay element id (kept distinct from the engine's `<style>`/attrs). */
const OVERLAY_ID = "themeMakerPickOverlay";

/** Detects whether an element is button-like (mirrors the engine's `isButtonLike`). */
const isButtonLike = (el: Element): boolean => {
  const tag = el.tagName.toLowerCase();
  if (tag === "button") {
    return true;
  }
  if (el.getAttribute("role") === "button") {
    return true;
  }
  if (tag === "input") {
    const t = (el.getAttribute("type") || "").toLowerCase();
    if (t === "submit" || t === "button" || t === "reset") {
      return true;
    }
  }
  const cls = (el.getAttribute("class") || "").toLowerCase();
  return /(^|[-_ ])(btn|button)([-_ ]|$)/.test(cls);
};

/**
 * True when the element renders its OWN non-transparent background.
 *
 * `getComputedStyle().backgroundColor` is always an `rgb()`/`rgba()` value (or
 * `"transparent"`), and {@link rgbToHex} already encodes exactly "is this a real,
 * non-transparent color?" — it returns null for `transparent` and for alpha 0.
 * So "has own background" is precisely "that value parses to a color".
 */
const hasOwnBackground = (el: Element): boolean => {
  try {
    return rgbToHex(getComputedStyle(el).backgroundColor) !== null;
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
  `${el.tagName.toLowerCase()}|${propForElement(el)}`;

/**
 * Parses an rgb()/rgba() computed value to `#rrggbb`, or null if unparseable OR
 * fully transparent. A transparent value (`transparent`, or alpha 0) returns
 * null — NEVER `#000000` — so a transparent element never seeds a BLACK pick
 * (which would otherwise paint every element of that tag black).
 */
const rgbToHex = (value: string): string | null => {
  const s = value.trim().toLowerCase();
  if (s === "transparent") {
    return null;
  }
  const m = s.match(
    /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/,
  );
  if (!m) {
    return null;
  }
  if (m[4] !== undefined && parseFloat(m[4]) === 0) {
    return null; // fully transparent → not a real color
  }
  const h = (n: string): string => Number(n).toString(16).padStart(2, "0");
  return `#${h(m[1])}${h(m[2])}${h(m[3])}`;
};

/**
 * Seed when NOTHING opaque is found walking up the ancestor chain for a
 * background pick. We assume a default white page — the common case. CAVEAT: on a
 * page whose base is dark via some mechanism we can't read (e.g. a body bg the
 * walk missed), this seeds a too-light starting swatch; the user simply re-picks
 * the color. Never seed black here (a transparent element must not paint a tag
 * black). See {@link rgbToHex}.
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
        const hex = rgbToHex(getComputedStyle(node).backgroundColor);
        if (hex) {
          return hex;
        }
        node = node.parentElement;
      }
      return ASSUMED_PAGE_BG; // nothing opaque up the tree → assume a white page
    }
    return rgbToHex(getComputedStyle(el).color) ?? NEUTRAL_TEXT;
  } catch {
    return NEUTRAL_TEXT;
  }
};

/** Callbacks the picker reports through. */
export interface PickHandlers {
  /**
   * An element was picked. `key` is `<tag>|<prop>`; `currentColor` is the
   * element's current color (to seed the row). The session RE-ARMS for more.
   */
  onPicked: (key: string, currentColor: string) => void;
  /**
   * Predicate marking an element as part of the floating control's own host, so
   * it is never highlighted or picked. Defaults to "nothing is excluded".
   */
  isExcluded?: (el: Element) => boolean;
}

/** A live pick session; `stop()` tears it down (idempotent). */
export interface PickSession {
  stop(): void;
  /** Whether the session is still active. */
  readonly active: boolean;
}

/**
 * Starts pick mode and returns a session. Installs capture-phase listeners so the
 * page can't act on the hover/click first; positions an isolated overlay over the
 * hovered element; resolves the role on each click and RE-ARMS (the floating
 * control stays open so several elements can be picked in a row). The session
 * ends only on an explicit `stop()` (Esc / Done in the panel), which removes all
 * listeners + the overlay.
 */
export const startPick = (handlers: PickHandlers): PickSession => {
  let active = true;
  let overlay: HTMLDivElement | null = null;
  const isExcluded = handlers.isExcluded ?? (() => false);

  const ensureOverlay = (): HTMLDivElement => {
    if (overlay) {
      return overlay;
    }
    const el = document.createElement("div");
    el.id = OVERLAY_ID;
    // Inline styles only (isolated): a SUBTLE 1px outline highlight, NO fill, so
    // the element underneath stays fully visible while hovered. No pointer events
    // (hover/click target the element underneath), max z-index.
    el.style.cssText = [
      "position: fixed",
      "z-index: 2147483647",
      "pointer-events: none",
      "background: transparent",
      "outline: 1px solid rgba(79, 70, 229, 0.9)",
      "outline-offset: -1px",
      "box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.6)",
      "border-radius: 2px",
      "transition: none",
      "margin: 0",
      "padding: 0",
      "box-sizing: border-box",
    ].join(";");
    (document.body || document.documentElement).appendChild(el);
    overlay = el;
    return el;
  };

  const positionOverlay = (el: Element): void => {
    const rect = el.getBoundingClientRect();
    const o = ensureOverlay();
    o.style.left = `${rect.left}px`;
    o.style.top = `${rect.top}px`;
    o.style.width = `${rect.width}px`;
    o.style.height = `${rect.height}px`;
  };

  const removeOverlay = (): void => {
    // `overlay` is the only handle to the only `#OVERLAY_ID` we ever create
    // (always via `ensureOverlay`), so removing it is sufficient.
    overlay?.remove();
    overlay = null;
  };

  const onMove = (e: MouseEvent): void => {
    const target = e.target as Element | null;
    // Only highlight elements that will actually resolve to a themeable role —
    // so the user can see (and only pick) elements a pick will visibly change.
    if (
      !target ||
      target.id === OVERLAY_ID ||
      isExcluded(target) ||
      !isPickable(target)
    ) {
      removeOverlay();
      return;
    }
    positionOverlay(target);
  };

  // The overlay is fixed-positioned from the element's viewport rect, so a
  // scroll without a mouse move would strand it. Drop it on scroll; the next
  // mousemove re-draws it on whatever is now under the cursor.
  const onScroll = (): void => {
    removeOverlay();
  };

  const onClick = (e: MouseEvent): void => {
    const target = e.target as Element | null;
    // Clicks on the floating control itself pass through untouched, so its own
    // buttons/inputs work normally.
    if (!target || isExcluded(target)) {
      return;
    }
    // Swallow the click either way (we're in pick mode, the page shouldn't act),
    // but only REGISTER a pick for elements that resolve to a themeable role.
    e.preventDefault();
    e.stopPropagation();
    if (!isPickable(target)) {
      return;
    }
    // RE-ARM: report the tag override + its current color, but keep the session
    // live so the user can pick several elements in a row (panel owns stop).
    const prop = propForElement(target);
    handlers.onPicked(pickKeyFor(target), currentColorFor(target, prop));
  };

  const teardown = (): void => {
    if (!active) {
      return;
    }
    active = false;
    document.removeEventListener("mousemove", onMove, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("scroll", onScroll, true);
    removeOverlay();
  };

  document.addEventListener("mousemove", onMove, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("scroll", onScroll, true);

  return {
    stop: teardown,
    get active() {
      return active;
    },
  };
};

export { OVERLAY_ID };
