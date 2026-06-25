/**
 * The MutationObserver wiring: PRE-PAINT in-viewport + DEFERRED off-screen.
 *
 * The observer callback is a MICROTASK (runs after DOM insertion, BEFORE paint),
 * so it SYNCHRONOUSLY themes newly-added / recycled IN-VIEWPORT surfaces right
 * there → no white flash on virtualized grids/lists, even during fast scroll.
 * OFF-SCREEN new nodes + any overflow past the per-callback cap are COALESCED into
 * one trailing-edge flush ~250ms after the last mutation (anti-flicker) and
 * streamed through the same time-sliced drainer.
 *
 * We also watch class/style ATTRIBUTE changes so a RECYCLED node (a virtualized
 * list swapping a row's bg class) is re-evaluated — a node that was not a surface
 * but now owns a background gets themed (it was never frozen, only surfaces are);
 * its stale frozen original is dropped so it re-captures from the live style.
 */
import { EDITABLE_SEL, OBSERVE_OPTS, type Walk } from "./engine-walk";
import { engineWindow } from "./engine-state";
import {
  EARLY_STYLE_ID,
  OVERRIDE_STYLE_ID,
  STYLE_ELEMENT_ID,
} from "./theme-dom-constants";
import type { OriginalStyle } from "./engine-state";

const DEBOUNCE_MS = 250;

/** True when `el` is one of the engine's OWN elements — never re-theme our output. */
const isOwnElement = (el: HTMLElement): boolean =>
  el.id === STYLE_ELEMENT_ID ||
  el.id === OVERRIDE_STYLE_ID ||
  el.id === EARLY_STYLE_ID;

/**
 * Installs the MutationObserver for an apply, driving `walk` for new/recycled
 * subtrees. Disconnects any prior observer, stores the live handle on the window
 * (so reset can tear it down), and begins observing `document.body`.
 */
export const installObserver = (
  walk: Walk,
  doneSet: WeakSet<Element>,
  originals: WeakMap<Element, OriginalStyle>,
): void => {
  const w = engineWindow();
  if (w.__themeMakerObserver) {
    w.__themeMakerObserver.disconnect();
  }

  let pending = new Set<HTMLElement>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = (): void => {
    timer = null;
    for (const el of pending) {
      if (!el.isConnected || isOwnElement(el) || el.closest(EDITABLE_SEL)) {
        continue;
      }
      walk.enqueue(el, true);
    }
    pending = new Set<HTMLElement>();
    if (walk.hasWork() && !walk.isDraining()) {
      walk.drainQueue();
    }
  };

  const schedule = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
    }
    timer = setTimeout(flush, DEBOUNCE_MS);
  };

  const observer = new MutationObserver((mutations) => {
    // Collect the roots this batch touched: added subtrees, plus elements whose
    // class/style changed (recycled rows whose bg may now differ). Dedupe.
    const roots = new Set<HTMLElement>();
    // Recycled (attribute-mutated, not-yet-themed) elements whose frozen original
    // must be re-captured from the new live style.
    const recaptured = new Set<HTMLElement>();
    for (const mm of mutations) {
      if (mm.type === "childList") {
        mm.addedNodes.forEach((n) => {
          if (n instanceof HTMLElement && !isOwnElement(n)) {
            roots.add(n);
          }
        });
      } else if (mm.type === "attributes") {
        const t = mm.target;
        if (
          t instanceof HTMLElement &&
          !isOwnElement(t) &&
          // A frozen, already-themed surface never changes color — skip it (this
          // also ignores our OWN attribute writes, which only touch surfaces).
          !doneSet.has(t)
        ) {
          roots.add(t);
          // A class/style swap on a NON-themed element means it was RECYCLED — its
          // original background may now differ. Drop its FROZEN original so it is
          // RE-CAPTURED from the live (new) computed style; otherwise the stale
          // transparent original would keep it classified as a non-surface and it
          // would stay un-themed. Safe: not a themed surface, no state is lost.
          recaptured.add(t);
        }
      }
    }
    if (roots.size === 0) {
      return;
    }
    for (const el of recaptured) {
      originals.delete(el);
    }
    // Disconnect across our synchronous pre-paint writes so they don't re-enter the
    // observer queue; reconnect right after.
    observer.disconnect();
    // PRE-PAINT: theme the in-/near-viewport surfaces NOW (before this frame
    // paints). Defer the off-screen / overflow remainder.
    const rootList = [...roots].filter((el) => el.isConnected);
    const deferred = walk.processNowInViewport(rootList);
    if (document.body) {
      observer.observe(document.body, OBSERVE_OPTS);
    }
    // Off-screen / overflow → the debounced, time-sliced deferred path.
    if (deferred.length > 0) {
      for (const el of deferred) {
        pending.add(el);
      }
      schedule();
    }
  });
  if (document.body) {
    observer.observe(document.body, OBSERVE_OPTS);
  }
  w.__themeMakerObserver = observer;
};
