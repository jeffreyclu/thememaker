/**
 * `usePickSession` — the in-page element-pick session, as one effect.
 *
 * While the panel is mounted it installs capture-phase listeners (so the page
 * can't act first) and a hover overlay tracking the element under the cursor.
 * Each click resolves a `<tag>|<prop>` key + the element's current color (the
 * `lib/pick-resolve` helpers) and commits the pick via {@link useApplyOverrides}
 * (dispatch → apply live → persist). The panel host (and its shadow root) is
 * excluded so the control never highlights/recolors itself. Cleanup removes every
 * listener + the overlay.
 *
 * The listeners install once and commit through the stable `pick` callback, so
 * re-picks don't re-install them.
 */
import { useEffect } from "react";

import { useApplyOverrides } from "./useApplyOverrides";
import {
  currentColorFor,
  isPickable,
  propForElement,
} from "../../lib/pick-resolve";
import { makeOverrideKey } from "../../lib/override-keys";
import { PANEL_HOST_ID } from "..";

/** The hover-overlay id (distinct from the engine's `<style>`/attrs). */
const OVERLAY_ID = "themeMakerPickOverlay";

export const usePickSession = (): void => {
  const { pick } = useApplyOverrides();

  useEffect(() => {
    const isExcluded = (el: Element): boolean =>
      el.closest(`#${PANEL_HOST_ID}`) !== null;
    let overlay: HTMLDivElement | null = null;

    const ensureOverlay = (): HTMLDivElement => {
      if (overlay) {
        return overlay;
      }
      const el = document.createElement("div");
      el.id = OVERLAY_ID;
      // Inline styles only (isolated): a 1px outline highlight, no fill, no
      // pointer events (hover/click target the element underneath), max z.
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

    const removeOverlay = (): void => {
      overlay?.remove();
      overlay = null;
    };

    const positionOverlay = (el: Element): void => {
      const rect = el.getBoundingClientRect();
      const o = ensureOverlay();
      o.style.left = `${rect.left}px`;
      o.style.top = `${rect.top}px`;
      o.style.width = `${rect.width}px`;
      o.style.height = `${rect.height}px`;
    };

    const onMove = (e: MouseEvent): void => {
      const target = e.target as Element | null;
      // Only highlight elements that resolve to a themeable role.
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

    // The overlay is positioned from the viewport rect, so a scroll without a
    // move would strand it. Drop it; the next move re-draws it.
    const onScroll = (): void => removeOverlay();

    const onClick = (e: MouseEvent): void => {
      const target = e.target as Element | null;
      // Clicks on the floating control itself pass through untouched.
      if (!target || isExcluded(target)) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      if (!isPickable(target)) {
        return;
      }
      // Resolve the tag override + its seed color, then commit (dispatch derives
      // the next map, applies live, and persists).
      const prop = propForElement(target);
      const key = makeOverrideKey(target.tagName.toLowerCase(), prop);
      pick(key, currentColorFor(target, prop));
    };

    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("scroll", onScroll, true);

    return () => {
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("scroll", onScroll, true);
      removeOverlay();
    };
  }, [pick]);
};

export { OVERLAY_ID };
