# Review: `src/lib/color-source.ts`

**Purpose:** Color source layer — turns a (seed, mode) into a `Palette` from either the LOCAL HSL generator (default) or the thecolorapi.com API ("surprise me"), with two-tier caching (memory + injected persistent store) and a real fallback to local generation on any failure.
**LOC:** 149.

## Overall grade: **A-**

A resilient, dependency-injected source layer with an explicit "always resolves with a valid Palette, never undefined/throws" guarantee that it actually upholds (this is the documented fix for the legacy swallowed-error crash). `fetch` and the cache are injected, so it's fully testable. The one real smell is a module-level mutable `memoryCache` singleton (shared global state) and a small caching subtlety.

## Findings

> FOUNDATION-PASS NOTE: this file is in the foundation agent's owned set, but ALL
> its findings are LOCAL (caching architecture, API-as-seed-picker honesty) — none
> reshape a shared cross-cutting surface (types/messages/engine). The foundation
> pass verified they are real and out-of-scope for it, and DEFERS them to the
> per-file agent. The build/test stay green; nothing here was changed.

- [x] FIXED: removed the module-level mutable `memoryCache` global and the `clearMemoryCache` test hook. The memory tier is now an optional injected dep (`memoryCache?: Map<string, Palette>` in `PaletteSourceDeps`); `apiPalette` reads/writes it via `?.`. The popup owns one long-lived `Map` (passed in `deps`) so the in-session tier is preserved in production; tests inject a fresh `Map` per case for isolation (no global to reset). Build/test/lint green.

### [DEFERRED — local color-source.ts item, owned by per-file agent] Module-level mutable `memoryCache` singleton (shared global state)
Lines 89–92: `const memoryCache = new Map<string, Palette>();` at module scope, mutated by `apiPalette` and cleared by an exported `clearMemoryCache` test hook. This is global mutable state — the exact pattern that makes tests order-dependent (hence the need for the `clearMemoryCache` escape hatch the tests must remember to call).

**Why it matters:** FP/immutability/testability. A module-global cache means two different "source" usages share state implicitly, and tests must reset it between cases. The `clearMemoryCache` export is a tell that the global is leaking into the test surface.

**Concrete fix:** Make the memory cache an injected dependency too (part of `PaletteSourceDeps`, or a `createColorSource(deps)` factory that closes over its own `Map`). The persistent `cache` is already injected; the memory tier should be as well, for symmetry and isolation. Then `clearMemoryCache` disappears.

- [x] VERIFIED-INVALID (left as-is, already documented): the API-as-seed-picker design is deliberate and ALREADY loudly documented in `paletteFromApiResponse` ("Build the local palette from the API's FIRST color as the seed… swatches/themeColors stay role-derived"). Changing `count=6`→`count=1` or wiring in the API harmony would shift produced behavior/feature scope — out of a minimal cleanup pass. Honesty concern is satisfied by the existing comment; no code change.

### [DEFERRED — local color-source.ts item, owned by per-file agent] `paletteFromApiResponse` discards the API's harmony and only uses `hexes[0]` as a local seed
Lines 67–73: it parses all the API colors, validates them, then throws ALL of them away except `hexes[0]`, which it feeds to `generatePalette` (the LOCAL generator). So the "surprise me from thecolorapi.com" feature effectively just uses the API to pick ONE seed color and then generates locally. The comment explains WHY (swatches/themeColors must stay role-derived), and it's a defensible design — but it means the API integration is doing far less than it appears, and `count=6` (apiSchemeUrl) requests 6 colors only to use 1.

**Why it matters:** Over-engineering / honesty. Fetching a 6-color scheme to use one color is wasteful, and a reader expecting the API's palette to drive the theme will be surprised. The whole `ColorApiScheme`/`paletteFromApiResponse` parsing apparatus exists to extract a single hex.

**Concrete fix:** Either (a) request `count=1` since only the first color is used, or (b) genuinely incorporate the API harmony if that's the intent. As-is, document loudly at the function that the API is a SEED PICKER, not a palette source — and consider whether the feature earns its complexity over "pick a random local seed."

- [x] FIXED (test added): the "fallback is never cached" invariant is now pinned in BOTH tiers. The existing `color-source.test.ts` fallback-not-cached test already asserted `cache.store.size === 0`; I extended it (and injected a `memoryCache`) to also assert `mem.size === 0` after the offline fallback, then a real palette caches on retry. Confirmed via the suite.

### [DEFERRED — local color-source.ts item, owned by per-file agent] In-memory and persistent caches can diverge on the fallback path (correctly) but the "don't cache fallback" rule is implicit
Lines 145–148: on failure it returns `localPalette` WITHOUT caching (good — documented at line 99). But this means a transient network failure yields an uncached local palette while a later success caches the API one — correct, just worth noting the two cache tiers only ever hold API results, never fallbacks. The code does this right; it's a subtle invariant worth a test.

**Concrete fix:** Add a test asserting a fallback result is NOT written to either cache (so a retry can still reach the API). Likely already covered (`color-source.test.ts` exists) — confirm.

- [x] VERIFIED-INVALID (left as-is): ties to the seed-picker finding above. Lowering `count` would change the outbound API request shape (a behavior change) for no produced-color benefit — out of minimal scope. Left at `count=6`.

### [DEFERRED — local color-source.ts item, owned by per-file agent] `apiSchemeUrl` default `count = 6` is unused-ish given only `hexes[0]` matters
Line 36. Ties to the medium finding — the parameter exists but the consumer ignores all but the first color.

## What's GOOD
- **The resilience guarantee is real and tested.** Memory → persistent → network → local-fallback, with every failure path swallowed and degraded to local generation. "Always resolves with a valid Palette, never undefined/throws" is upheld — this genuinely fixes the legacy crash the comment cites.
- **Fully dependency-injected** (`fetchImpl`, `cache`) — no network or `chrome.storage` needed to test, exactly as claimed.
- **Cache-read failures are non-fatal** (try/catch around `deps.cache.get`/`.set`) — a flaky storage layer can't break generation. Best-effort persistence with the in-memory tier as the floor.
- **`paletteFromApiResponse` returns `null` on malformed input** (not throw, not undefined-crash) so the caller's fallback is clean — proper boundary parsing with validation (`isHexColor` filter).
- Small, single-purpose, well-named functions; `paletteCacheKey` is stable + normalized.

## Top 3 concrete changes
1. **Inject the memory cache** (factory or dep) instead of a module-level mutable `Map`, removing the global state and the `clearMemoryCache` test hook.
2. **Resolve the API-as-seed-picker honesty issue**: request `count=1` (only the first color is used) and/or document loudly that the API contributes a single seed, not a palette — or make it actually use the harmony.
3. **Add a test pinning "fallback results are never cached"** so the retry-can-reach-API invariant can't regress.
