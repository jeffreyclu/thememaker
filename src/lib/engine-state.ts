/**
 * The engine's PERSISTENT page-side state, declared ONCE.
 *
 * The adaptive engine keeps a small amount of state on `window` (in the content
 * script's isolated world) so re-applies and the MutationObserver share it:
 *  - the live `MutationObserver` handle (so reset can disconnect it);
 *  - the last `[palette, options]` args (for observer-driven re-paints);
 *  - a MONOTONIC element-id counter (never reset, so incremental observer rules
 *    don't collide with earlier ones);
 *  - the FROZEN-ORIGINAL cache (TRACK 1 of the DJ-mixer): each surface's original
 *    bg/fg captured ONCE and frozen, feeding only the crossfade blend;
 *  - the per-apply walk state (the done-set of tagged surfaces, the themed
 *    counter, and the cap flag) — RESET on every explicit apply.
 *
 * Before Phase 2 this shape was re-declared inline in both `removeSchemeStyle`
 * and `applyAdaptiveScheme`; centralizing it here means the shape is written
 * once and the orchestrator + walk + observer all consume the same typed handle.
 *
 * No imports beyond the engine's own types — pure state plumbing.
 */
import type { Palette } from "./palette";
import type { ApplyOptions } from "../types";

/**
 * A surface's FROZEN original computed style, captured once. `bgImage` preserves
 * real image backgrounds (carousel photos, hero art, sprites) instead of painting
 * a solid over them; `boxShadow` drives the drop-shadow softening.
 */
export interface OriginalStyle {
  bg: string | null;
  fg: string | null;
  bgImage: string | null;
  boxShadow: string | null;
}

/** The engine's `window.__themeMaker*` state surface. */
export interface EngineWindow {
  __themeMakerObserver?: MutationObserver;
  __themeMakerArgs?: [Palette, ApplyOptions];
  __themeMakerNextId?: number;
  /** TRACK 1: each surface's FROZEN original bg/fg, captured once. */
  __themeMakerOriginals?: WeakMap<Element, OriginalStyle>;
  /** Surfaces already TAGGED + frozen — never re-walk/re-theme them. */
  __themeMakerDone?: WeakSet<Element>;
  /** Running total of themed surfaces (for the MAX_THEMED budget). */
  __themeMakerThemedCount?: number;
  /** Set once we hit MAX_THEMED, so we warn only once. */
  __themeMakerCapped?: boolean;
}

/** The current page's `window`, typed as the engine's state surface. */
export const engineWindow = (): EngineWindow =>
  window as unknown as EngineWindow;

/**
 * Initializes the PERSISTENT state for an apply and RESETS the per-apply walk
 * state, returning the handles the engine threads through the walk + observer.
 *
 * Persistent across applies (true frozen state): the monotonic `nextId` and the
 * `originals` WeakMap. RESET per apply (an explicit apply rebuilds the sheet from
 * scratch): the `doneSet`, the themed counter, and the cap flag.
 */
export const initEngineState = (
  w: EngineWindow,
): {
  originals: WeakMap<Element, OriginalStyle>;
  doneSet: WeakSet<Element>;
} => {
  // Monotonic id counter — NEVER reset to 0 (so incremental observer rules don't
  // collide with / strand earlier ones).
  if (typeof w.__themeMakerNextId !== "number") {
    w.__themeMakerNextId = 0;
  }
  // TRACK 1 — the FROZEN-ORIGINAL cache persists across applies so re-apply is
  // idempotent (once our <style> is live, getComputedStyle returns OUR themed
  // colors, so we must blend from the cached original, not re-read drifted values).
  if (!w.__themeMakerOriginals) {
    w.__themeMakerOriginals = new WeakMap<Element, OriginalStyle>();
  }
  // Per-apply walk state: an explicit apply REBUILDS the sheet, so the done-set +
  // counter + cap flag reset every call.
  w.__themeMakerDone = new WeakSet<Element>();
  w.__themeMakerThemedCount = 0;
  w.__themeMakerCapped = false;
  return { originals: w.__themeMakerOriginals, doneSet: w.__themeMakerDone };
};

/** Tears down all engine state on the window (reset / disabled site). */
export const teardownEngineState = (w: EngineWindow): void => {
  if (w.__themeMakerObserver) {
    w.__themeMakerObserver.disconnect();
    w.__themeMakerObserver = undefined;
  }
  w.__themeMakerArgs = undefined;
  w.__themeMakerNextId = undefined;
  // Drop the frozen-original cache so a fresh apply re-captures true originals.
  w.__themeMakerOriginals = undefined;
  // Drop the per-apply walk state (done-set, themed counter, cap flag).
  w.__themeMakerDone = undefined;
  w.__themeMakerThemedCount = undefined;
  w.__themeMakerCapped = undefined;
};
