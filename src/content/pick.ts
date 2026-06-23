/**
 * In-page ELEMENT PICKER for the custom-theme editor.
 *
 * The always-on content script enters "pick mode" on a `START_PICK` message from
 * the popup. In pick mode:
 *  - a HOVER HIGHLIGHT (an isolated, inline-styled, `pointer-events:none` overlay
 *    positioned over the hovered element's bounding rect, at a very high z-index)
 *    tracks the mouse. The overlay is NOT themed by our engine (it carries no
 *    `data-thememaker` attr and is removed before any apply), so it never picks
 *    up palette colors;
 *  - a CLICK (capture phase, `preventDefault` + `stopPropagation`) resolves the
 *    clicked element's semantic role via the shared `roleOfElement` core, reports
 *    the override-key back through `onPicked`, and exits pick mode;
 *  - Esc cancels (reports a cancellation), as does an explicit `stop()`.
 *
 * The classifier here is the pure-core `roleOfElement` (from `mapping.ts`) fed a
 * `RoleClassifierInput` built from the LIVE element — so the picker and the
 * engine walk agree on every element's role.
 */
import {
  overrideKeyForElement,
  type RoleClassifierInput,
} from "../lib/mapping";

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

/** True when the element renders its OWN non-transparent background. */
const hasOwnBackground = (el: Element): boolean => {
  try {
    const bg = getComputedStyle(el).backgroundColor;
    if (!bg) {
      return false;
    }
    const s = bg.trim().toLowerCase();
    if (s === "transparent") {
      return false;
    }
    const m = s.match(/rgba?\([^)]*\)/);
    if (m) {
      // Fully-transparent alpha → no own background.
      const parts = s.replace(/rgba?\(|\)/g, "").split(",");
      const a = parts.length === 4 ? parseFloat(parts[3]) : 1;
      return a > 0;
    }
    return s.startsWith("#");
  } catch {
    return false;
  }
};

/**
 * The document-order index of `el` among button-like elements (so the engine's
 * "first button is the dominant CTA" heuristic is reproduced). Returns 0 for
 * non-buttons (unused there).
 */
const buttonOrderOf = (el: Element): number => {
  if (!isButtonLike(el)) {
    return 0;
  }
  try {
    const btns = document.querySelectorAll(
      'button, [role="button"], input[type="submit"], input[type="button"], .btn, .button',
    );
    for (let i = 0; i < btns.length; i += 1) {
      if (btns[i] === el) {
        return i;
      }
    }
  } catch {
    // best-effort
  }
  return 0;
};

/** Builds the pure-core classifier input from a live DOM element. */
export const classifierInputFor = (el: Element): RoleClassifierInput => ({
  tagName: el.tagName.toLowerCase(),
  className: el.getAttribute("class") ?? undefined,
  text: (el.textContent || "").toLowerCase().trim() || undefined,
  buttonLike: isButtonLike(el),
  hasOwnBackground: hasOwnBackground(el),
  buttonOrder: buttonOrderOf(el),
});

/**
 * Resolves the override-key (a `PaletteRoles` key) for a clicked element, using
 * the SHARED pure classifier so the picker and the engine agree on roles.
 */
export const overrideKeyFor = (el: Element): string =>
  overrideKeyForElement(classifierInputFor(el));

/** Callbacks the picker reports through. */
export interface PickHandlers {
  /** A role was picked (the override-key). */
  onPicked: (role: string) => void;
  /** Pick mode ended without a pick (Esc / stop). */
  onCancelled: () => void;
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
 * hovered element; resolves the role on click; cancels on Esc. All listeners +
 * the overlay are removed on the first pick / cancel / `stop()`.
 */
export const startPick = (handlers: PickHandlers): PickSession => {
  let active = true;
  let overlay: HTMLDivElement | null = null;

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
    overlay?.remove();
    overlay = null;
    document.getElementById(OVERLAY_ID)?.remove();
  };

  const onMove = (e: MouseEvent): void => {
    const target = e.target as Element | null;
    if (!target || target.id === OVERLAY_ID) {
      return;
    }
    positionOverlay(target);
  };

  const teardown = (): void => {
    if (!active) {
      return;
    }
    active = false;
    document.removeEventListener("mousemove", onMove, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKey, true);
    removeOverlay();
  };

  function onClick(e: MouseEvent): void {
    // Capture phase: stop the page from acting on this click.
    e.preventDefault();
    e.stopPropagation();
    const target = e.target as Element | null;
    if (!target) {
      return;
    }
    const role = overrideKeyFor(target);
    teardown();
    handlers.onPicked(role);
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      teardown();
      handlers.onCancelled();
    }
  }

  document.addEventListener("mousemove", onMove, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKey, true);

  return {
    stop: () => {
      const wasActive = active;
      teardown();
      if (wasActive) {
        handlers.onCancelled();
      }
    },
    get active() {
      return active;
    },
  };
};

export { OVERLAY_ID };
