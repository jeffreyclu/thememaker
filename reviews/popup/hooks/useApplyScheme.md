# Review: src/popup/hooks/useApplyScheme.ts

**LOC**: 109 (under 200, fine)

## Findings

- **High** — timer cleanup leak (lines 46-69): `intensityTimer` lives inside the `useMemo` body, not in a `useEffect` with a cleanup. If the popup unmounts while a debounce is pending, the `setTimeout` still fires and runs async work (`setSettings`/`applyCurrentScheme`/`persistTheme` + `popup.setError` on error) against a torn-down popup. In an extension popup this is usually moot (window closes, JS context dies), but `popup.setError` after unmount is a React state-update-after-unmount smell. **Fix**: register the timer in a `useEffect` so its cleanup can `clearTimeout(intensityTimer)` on unmount.

- **Medium** — deferred-dispatch snapshot in `onSelectIntensity`/`scheduleIntensityCommit`: this is handled correctly — `intensity` is passed explicitly into the closure rather than read back via `getState()` after `dispatch`, so the "latest value wins" and the snapshot is consistent. Good. But `onToggleInvert` (lines 100-102) does `dispatch({toggleInvert})` then immediately `getState().invert` to persist — this relies on the store being synchronous. If the store dispatch is synchronous this is correct; if it ever becomes async/batched this becomes the classic stale-read bug. Worth a one-line comment asserting the synchronous-dispatch contract, since this is exactly the pattern the file header warns about.

- **Low** — `onSelectIntensity` returns `void` while siblings return `Promise<void>`; the debounce is fire-and-forget so errors only surface via `popup.setError` inside the timer. Acceptable, but the asymmetry is slightly surprising.

## Positives
- Logic fully in the hook; composes `schemeClient` (`send`/`sendNoReply`/`applyCurrentScheme`/`persistTheme`/`commitCurrent`). `useMemo` deps `[store, popup]` correct. Reset path guards `s.origin` and `activeTabId()` before side effects — good. Verb/handler naming consistent.
