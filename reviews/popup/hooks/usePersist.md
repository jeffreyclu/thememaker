# Review: src/popup/hooks/usePersist.ts

**LOC**: 23 (under 200, fine)

## Findings

- **Low** — error message (line 32): on a persist failure the popup shows `"apply failed"`, but this hook persists rather than applies. The fallback string is misleading for debugging. **Fix**: use `"persist failed"` (or similar) to match the operation.

- **Low** — no de-dupe / latest-wins guard on `persist`. The generate flow calls this after a fresh apply; if it can be invoked concurrently with another persist of the same origin, the last write wins with no ordering guarantee. Likely fine given the popup's single-user, sequential interaction model, but if `persist` is ever called in rapid succession the writes race. Note only — no change needed unless concurrent callers appear.

## Positives
- Thin, correct wrapper: its sole job is to add try/catch + `popup.setError` around `persistTheme`, which is exactly what the header documents. Logic in the hook; composes `persistTheme` from `schemeClient`; reads context via providers. `useMemo` deps `[store, popup]` correct. `persist` is verb-named, the `LiveScheme` param is well-typed and documented. No stale closures (no `getState()` reads here), no dead exports. Clean.
