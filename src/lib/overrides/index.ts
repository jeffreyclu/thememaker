/**
 * The per-tag color override domain:
 *  - `keys` — the `<tag>|<prop>` key grammar + row/label derivation;
 *  - `classify` — element classifiers shared with the engine (`isButtonLike`);
 *  - `resolve` — turning a clicked element into an override key + seed color.
 */
export * from "./keys";
export * from "./classify";
export * from "./resolve";
