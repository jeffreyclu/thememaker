# Review: src/lib/storage/index.ts

**LOC**: 171

Typed `chrome.storage` facade with an injectable `StorageArea` seam, lazy per-op area lookup (correct for the test chrome-mock swap and torn-down contexts), and merge-over-defaults reads. Solid, cohesive, well-documented.

## Findings

**Medium** (index.ts:125-127, 136-139, 147-149): `chrome.runtime.lastError` is read via `void chrome.runtime.lastError` and then discarded — every op resolves, never rejects. This satisfies MV3's "touch lastError to suppress the unhandled-error console warning," but it is **silent data loss**: a `set` that fails on quota-exceeded (`sync` favorites/settings) or a torn-down context resolves as success, and callers (`saveFavorite`, `setSettings`) return the optimistic array as if persisted. For reads, returning `undefined` on error is benign (defaults apply); for **writes**, swallowing is risky. Recommend: on `set`/`remove`, surface `lastError` (reject, or resolve to a boolean) so callers can detect quota/teardown failures. At minimum log it. Flag for a recorded decision if "writes are best-effort" is intentional.

**Low** (index.ts:122-123): The `get` promise types the resolved value as `T | undefined` but the chrome callback's `items?.[key]` is cast `as T` with no runtime validation — a corrupted/legacy stored shape flows through as the wrong type. Acceptable for a trusted local store; note it.

**Low** (index.ts:261-263): Favorites cap uses `while (next.length > max) next.shift()`; since at most one item is appended per `saveFavorite`, the loop runs ≤1 time in practice — fine, but `if` would read truer to intent. History uses `enqueueScheme` instead; minor inconsistency between the two bounded-queue impls.

**Low** (index.ts:282-288 `paletteCacheStore`): Returns a `PaletteCacheStore` adapter — reasonable facade method, but couples this storage module to the `palette` domain's interface. Acceptable; just noting the dependency direction.

No `src/popup`/`src/picker` imports — clean (`config`, `palette`, `types`, `./history` only).
