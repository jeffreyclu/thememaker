# Review: `src/picker/state/PickerProvider.tsx`

**Purpose:** The picker's state provider. Holds live session state (the
`overrides` map via `useReducer(overridesReducer)`, plus `palette`/`intensity`
refs), re-seeds on prop change (the popup's APPLY_LIVE), and splits state into two
contexts by update frequency: `PickerStateContext` (fast-changing `overrides` +
`onClose`) and `PickerActionsContext` (stable `dispatch` / `patchColor` /
`getTheme` / `onClose`). `patchColor` advances a live ref without re-rendering so
the uncontrolled color input is never remounted mid-drag.

**LOC:** 99 non-comment / non-blank — within the ≤200 limit.

## Findings

- **MEDIUM — Render-phase `dispatch` re-seed is identity-fragile and fires every APPLY_LIVE.**
  `PickerProvider.tsx:84-88`. The re-seed gate compares `seedRef.current !==
  seedOverrides` by reference. But the shim's `propsFor`
  (`picker/index.ts:36-41`) builds a *fresh* `overrides` object on **every**
  `update()` (`{ ...(options.overrides ?? {}) }`), so this branch fires on every
  APPLY_LIVE re-render — including ones whose override contents are identical to
  the current state. Each fire dispatches `reseed`, replacing the whole map by
  reference and re-rendering all rows (and, via the row `key`, remounting their
  uncontrolled inputs). In practice APPLY_LIVE is infrequent (popup actions like
  "Clear all" / generate / history re-apply), so this is not a hot path and not a
  correctness bug — but the reference-identity contract between this file and the
  shim's `propsFor` is implicit and easy to break. Concrete fix: either (a) gate
  the reseed on a value compare of the override entries, or (b) document the
  "propsFor must produce a fresh identity per intended reseed" contract at both
  ends so a future change to `propsFor` (e.g. memoizing it) can't silently stop
  reseeds. MEDIUM for the cross-file fragility, not current behavior.

- **LOW — `getTheme().overrides` returns the *live ref*, not the committed state.**
  `PickerProvider.tsx:109-113`. `getTheme` reads `liveOverridesRef.current`, which
  during a color drag has been advanced by `patchColor` ahead of reducer state.
  This is intentional and correct for apply/persist (you want the latest dragged
  color), and `useApplyOverrides.commit` recomputes the next map from
  `getTheme().overrides` deliberately. Flagged only because "getTheme returns
  something slightly different from what the rows render" is a subtle invariant a
  future reader must understand; the header comment covers it. No change.

## What is good
- **Two-context split by update frequency is the right call** — rows subscribe to
  the fast `overrides`/`onClose` state; the apply/persist hooks subscribe to the
  stable actions context and never re-subscribe on an override change. `useMemo`
  on both values with correct deps (`actions` on `[onClose]`, `state` on
  `[overrides, onClose]`).
- **The ref-vs-state divergence is principled and documented.** The uncontrolled
  color input must not remount mid-drag; routing drags through `patchColor` (ref,
  no render) while picks/clears go through `dispatch` (render) is exactly the
  pattern that satisfies that, and the header comment explains it accurately.
- **Context hooks throw outside the provider** (`usePickerState` /
  `usePickerActions`) — correct guard.
- State lives entirely in context here (per the contract), and the override
  transitions are delegated to the reducer module rather than inlined — clean
  separation.
