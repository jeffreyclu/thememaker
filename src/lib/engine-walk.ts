/**
 * The TIME-SLICED surface walk: the scheduler that drains a queue of subtrees
 * through the per-element painter without ever blocking the main thread.
 *
 * The walk (initial AND incremental) processes elements until a small per-slice
 * budget is spent, then YIELDS (requestIdleCallback / setTimeout) and resumes — so
 * a huge/churny DOM never janks. It writes themed rules into the engine's single
 * `<style>` in place, prioritizes ABOVE-THE-FOLD content first (a viewport split),
 * and feeds the PRE-PAINT path that themes in-/near-viewport surfaces synchronously
 * inside the observer's microtask (no white flash on virtualized grids).
 *
 * This module owns the per-apply mutable walk state (the work queue + draining
 * flag); the painter (`engine-surface.ts`) owns the per-element decision and the
 * observer (`engine-observer.ts`) drives `enqueue`/`processNowInViewport`.
 */
import {
  processElement,
  MAX_THEMED,
  type SurfaceContext,
} from "./engine-surface";
import {
  EDITABLE_SEL,
  OBSERVE_OPTS,
  expand,
  inViewport,
  now,
  syncViewportMargin,
  yieldThen,
} from "./engine-walk-geom";
import { engineWindow } from "./engine-state";

// Re-exported so `engine-observer.ts` keeps one import surface for the walk.
export { EDITABLE_SEL, OBSERVE_OPTS };

const SLICE_BUDGET_MS = 4;
const MAX_NODES_PER_SLICE = 400;

// Bound the synchronous pre-paint work per observer callback so a huge burst can't
// jank (the overflow goes to the deferred path).
const SYNC_CAP = 600;

/** A flattened subtree + a cursor, so a slice can pause mid-subtree and resume. */
interface WorkItem {
  els: HTMLElement[];
  i: number;
}

/** The walk's public surface — the handles the orchestrator + observer drive. */
export interface Walk {
  /** Append themed rules to the `<style>` (no-op for an empty list). */
  appendRules: (rules: string[]) => void;
  /** Flatten + queue a subtree (optionally viewport-prioritized) for draining. */
  enqueue: (rootEl: HTMLElement, prioritizeViewport?: boolean) => void;
  /** Drain the queue in time-sliced passes, yielding between slices. */
  drainQueue: () => void;
  /** PRE-PAINT added/recycled subtrees NOW; return the off-screen/overflow roots. */
  processNowInViewport: (roots: HTMLElement[]) => HTMLElement[];
  /** True while a drain pass is in flight (so callers don't double-drive it). */
  isDraining: () => boolean;
  /** Whether the queue has pending work. */
  hasWork: () => boolean;
}

/**
 * Creates the time-sliced walk bound to one `<style>` element + paint context.
 * Owns the per-apply work queue and draining flag.
 */
export const createWalk = (
  styleEl: HTMLStyleElement,
  ctx: SurfaceContext,
): Walk => {
  const w = engineWindow();
  let work: WorkItem[] = [];
  let draining = false;

  const appendRules = (rules: string[]): void => {
    if (rules.length === 0) {
      return;
    }
    const existing = styleEl.textContent ?? "";
    styleEl.textContent = existing
      ? `${existing}\n${rules.join("\n")}`
      : rules.join("\n");
  };

  const drainQueue = (): void => {
    draining = true;
    const obs = w.__themeMakerObserver;
    // Disconnect while we mutate (attribute + style writes) so our own writes never
    // re-enter the observer queue; reconnect when the slice ends.
    if (obs) {
      obs.disconnect();
    }
    const start = now();
    const rules: string[] = [];
    let processed = 0;
    if ((w.__themeMakerThemedCount as number) >= MAX_THEMED) {
      work = [];
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
          if ((w.__themeMakerThemedCount as number) >= MAX_THEMED) {
            work = [];
          }
          break outer;
        }
      }
      work.shift();
    }
    appendRules(rules);
    if (obs && document.body) {
      obs.observe(document.body, OBSERVE_OPTS);
    }
    draining = false;
    if (work.length > 0) {
      yieldThen(() => {
        if (work.length > 0) {
          drainQueue();
        }
      });
    }
  };

  const enqueue = (rootEl: HTMLElement, prioritizeViewport = false): void => {
    if (ctx.doneSet.has(rootEl) && rootEl.querySelectorAll("*").length === 0) {
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

  // PRE-PAINT: process `roots` (added/recycled subtrees) NOW for their in-/near-
  // viewport surfaces, appending their rules synchronously (no white flash). The
  // band is ~2 viewports past the fold so overscan rows are themed before scroll;
  // off-screen / overflow roots are RETURNED for the deferred path.
  const processNowInViewport = (roots: HTMLElement[]): HTMLElement[] => {
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
      // If any element in this subtree was off-screen or hit the cap, re-enqueue
      // the WHOLE subtree to the deferred path; `doneSet` makes the already-themed
      // ones cheap no-ops, so only the leftover (off-screen) surfaces do work.
      if (anyDeferred) {
        deferred.push(root);
      }
    }
    appendRules(rules);
    return deferred;
  };

  return {
    appendRules,
    enqueue,
    drainQueue,
    processNowInViewport,
    isDraining: () => draining,
    hasWork: () => work.length > 0,
  };
};
