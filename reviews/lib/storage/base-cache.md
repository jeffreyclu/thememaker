# Review: src/lib/storage/base-cache.ts

**LOC**: 35

Synchronous same-origin base-color cache (page `localStorage`) for anti-flash early paint, plus `baseBackgroundFor` fallback. Every `localStorage` call is wrapped in try/catch — correct for private-mode/blocked-storage. Logic is sound.

## Findings

**Medium** (domain fit, whole file): This module lives in `src/lib/storage/` but is **page `localStorage`, not `chrome.storage`** — and `storage/index.ts` documents itself as "the sole storage interface" / "Typed storage adapter wrapping `chrome.storage`." Two different storage backends under one folder with one claiming sole-interface status is a contract tension. `readBaseCache`/`writeBaseCache`/`clearBaseCache` are a distinct mechanism (synchronous, in-page, no DI seam). Consider relocating to `src/lib/anti-flash/` or `src/content/` (it is content-script-only), or at least amend `index.ts`'s "sole storage interface" wording to acknowledge this. Recommend recording the decision either way.

**Low** (base-cache.ts:54): Fallback chain ends in a hard-coded `"#808080"` magic gray, duplicated from `keys.ts FALLBACK_COLOR` / `resolve.ts NEUTRAL_TEXT`. Same sentinel value defined in three places — share one constant.

**Low** (base-cache.ts:16-26): The `BASE_CACHE_KEY` const + its doc block are wedged between two `import` statements (lines 15, 22), then re-exported at 26 "so existing consumers keep importing the cache key from here too." Interleaving a const/comment among imports is awkward to read and the re-export comment hints at a migration left half-done — move the const below the imports and drop the redundant `export { BASE_CACHE_KEY }` (it is already `export const`... actually it is declared `const`, so the re-export IS the export; clarify by declaring `export const BASE_CACHE_KEY` directly).

No `chrome.*`, no `src/popup`/`src/picker` imports — clean.
