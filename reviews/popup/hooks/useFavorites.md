# Review: src/popup/hooks/useFavorites.ts

**LOC**: 61 (under 200, fine)

## Findings

- **Medium** — `onSaveFavorite` (lines 51-53): no try/catch. If `storage.saveFavorite` rejects, the dispatch and `setSavedFavoriteId` never run and the error is swallowed as an unhandled rejection — the user gets no feedback. Siblings in `useApplyScheme`/`useGenerate` wrap storage calls and surface `popup.setError`. **Fix**: wrap in try/catch and call `popup.setError` on failure for consistency. Same applies to `onSelectFavorite` and `onDeleteFavorite` (await'd storage with no error path).

- **Low** — `onSelectFavorite` (line 57) reads `getState().favorites` and `onSaveFavorite` (line 42) reads `getState()` fresh at call time — correct, no stale-closure issue. The deferred `applyFavorite` dispatch (line 62) followed by `commitCurrent` correctly passes the scheme explicitly rather than re-reading `getState()` for it — good, avoids the snapshot anti-pattern; intensity does fall back to `getState().intensity` (line 67) but only after `??`, which reads post-dispatch state. Since `applyFavorite` may change intensity in the reducer, prefer reading intensity from the same snapshot or document that the post-dispatch read is intended.

## Positives
- `newFavoriteId` with `crypto.randomUUID` + fallback is a solid, well-commented helper. Logic lives in the hook; composes `commitCurrent` from `schemeClient`; reads context via `useSchemeStore`/`usePopup`. `useMemo` deps `[store, popup]` correct. No dead/over-wide exports. Naming consistent and verb/handler-oriented.
