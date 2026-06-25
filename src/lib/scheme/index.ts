/**
 * The scheme domain — pure, DOM-free, `chrome.*`-free.
 *
 * Single entry for the scheme building/transform logic (`mode` selection +
 * seed resolution, palette→`Scheme` builders, generate, invert, the apply/persist
 * payload transforms) and the read-only view-model derivations (override/detail
 * rows, swatches, history labels, the saved-dedupe predicate). Consumed by the
 * popup hooks/components and the content-script/persistence tests.
 */
export * from "./mode";
export * from "./transforms";
export * from "./selectors";
