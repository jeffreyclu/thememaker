# Review: `src/picker/components/Panel.tsx`

**Purpose:** The connected root of the React app. Activates the picker's effect
hooks (`usePickSession`, `usePickerKeys`), reads live overrides + `onClose` from
context, derives the rows via `overrideRows`, binds the apply/persist intents
from `useApplyOverrides`, and renders the panel chrome (header, hint, rows list,
Clear all / Done).

**LOC:** 53 non-comment / non-blank — within the ≤200 limit.

## Findings

- **MEDIUM — Header title "Pick a color" contradicts the hint and the panel's role.**
  `Panel.tsx:34`. The header reads "Pick a color" but the hint immediately below
  says "Click any element on the page to recolor every element of its tag," and
  the panel is the override editor (a list of per-tag color rows), not a single
  color picker. The label misdescribes the surface. Concrete fix: title it
  "Customize colors" (or "Custom colors") to match the editor's actual job and the
  README's "in-page Customize panel" wording. Low-risk copy change; flagged MEDIUM
  only because it is user-facing and actively misleading.

- **LOW — Row `key` of `role:color` remounts the input on every color change.**
  `Panel.tsx:47`. The `key` includes `row.color`, so when a committed override's
  color changes the `<li>`/`<input>` remounts. The header comment explains this is
  intentional (re-pick → fresh seed for the uncontrolled input), and because live
  color *drags* go through `patchColor` (ref, no re-render / no row repaint), the
  remount only happens on a committed state change, not mid-drag — so it does not
  close the native dialog. Correct as designed; documented honestly. No change;
  noting that the key strategy is load-bearing and tightly coupled to the
  uncontrolled-input contract (see `OverrideRow`), so keep them in sync.

## What is good
- **Properly presentational + connected at the right layer.** All logic comes
  from hooks (`usePickSession`/`usePickerKeys` effects, `useApplyOverrides`
  intents); the component only reads context, derives rows from a pure lib fn
  (`overrideRows`), and renders. `memo`'d. No business logic inline.
- **Accessibility is present:** `aria-label` on the rows `<ul>`, semantic
  `<ul>/<li>`, an empty-state `<li>`, `disabled` on Clear-all when no rows,
  `type="button"` on both buttons. Good baseline.
- Comments are logic-only and accurate; `roleLabel` is a tidy local adapter over
  the shared `labelForOverrideKey`.
