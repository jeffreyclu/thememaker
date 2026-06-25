/**
 * Pure DOM-geometry + scheduling helpers for the time-sliced walk.
 *
 * Split out of `engine-walk.ts` so the scheduler stays focused on the queue: this
 * holds the viewport math (above-the-fold prioritization), the subtree flattener
 * (which excludes editable regions), the monotonic clock, and the idle-yield — all
 * pure functions over the DOM with no per-apply state.
 */
import { isEditableRoot } from "./role-classify";

// Selector for editable subtrees, EXCLUDED from the walk (typing churns them; their
// text inherits the right color). Shared by `expand` + the observer's flush.
export const EDITABLE_SEL =
  'input, textarea, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]';

// Observe childList (new nodes) AND class/style attributes (recycled nodes whose
// bg changes). Shared by the initial observe + every disconnect/reconnect.
export const OBSERVE_OPTS: MutationObserverInit = {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ["class", "style"],
};

/** A monotonic clock — `performance.now()` when available, else `Date.now()`. */
export const now = (): number =>
  typeof performance !== "undefined" && performance.now
    ? performance.now()
    : Date.now();

/** Defers `cb` to the next idle period (requestIdleCallback) or a short timeout. */
export const yieldThen = (cb: () => void): void => {
  const ric = (
    window as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: unknown) => void;
    }
  ).requestIdleCallback;
  if (ric) {
    ric(() => cb(), { timeout: 200 });
  } else {
    setTimeout(cb, 16);
  }
};

const vh = (): number =>
  window.innerHeight || document.documentElement.clientHeight || 0;
const vw = (): number =>
  window.innerWidth || document.documentElement.clientWidth || 0;

/** The pre-paint band: theme ~2 viewports past the fold so overscan rows are ready. */
export const syncViewportMargin = (): number => vh() * 2;

/**
 * Is `el` (even partially) within the current viewport (+`margin` band)? Theme
 * ABOVE-THE-FOLD content FIRST. In jsdom every rect is 0×0 at (0,0) → in-viewport,
 * so the split is a no-op there (DOM order preserved; unit tests unaffected).
 */
export const inViewport = (el: HTMLElement, margin = 0): boolean => {
  let r: DOMRect;
  try {
    r = el.getBoundingClientRect();
  } catch {
    return true;
  }
  const h = vh();
  const w2 = vw();
  if (r.width === 0 && r.height === 0 && r.top === 0 && r.left === 0) {
    return true;
  }
  return (
    r.bottom >= -margin && r.right >= 0 && r.top <= h + margin && r.left <= w2
  );
};

/** Flatten a subtree to a list, EXCLUDING editable regions (typing churns them). */
export const expand = (rootEl: HTMLElement): HTMLElement[] => {
  if (isEditableRoot(rootEl)) {
    return [];
  }
  const els: HTMLElement[] = [rootEl];
  const d = rootEl.querySelectorAll<HTMLElement>("*");
  const hasEditable = rootEl.querySelector(EDITABLE_SEL) !== null;
  if (!hasEditable) {
    for (let i = 0; i < d.length; i += 1) {
      els.push(d[i]);
    }
    return els;
  }
  for (let i = 0; i < d.length; i += 1) {
    const el = d[i];
    if (el.closest(EDITABLE_SEL)) {
      continue;
    }
    els.push(el);
  }
  return els;
};
