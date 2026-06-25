/**
 * The Engine's shared value types — declared ONCE, with NO window indirection.
 *
 * Before the Engine class these lived on `window.__themeMaker*` globals (in
 * `engine-state.ts`); now the `Engine` owns them as private instance fields and
 * threads `EngineState` (the mutable per-apply counters) into the pure painter.
 * This file is just the type contract the Engine and the painter share — no DOM,
 * no `chrome.*`, no state itself.
 */

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

/**
 * The per-apply MUTABLE counters the painter reads + bumps. The Engine owns one
 * of these and passes it through the surface context, replacing the old
 * `window.__themeMakerNextId / themedCount / capped` globals:
 *  - `nextId` is MONOTONIC across applies (never rewound, so incremental observer
 *    rules don't collide with earlier ones);
 *  - `themedCount` + `capped` RESET on every explicit apply (the budget is rebuilt
 *    with the sheet) and warn-once.
 */
export interface EngineState {
  nextId: number;
  themedCount: number;
  capped: boolean;
}
