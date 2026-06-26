/**
 * The Engine's shared value types: the type contract the Engine and the painter
 * share. No DOM, no `chrome.*`, no state itself.
 */

/**
 * A surface's frozen original computed style, captured once. `bgImage` preserves
 * real image backgrounds instead of painting a solid over them; `boxShadow` drives
 * the drop-shadow softening.
 */
export interface OriginalStyle {
  bg: string | null;
  fg: string | null;
  bgImage: string | null;
  boxShadow: string | null;
}

/**
 * The per-apply mutable counters the painter reads + bumps. The Engine owns one of
 * these and passes it through the surface context:
 *  - `nextId` is monotonic across applies (never rewound, so incremental observer
 *    rules don't collide with earlier ones);
 *  - `themedCount` + `capped` reset on every explicit apply (the budget is rebuilt
 *    with the sheet) and warn once.
 */
export interface EngineState {
  nextId: number;
  themedCount: number;
  capped: boolean;
}
