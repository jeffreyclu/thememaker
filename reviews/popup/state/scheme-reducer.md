# Review: `src/popup/state/scheme-reducer.ts`

**Purpose:** Pure scheme-domain state machine for `SchemeProvider`. Defines `SchemeState`, the `SchemeAction` union, `schemeReducer`, and the on-open hydration patch `hydratePartial`. DOM-free, `chrome.*`-free, unit-testable.
**LOC:** 128 non-comment / non-blank — largest popup file, still within ≤200.

## Overall grade: **A-**

A solid, exhaustive immutable reducer with a well-reasoned hydration patch. The override lifecycle across scheme changes (clear on fresh generate, restore on favorite/history/invert) is handled thoughtfully and consistently with clear WHY comments. State is centralized here, all consumed via context. Two small things: an unused re-export, and `applyFavorite` is a misleadingly named "apply any scheme" action.

## Findings

### [Low] `applyFavorite` action name is broader than its name — `scheme-reducer.ts:65, 88-100`
The `applyFavorite` action is dispatched by `useFavorites` (a favorite), `useApplyScheme.onToggleInvert` (an inverted scheme), and conceptually any "this scheme is now current + applied, restore its saved intensity/overrides" transition. The reducer comment even says so ("A favorite/invert/selected scheme becomes current + applied"). The name lies about its scope — a reader grepping `applyFavorite` won't expect Invert to use it.

**Why it matters:** Naming honesty. The action is the generic "adopt this scheme as the live look" transition; calling it `applyFavorite` invites the wrong mental model and discourages reuse.

**Concrete fix:** Rename to `adoptScheme` (or `setCurrentScheme`) to match its real meaning; update the two dispatch sites + tests. Low priority — purely a clarity rename.

### [Low] `selectHistory` re-resolves the scheme the caller already resolved — `scheme-reducer.ts:111-122`
`schemeReducer`'s `selectHistory` case calls `dequeueScheme(state.history, action.index)` to get the scheme. But `useHistory.onSelectHistory` ALSO calls `dequeueScheme(getState().history, index)` independently (to pass an explicit snapshot to `commitCurrent`). So the same history entry is resolved twice from the same array — once in the hook, once in the reducer. Not a bug (both read the same `state.history`), but it's duplicated lookup logic and a second place that must stay in sync with `dequeueScheme`'s indexing semantics.

**Why it matters:** Mild DRY + a subtle invariant: the hook and reducer must agree on what `index` means. They do today (both pass the raw history index), but it's two call sites of the same indexing contract.

**Concrete fix:** Have `selectHistory` carry the resolved `scheme` (like `applyFavorite` does) instead of an `index`, so the reducer doesn't re-dequeue. The hook already has the scheme in hand. This also makes the reducer purely a state-setter, not a storage-indexer.

### [Low] `DEFAULT_INTENSITY` re-export is unused noise — `scheme-reducer.ts:173`
`export { DEFAULT_INTENSITY };` re-exports a symbol that already lives in `../../types` and is imported there directly by every other consumer (`SchemeProvider`, `IntensitySlider` use `MIN_INTENSITY` from types, etc.). Re-exporting it from the reducer is an over-wide export with no caller — grep shows no `from ".../scheme-reducer"` importing `DEFAULT_INTENSITY`.

**Why it matters:** Dead / over-wide export. Adds a second canonical-looking source for a constant that has one home.

**Concrete fix:** Delete line 173. (Confirm no test imports it from here first; if one does, repoint it to `../../types`.)

### [Note] `ModeSelection` re-export (line 21) IS used
`export type { ModeSelection }` is consumed by `ModeSelect.tsx` and `useGenerate.ts` importing the type from `../state/scheme-reducer`. Legitimate type re-export, not dead. (Contrast with the `DEFAULT_INTENSITY` value re-export above.) No change.

### [Note] `hydratePartial` prefers the saved scheme's intensity/overrides over global settings — `scheme-reducer.ts:156-171`
Correct and well-reasoned: after a popup reopen on a persisted site, the slider/details must match what's actually painted (the saved scheme), not the global default. The deep optional chain is read once into `saved` then reused — clean. No change.

### What's GOOD
- **Exhaustive tagged-union reducer**, immutable transitions, `default` fallthrough.
- **Override lifecycle is correct across every transition:** `generateSuccess` clears overrides (fresh palette → prior overrides invalid), while `applyFavorite`/`selectHistory` restore the scheme's own saved overrides. This is the kind of detail that silently breaks; here it's consistent and commented.
- **`reset` clears `current`/`applied`/`siteEnabled`/`overrides` together** — no partial reset leaving stale per-site state.
- `applyFavorite` clamps the restored intensity via `clampIntensity` rather than trusting persisted data.

## Top changes
1. Drop the dead `DEFAULT_INTENSITY` re-export (line 173).
2. (Optional) Carry the resolved `scheme` in `selectHistory` instead of re-dequeuing in the reducer.
3. (Optional) Rename `applyFavorite` → `adoptScheme` to match its real scope.
