/**
 * The TIME-SLICED surface-walk SLICE functions — the per-slice work the Engine's
 * scheduler drives, with NO state of its own.
 *
 * The Engine owns the work queue + the draining flag + the scheduling (the loop
 * that reschedules itself until drained); this module is the stateless body of one
 * slice: flatten a subtree into queued work (`enqueueInto`), drain a budgeted slice
 * from the queue (`drainSlice`), and the observer's synchronous PRE-PAINT pass
 * (`paintViewport`). Each takes the Engine's queue/state explicitly, so there are
 * no `window.__themeMaker*` globals — the painter (`engine-surface.ts`) still owns
 * the per-element decision.
 */
import {
  processElement,
  MAX_THEMED,
  type SurfaceContext,
} from "./engine-surface";
import {
  EDITABLE_SEL,
  expand,
  inViewport,
  now,
  syncViewportMargin,
} from "./engine-walk-geom";

// Re-exported so the Engine keeps one import surface for the walk constants.
export { EDITABLE_SEL };

const SLICE_BUDGET_MS = 4;
const MAX_NODES_PER_SLICE = 400;

// Bound the synchronous pre-paint work per observer callback so a huge burst can't
// jank (the overflow goes to the deferred path).
const SYNC_CAP = 600;

/** A flattened subtree + a cursor, so a slice can pause mid-subtree and resume. */
export interface WorkItem {
  els: HTMLElement[];
  i: number;
}

/**
 * Flatten + queue a subtree (optionally viewport-prioritized) into `work`. A
 * fully-done subtree with no descendants is skipped; large prioritized subtrees
 * split into a visible-first item + an off-screen remainder.
 */
export const enqueueInto = (
  work: WorkItem[],
  doneSet: WeakSet<Element>,
  rootEl: HTMLElement,
  prioritizeViewport = false,
): void => {
  if (doneSet.has(rootEl) && rootEl.querySelectorAll("*").length === 0) {
    return;
  }
  const els = expand(rootEl);
  if (!prioritizeViewport || els.length < 200) {
    work.push({ els, i: 0 });
    return;
  }
  const visible: HTMLElement[] = [];
  const rest: HTMLElement[] = [];
  for (const el of els) {
    (inViewport(el) ? visible : rest).push(el);
  }
  if (visible.length > 0) {
    work.push({ els: visible, i: 0 });
  }
  if (rest.length > 0) {
    work.push({ els: rest, i: 0 });
  }
};

/**
 * Drains ONE time-sliced slice from `work`, painting each element through the
 * context and appending the rules via `appendRules`. Stops the queue once the
 * themed budget is hit. Mutates `work` in place; the Engine reschedules if work
 * remains.
 */
export const drainSlice = (
  work: WorkItem[],
  ctx: SurfaceContext,
  appendRules: (rules: string[]) => void,
): void => {
  const start = now();
  const rules: string[] = [];
  let processed = 0;
  if (ctx.state.themedCount >= MAX_THEMED) {
    work.length = 0;
  }
  outer: while (work.length > 0) {
    const item = work[0];
    while (item.i < item.els.length) {
      const rule = processElement(item.els[item.i], ctx);
      item.i += 1;
      processed += 1;
      if (rule !== null) {
        rules.push(rule);
      }
      if (
        processed >= MAX_NODES_PER_SLICE ||
        (processed >= 64 && now() - start >= SLICE_BUDGET_MS)
      ) {
        if (item.i >= item.els.length) {
          work.shift();
        }
        if (ctx.state.themedCount >= MAX_THEMED) {
          work.length = 0;
        }
        break outer;
      }
    }
    work.shift();
  }
  appendRules(rules);
};

/**
 * PRE-PAINT: process `roots` (added/recycled subtrees) NOW for their in-/near-
 * viewport surfaces, appending their rules synchronously (no white flash). The
 * band is ~2 viewports past the fold so overscan rows are themed before scroll;
 * off-screen / overflow roots are RETURNED for the deferred path.
 */
export const paintViewport = (
  roots: HTMLElement[],
  ctx: SurfaceContext,
  appendRules: (rules: string[]) => void,
): HTMLElement[] => {
  const margin = syncViewportMargin();
  const rules: string[] = [];
  const deferred: HTMLElement[] = [];
  let budget = SYNC_CAP;
  for (const root of roots) {
    // Never theme inside an editable region (typing churns it; its text inherits
    // the right color) — keeps the compose box flicker-free.
    if (root.closest(EDITABLE_SEL)) {
      continue;
    }
    if (budget <= 0) {
      deferred.push(root);
      continue;
    }
    const els = expand(root);
    let anyDeferred = false;
    for (const el of els) {
      if (budget <= 0) {
        anyDeferred = true;
        break;
      }
      if (!inViewport(el, margin)) {
        anyDeferred = true; // off-screen → leave for the deferred walk
        continue;
      }
      const rule = processElement(el, ctx);
      budget -= 1;
      if (rule !== null) {
        rules.push(rule);
      }
    }
    // If any element in this subtree was off-screen or hit the cap, re-enqueue the
    // WHOLE subtree to the deferred path; `doneSet` makes the already-themed ones
    // cheap no-ops, so only the leftover (off-screen) surfaces do work.
    if (anyDeferred) {
      deferred.push(root);
    }
  }
  appendRules(rules);
  return deferred;
};
