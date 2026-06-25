/**
 * `usePickSession` — the in-page ELEMENT PICK session, folded into one effect.
 *
 * This is the React home of the former vanilla `pick.ts`: while the panel is
 * mounted it installs CAPTURE-PHASE listeners (so the page can't act first) and a
 * hover OVERLAY tracking the element under the cursor, and RE-ARMS — each click
 * resolves a `<tag>|<prop>` key + the element's current color (the pure
 * `pick-resolve` helpers), dispatches a `pick` (re-rendering the rows), and
 * applies + persists the result live. The panel host (and its shadow root) is
 * EXCLUDED so the control never highlights/recolors itself. Cleanup removes every
 * listener + the overlay (the vanilla `stop()` / `hidePicker` teardown).
 *
 * Empty-ish deps: the listeners install ONCE and read live state through the
 * stable `getTheme` accessor + `dispatch`, so re-picks never re-arm.
 */
import { useEffect } from "react";

import { optionsFor } from "../client/apply-options";
import {
  currentColorFor,
  isPickable,
  pickKeyFor,
  propForElement,
} from "./pick-resolve";
import { persistOverrides } from "../client/persist-overrides";
import { overridesReducer, usePickerActions } from "../state/PickerProvider";
import { engine } from "../../lib/engine";
import { PANEL_HOST_ID } from "../session";

/** The hover-overlay id (kept distinct from the engine's `<style>`/attrs). */
const OVERLAY_ID = "themeMakerPickOverlay";

export const usePickSession = (): void => {
  const { getTheme, dispatch } = usePickerActions();

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
      // Inline styles only (isolated): a SUBTLE 1px outline highlight, NO fill,
      // no pointer events (hover/click target the element underneath), max z.
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
      // RE-ARM: record the tag override seeded with its current color, then apply
      // + persist. The reducer derives the next map (single source of truth).
      const prop = propForElement(target);
      const key = pickKeyFor(target);
      const action = {
        type: "pick" as const,
        key,
        currentColor: currentColorFor(target, prop),
      };
      const { palette, intensity, overrides } = getTheme();
      const next = overridesReducer(overrides, action);
      dispatch(action);
      engine.applyWhenReady(palette, optionsFor(intensity, next));
      void persistOverrides({ palette, intensity, overrides: next });
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
  }, [getTheme, dispatch]);
};

export { OVERLAY_ID };
