# Review: `src/lib/theme-engine.ts`

**Purpose:** Per its docstring, "pure theming logic extracted from the legacy `Thememaker` class" — random seed/mode helpers, the colorapi fetch+parse, the legacy tag-bucket scheme builder + CSS string builder, and the bounded history queue.
**LOC:** 231.

## Overall grade: **D**

This file is mostly a GRAVEYARD. I verified by grep: of its 13 exports, only FOUR are used in production (`randomHexColor`, `randomMode`, `enqueueScheme`, `dequeueScheme`). The other nine — the entire legacy tag-bucket v1 engine (`fetchColors`, `generateScheme`, `buildSchemeStyle`, `generateColorApiUrl`, `generateRandomScheme`, `calculateTotalColors`, `isContainerElement`, `isTextElement`, `randomNum`) — are DEAD in production, superseded by the Phase 2 palette/mapping/inject engine, and kept alive only by their own tests. The file's own header even admits it's "the seam where role detection WILL plug in" — but it already did, elsewhere, leaving this behind.

## Findings

- [x] FIXED: ~70% of this module was dead v1 engine code retained only by tests. VERIFIED by grep — live exports were only `randomHexColor`, `randomMode` (engine-bridge), `enqueueScheme` (storage), `dequeueScheme` (state); the other nine were zero-importer dead. DELETED the whole file. Relocated survivors: `randomHexColor`/`randomMode` (+ a private `randomInt`) → new `src/lib/random.ts`; `enqueueScheme`/`dequeueScheme` → new pure `src/lib/history.ts`. Rewired engine-bridge/state/storage imports. Deleted `theme-engine.test.ts` (17 false-coverage tests) and the dead colorapi fixtures from `mocks.ts`. The dead `ColorApiResponse` dup died with the file.

- [x] FIXED: `fetchColors` swallowed-error footgun. Deleted with the v1 engine — the resilient replacement is `color-source.apiPalette`, which never returns undefined.

- [x] FIXED: `generateScheme`/`buildSchemeStyle` unsound `as Scheme` + `value as string` casts. Deleted with the v1 engine.

- [x] FIXED: `randomHexColor` returned bare hex (no `#`). Relocated version in `random.ts` now returns a normalized `#rrggbb`; updated `engine-bridge.resolveSeed` to stop prepending `#`.

## What's GOOD
- **`enqueueScheme`/`dequeueScheme`** are genuinely clean, pure, bounded-queue helpers (immutable, return new arrays, range-checked) — these deserve to survive, just not here.
- **`randomHexColor`/`randomMode`/`randomNum`** are correct, tiny, pure RNG helpers — fine code, wrong file.
- The docstring is at least HONEST that this is legacy ("extracted from the legacy `Thememaker` class", "the seam where role detection WILL plug in") — it doesn't pretend to be the v2 engine, even though its placement and the README listing imply it is.

## Top 3 concrete changes
1. **Delete the dead v1 engine** (`fetchColors`, `generateColorApiUrl`, `generateScheme`, `buildSchemeStyle`, `generateRandomScheme`, `calculateTotalColors`, `isContainerElement`, `isTextElement`, the `ColorApiResponse` dup) and the tests that only cover it. ~160 LOC and a false-coverage test file gone.
2. **Relocate the 4 survivors** (`randomHexColor`/`randomMode`/`randomNum` → `random.ts` or `color.ts`; `enqueueScheme`/`dequeueScheme` → `history.ts`/`storage.ts`) and delete this file entirely.
3. **Update the README architecture block**, which lists `theme-engine.ts` as "PURE theming logic" — it must point at `palette.ts`/`mapping.ts`/`inject.ts` (the actual v2 engine) instead, or it perpetuates the same misdirection.
