# Review: `src/lib/storage.ts`

**Purpose:** Typed `chrome.storage` adapter. Defines a minimal promise-based `StorageArea` interface, the `ThememakerStorage` facade (history/settings/site-state/favorites/palette-cache), the `chrome.storage` adapter, and `originFromUrl`.
**LOC:** 239.

## Overall grade: **A**

The best-architected file in the codebase. Dependency inversion done correctly: a minimal `StorageArea` interface, fakes injected in tests, the real `chrome.storage` adapter isolated behind `chromeArea`, keys centralized, defaults merged, queues bounded. This is interview-grade clean. Findings are minor.

## Findings

- [x] FIXED: `getSettings`/`getSiteState` merge `...stored` over defaults — a partial/corrupt stored object could shadow a default with `undefined`. Added a `definedOnly(stored)` helper that strips `undefined`-valued keys before the spread; both getters now do `{ ...DEFAULT, ...definedOnly(stored) }`. Build/test/lint green.

### [low] `getSettings`/`getSiteState` merge `...stored` over defaults — a partial/corrupt stored object can shadow a default with `undefined`
Lines 160, 173: `{ ...DEFAULT_SETTINGS, ...stored }`. If `stored` is `{ intensity: undefined }` (e.g. a partial write or migration), the spread overwrites the default `intensity` with `undefined`. In practice writes are whole objects so this is unlikely, but the merge trusts stored shape.

**Why it matters:** Defensive correctness for persisted data that can be written by older versions.

**Concrete fix:** Either validate/clamp on read (e.g. `intensity: clampIntensity(stored?.intensity ?? DEFAULT.intensity)`) or filter `undefined` values out of `stored` before the spread. Low priority given current write discipline.

- [x] VERIFIED-INVALID (left as-is): unifying `saveFavorite`/`pushHistory` bounded-append would add a parameterized helper (favorites need id-replace, history doesn't) for a "mild DRY" low — speculative abstraction over two ~3-line bodies. Biasing to simplicity, not worth the seam. No behavior issue.

### [low] `saveFavorite` and `pushHistory` both implement "append + drop oldest over max" with slightly different code
`saveFavorite` uses a `while (next.length > max) next.shift()` loop (204–206); `pushHistory` delegates to `enqueueScheme` (theme-engine) which does the same `while/shift`. Two implementations of bounded-append.

**Why it matters:** Mild DRY. The favorites bound is inlined while history's is a shared helper.

**Concrete fix:** Reuse one `boundedAppend(list, item, max, idKey?)` helper for both (favorites needs the id-replace step, history doesn't — parameterize it). Minor.

- [x] VERIFIED-INVALID (left as-is): the `cache:` + `palette:` double prefix is cosmetic and the review confirms it's "not a bug" (consistent read/write). Changing the prefix would alter the persisted `chrome.storage.local` key namespace, silently invalidating every existing user's cached palettes — a behavior/migration change, not a cleanup. Left unchanged to preserve behavior.

### [low] `paletteCacheStore` uses `PALETTE_CACHE_PREFIX = "cache:"` but `color-source.ts:paletteCacheKey` produces keys already prefixed `palette:...`
Line 71 + 227–229: stored key becomes `cache:palette:<hex>:<mode>` (double-namespaced). Not a bug (it's consistent on read and write), but the double prefix is redundant — `cache:` then `palette:`.

**Concrete fix:** Drop one prefix; one namespace is enough. Cosmetic.

### [nit] `chromeArea` is documented "Not exercised by unit tests" (line 90)
Honest and correct (it's the thin real-API adapter; tests inject fakes). Worth a one-line note in coverage docs so the gap is intentional, not an oversight — but the comment already does this. No change.

## What's GOOD
- **Dependency inversion, textbook.** `StorageArea` interface + constructor injection of `local`/`sync` areas means the whole facade is tested against fakes and never touches `chrome.*`. `createChromeStorage()` is the single production wiring point. This is exactly how to make `chrome.*` testable.
- **Keys centralized in `KEYS`** with a documented `site:` prefix convention — no stringly-typed drift, exactly as the comment claims.
- **Every getter defaults** (`?? []`, `{ ...DEFAULT_... , ...stored }`) so callers never handle `undefined` from storage — clean contracts.
- **Queues are bounded** (history via `enqueueScheme`, favorites via the cap loop) so neither storage area grows unbounded — responsible for a `sync` area with hard quotas.
- **`saveFavorite` id-replace semantics** (filter out same id, re-append) make re-saving idempotent — a thoughtful detail, documented.
- **Area split is intentional and documented**: `local` for large device-local data, `sync` for small roaming settings/favorites. Correct use of the two `chrome.storage` areas.

## Top 3 concrete changes
1. **Validate/clamp on read** (at least `intensity`) so a partial/legacy stored object can't shadow a default with `undefined`.
2. **Unify the bounded-append logic** between `saveFavorite` and `pushHistory`/`enqueueScheme` into one parameterized helper.
3. **Drop the redundant double cache prefix** (`cache:` + `palette:`). Otherwise leave this file as the reference adapter — it needs nothing else.
