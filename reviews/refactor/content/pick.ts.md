# Refactor plan — `src/content/pick.ts`

**Non-comment LOC: 213.** Verdict vs ≤200: **SPLIT.**

The in-page element picker. Two concerns: (1) the PURE classifiers/resolvers (`isButtonLike`, `hasOwnBackground`, `isPickable`, `propForElement`, `pickKeyFor`, `rgbToHex`, `currentColorFor`, the tag set) and (2) the live SESSION (`startPick`: overlay create/position, capture-phase listeners, re-arm, teardown). Most of concern (1) duplicates `inject.ts`.

## Decomposition plan (2 files + shared, each ≤200)

| File | Responsibility | Moves | Target LOC |
|---|---|---|---:|
| `src/content/pick.ts` (kept) | The session: `PickHandlers`, `PickSession`, `startPick` (overlay, listeners, re-arm, teardown), `OVERLAY_ID`. | — | ~120 |
| `src/content/pick-resolve.ts` | The pure pick resolvers that AREN'T shared engine logic: `isPickable`, `NON_PICKABLE_TAGS`, `hasDirectText`, `propForElement`, `pickKeyFor`, `currentColorFor`, the seed consts. | lines 50–197 | ~90 |

`isButtonLike` (32–48) and the rgb()→hex parser (`rgbToHex`, 141–157) **do not get their own pick file — they move to SHARED modules** (`lib/classify.ts` / `lib/color-runtime.ts`) because `inject.ts` has the exact same logic.

## Duplication found
- **D2 — `isButtonLike`:** identical to `inject.ts`'s (828–844). Canonical: `lib/classify.ts`. Both import. The file's own docstring (lines 22–27) admits it "deliberately re-implements its small classifiers inline rather than importing engine code" — once the engine is bundled (PLAN §2), that justification evaporates and the shared import is strictly better.
- **D3 — `rgbToHex` (141–157):** parses `rgba?(...)` → hex with the alpha-0→null rule, identical in intent to `inject.ts`'s `parseColor` rgb() branch. Canonical: `lib/color-runtime.ts` `cssColorToHex`. Both import. `hasOwnBackground` then becomes `cssColorToHex(getComputedStyle(el).backgroundColor) !== null`.
- **D4 — `<tag>|<prop>` grammar:** `pickKeyFor`/`propForElement` PRODUCE the keys that `inject.ts` PARSES and `picker-panel-model.ts`/`state.ts` LABEL. Centralize the key shape in `lib/override-grammar.ts` (`makeOverrideKey(tag, prop)`); `pickKeyFor` calls it.

## Long functions
- `startPick` (228–341, ~95 LOC) — it's a session factory with ~8 inner closures (`ensureOverlay`/`positionOverlay`/`removeOverlay`/`onMove`/`onScroll`/`onClick`/`teardown`). Each is small and single-purpose; the LENGTH is from co-located closures, not a monolith. After the resolvers move out it's ~95 LOC of cohesive session code — acceptable for a stateful factory, but if trimming further, extract the overlay (`ensureOverlay`/`positionOverlay`/`removeOverlay`) into a `makeOverlay()` helper (~30 LOC) returning `{position, remove}`.

## Shared utils to extract
- `lib/classify.ts` (`isButtonLike`, D2), `lib/color-runtime.ts` (`cssColorToHex`, D3), `lib/override-grammar.ts` (`makeOverrideKey`, D4). All shared with the engine.

## Ordered steps
1. Move `isButtonLike` → `lib/classify.ts`; `rgbToHex` → `lib/color-runtime.ts` (`cssColorToHex`). Repoint `pick.ts` (and later `inject.ts`). `pick.test.ts` green.
2. Move the pure resolvers → `pick-resolve.ts`; route `pickKeyFor` through `override-grammar.ts`. Test.
3. (Optional) extract `makeOverlay()` from `startPick`.
4. Re-measure (`pick.ts` ≤200); `tsc` + `vitest`.

> `pick.test.ts` imports `isPickable`, `propForElement`, `pickKeyFor`, `currentColorFor` from `../src/content/pick` — re-export them from `pick.ts` (or update the test imports to `pick-resolve.ts`). Re-exporting keeps the test untouched and is the lower-risk choice.
