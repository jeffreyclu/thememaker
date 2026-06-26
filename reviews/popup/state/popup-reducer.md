# Review: `src/popup/state/popup-reducer.ts`

**Purpose:** Pure view-state machine for the `PopupProvider`. Defines `PopupState` (three disclosures + loading/error/savedFavoriteId/picking), the `PopupAction` union, and `popupReducer`. DOM-free, `chrome.*`-free.
**LOC:** 56 non-comment / non-blank — within ≤200.

## Overall grade: **A**

A small, exhaustive, immutable reducer. Discriminated-union actions, a `default` fallthrough, every case returns a new object. Cleanly separated from the scheme domain so view toggles never churn scheme state — the header documents that split accurately. All state lives here (in context via the provider), no logic in components: contract-compliant.

## Findings

### [Low] Three near-identical toggle cases — `popup-reducer.ts:58-63`
`toggleDetails`/`toggleFavorites`/`toggleHistory` are three actions and three reducer cases that differ only in which boolean flips. This is the same "parallel toggles" smell the prior `state.ts` review flagged (it was four there, now a clean three). At three independent booleans the boilerplate is minor and arguably clearer than a parameterized `toggle(panel)` action; flagging only for consistency with the earlier note.

**Why it matters:** Mild DRY. Adding a fourth disclosure means a new state field + action variant + case (three edits).

**Concrete fix (optional):** Collapse to one `{ type: "toggle"; panel: "details"|"favorites"|"history" }` action over an `open: Record<panel, boolean>` sub-shape, OR — if only one panel should be open at a time — a single `openPanel: Panel | null`. Note this would require updating the unit tests that dispatch `toggleDetails`/etc. by name; not worth it at three toggles unless a fourth lands.

### [Note] `setError` and `setLoading` couple the two flags — `popup-reducer.ts:64-72`
`setLoading(true)` clears `error`; `setError` forces `loading: false`. This is deliberate and correct (a new request shouldn't show a stale error; an error ends the in-flight state), and the inline comment says so. Calling it out only so the coupling is on the record: a caller that does `setError(x)` expecting `loading` untouched will be surprised. Documented, intentional — no change.

### What's GOOD
- **`setError` clears `loading` in the reducer**, so the hooks don't have to remember to flip both — the error paths in `useGenerate`/`useApplyScheme` rely on this and it holds.
- **`setSavedFavoriteId` opens the favorites panel + flags the row in one transition** (line 73-76), keeping the "save → confirm" UI atomic in pure state rather than scattering it across the hook.
- Header accurately describes the domain split and that the actions hook (`usePopup`) is the dispatcher. No stale paths.

## Top changes
None required. The optional toggle-collapse is cosmetic.
