# Review: src/popup/hooks/useGenerate.ts

**LOC**: 62 (under 200, fine)

## Findings

- **High** — `onGenerate` (lines 39-71): `popup.setLoading(false)` is only reached on the happy path and on the `!resp.ok` early-return path... actually it is NOT called on the `!resp.ok` return (line 60-63 returns without clearing loading) nor in the `catch` (line 68-70 calls `setError` but never `setLoading(false)`). On apply-failure or any thrown error the popup stays stuck in the loading state. **Fix**: clear loading in a `finally` block (or call `setLoading(false)` on both the early-return and catch paths).

- **Medium** — `onGenerate` (line 40): `const s = getState()` snapshots state once at click time. This is correct here (intentional read of current state at invocation), but note it is captured before the `await` chain; if a concurrent `selectMode`/state change lands mid-flight the apply uses the stale `s.mode`/`s.intensity`. Acceptable for a single-button flow; worth a comment noting the snapshot is deliberate. No dispatch-then-getState anti-pattern present — good.

- **Low** — naming: actions are `onGenerate`/`onSelectMode` (handler-named) rather than verb-named like the hook. Consistent with a `GenerateActions` handler bag, acceptable.

## Positives
- Logic lives in the hook, not components. Reads context via `useSchemeStore`/`usePopup` and composes the `schemeClient` service through `send`. `useMemo` deps `[store, popup, persist]` are correct and the stability comment is accurate. Session palette cache is correctly scoped inside the memo so it persists across clicks but resets with the memo identity.
