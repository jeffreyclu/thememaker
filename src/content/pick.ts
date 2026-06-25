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
 * This module owns the live SESSION (overlay + capture-phase listeners); the
 * pure pick resolvers (`isPickable`, `propForElement`, `pickKeyFor`,
 * `currentColorFor`) live in `pick-resolve.ts` and are re-exported here so the
 * content script + tests keep one import surface.
 */
import {
  currentColorFor,
  isPickable,
  pickKeyFor,
  propForElement,
} from "./pick-resolve";

export { currentColorFor, isPickable, pickKeyFor, propForElement };

/** The overlay element id (kept distinct from the engine's `<style>`/attrs). */
const OVERLAY_ID = "themeMakerPickOverlay";

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
