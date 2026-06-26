# Review: `src/picker/hooks/usePickerKeys.ts`

**Purpose:** Esc-to-close for the panel. Installs a capture-phase `keydown`
listener that swallows Escape (`preventDefault` + `stopPropagation`) and delegates
to the host's `onClose` (which hides the picker + ends pick mode).

**LOC:** 16 non-comment / non-blank — within the ≤200 limit.

## Findings

- **LOW — `onClose` in the effect dep array re-installs the listener if its identity changes.**
  `usePickerKeys.ts:23`. `onClose` comes from `usePickerState()`, whose `state`
  value is memoized on `[overrides, onClose]` in `PickerProvider` — so `onClose`'s
  identity is the shim's stable `hidePicker` and won't churn, meaning the listener
  installs once in practice. No defect; flagged only to confirm the dependency is
  intentional and stable. No change.

## What is good
- **Correct capture-phase listener with matched cleanup.** Added with
  `capture: true`, removed with `capture: true` — no leak. Tiny, single-purpose
  effect hook: exactly the "logic in verb-named hooks, one concern each" discipline
  the contract wants.
- Swallowing Escape at capture phase is the right call so an underlying page Esc
  handler (e.g. a modal) doesn't also fire when the user dismisses the picker.
- Comment is accurate and logic-only; reads `onClose` from context rather than
  taking a prop — consistent with the provider-centric state design.
