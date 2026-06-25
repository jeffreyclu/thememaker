/**
 * Pure MutationObserver batch parsing for the Engine's observer loop.
 *
 * This is the stateless parsing of one mutation batch:
 *  - which added subtrees / recycled (class/style-mutated) elements this batch
 *    touched (the roots to re-theme), and
 *  - which non-themed elements had their class/style swapped, so their stale
 *    frozen original must be re-captured from the new live style (e.g. a
 *    virtualized list swapping a row's bg class).
 * It also owns `isOwnElement` (never re-theme the engine's own <style> output)
 * and builds the live observer itself (`createSurfaceObserver`).
 */
import {
  EARLY_STYLE_ID,
  OVERRIDE_STYLE_ID,
  STYLE_ELEMENT_ID,
} from "./theme-dom-constants";
import { paintViewport } from "./engine-walk";
import { OBSERVE_OPTS } from "./engine-walk-geom";
import type { SurfaceContext } from "./engine-surface";
import type { OriginalStyle } from "./engine-types";

/** True when `el` is one of the engine's own elements; never re-theme our output. */
export const isOwnElement = (el: HTMLElement): boolean =>
  el.id === STYLE_ELEMENT_ID ||
  el.id === OVERRIDE_STYLE_ID ||
  el.id === EARLY_STYLE_ID;

/** The roots a mutation batch touched + the recycled originals to re-capture. */
export interface MutationBatch {
  roots: Set<HTMLElement>;
  recaptured: Set<HTMLElement>;
}

/**
 * Parses a mutation batch into the added/recycled roots to re-theme and the
 * recycled (attribute-mutated, not-yet-themed) elements whose frozen original
 * must be dropped. A frozen, already-themed surface (`doneSet`) never changes
 * color, so attribute changes on it are ignored (this also skips our own writes).
 */
export const parseMutations = (
  mutations: MutationRecord[],
  doneSet: WeakSet<Element>,
): MutationBatch => {
  const roots = new Set<HTMLElement>();
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
      if (t instanceof HTMLElement && !isOwnElement(t) && !doneSet.has(t)) {
        roots.add(t);
        // A class/style swap on a non-themed element means it was recycled, so its
        // original background may now differ. Drop its frozen original so it is
        // re-captured from the live (new) computed style.
        recaptured.add(t);
      }
    }
  }
  return { roots, recaptured };
};

/** The Engine callbacks/state the surface observer drives. */
export interface ObserverDeps {
  doneSet: WeakSet<Element>;
  originals: WeakMap<Element, OriginalStyle>;
  /** The active per-element paint context (null before the first apply). */
  getCtx: () => SurfaceContext | null;
  /** Append themed rules onto the live <style>. */
  appendRules: (rules: string[]) => void;
  /** Hand the off-screen / overflow roots to the debounced deferred path. */
  deferOffscreen: (roots: HTMLElement[]) => void;
}

/**
 * Builds the live MutationObserver: pre-paints in-/near-viewport new + recycled
 * surfaces synchronously (no white flash) and defers the off-screen remainder.
 * Disconnects itself across its own pre-paint writes so they don't re-enter its
 * queue, then reconnects. The Engine owns the observe()/disconnect() lifecycle.
 */
export const createSurfaceObserver = (deps: ObserverDeps): MutationObserver => {
  const observer = new MutationObserver((mutations) => {
    const { roots, recaptured } = parseMutations(mutations, deps.doneSet);
    if (roots.size === 0) {
      return;
    }
    // Drop each recycled element's stale frozen original so it re-captures.
    for (const el of recaptured) {
      deps.originals.delete(el);
    }
    observer.disconnect();
    const rootList = [...roots].filter((el) => el.isConnected);
    const ctx = deps.getCtx();
    const deferred = ctx
      ? paintViewport(rootList, ctx, deps.appendRules)
      : rootList;
    if (document.body) {
      observer.observe(document.body, OBSERVE_OPTS);
    }
    if (deferred.length > 0) {
      deps.deferOffscreen(deferred);
    }
  });
  return observer;
};
