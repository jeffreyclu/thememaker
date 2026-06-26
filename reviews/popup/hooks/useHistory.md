# Review: src/popup/hooks/useHistory.ts

**LOC**: 30 (under 200, fine)

## Findings

- **Medium** — `onSelectHistory` (lines 35-39): no try/catch around `commitCurrent`. If the live re-apply fails, the rejection is unhandled and the user sees no error, despite `selectHistory` having already mutated state (lines 32-33) — leaving the store pointing at a scheme that did not actually apply. **Fix**: wrap `commitCurrent` in try/catch with `popup.setError`, matching the pattern used elsewhere.

- **Low** — `intensity: getState().intensity` (line 37) is read AFTER `dispatch({selectHistory})` (line 32). The header comment correctly explains the snapshot rule for `scheme` (read before dispatch — done right), but intensity is read post-dispatch. If the `selectHistory` reducer changes `intensity`, this read is intentionally picking up the new value; if it does not, it is equivalent to a pre-dispatch read. Either way, worth confirming this asymmetry (scheme pre-dispatch, intensity post-dispatch) is deliberate and noting it, since the file's whole premise is the deferred-dispatch snapshot discipline.

## Positives
- Correctly applies the deferred-dispatch snapshot rule for `scheme`: `dequeueScheme(getState().history, index)` is captured BEFORE `dispatch`, then passed explicitly to `commitCurrent` — exactly the pattern the header documents, avoiding the stale post-dispatch `getState()` read. Logic in the hook; composes `commitCurrent` from `schemeClient`; reads context via providers. `useMemo` deps `[store, popup]` correct. Tight, single-responsibility, no dead exports.
