# Review: src/lib/storage/history.ts

**LOC**: 22

Two pure, immutable helpers for the bounded scheme-history queue. No `chrome.*`. Clear docs, correct non-mutating semantics.

## Findings

**Low** (history.ts:32-40 `dequeueScheme`): The name implies removal (dequeue), but it only **reads** the element at `index` without removing anything — it is a bounds-checked indexed get, not a dequeue. Misleading name; `schemeAt` / `getSchemeAt` would read truer.

**Low** (history.ts:21-24): `enqueueScheme` uses `[...history, scheme]` then `while (...) next.shift()`. `shift()` on an array is O(n) per call; for `max = MAX_HISTORY` and a single append this is at most one shift, so fine — but it duplicates the identical bounded-queue idiom in `storage/index.ts saveFavorite`. Consider one shared `boundedPush` helper used by both history and favorites.

Otherwise no findings — logic and immutability are correct.
