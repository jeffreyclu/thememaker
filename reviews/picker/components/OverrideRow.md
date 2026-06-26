# Review: `src/picker/components/OverrideRow.tsx`

**Purpose:** One override row — a label, an *uncontrolled* `<input type="color">`,
and a clear (×) button. Pure presentation (props only), `memo`'d so unchanged rows
skip re-render. The uncontrolled input is the crux: a controlled `value` would let
React replace the live input mid-drag and close the native color dialog.

**LOC:** 33 non-comment / non-blank — within the ≤200 limit.

## Findings

- **LOW — `onInput` fires a live apply on every drag tick with no throttle.**
  `OverrideRow.tsx:32`. Each `input` event calls `onColorChange`, which applies
  live through the engine and enqueues a persist. During a fast color drag this
  fires many engine repaints + storage writes per second. The downstream persist
  is serialized (see `persist-overrides`) so it cannot lose an update, and the
  engine apply is in-page and cheap, so this is not a correctness bug — but it is
  avoidable churn. If perf shows up on heavy pages, debounce the persist (not the
  apply — the live apply should stay immediate). NOTE only.

- **LOW — `defaultValue={row.color}` relies on the parent's `key` to re-seed.**
  `OverrideRow.tsx:30`. Because the input is uncontrolled, changing `row.color`
  alone would NOT update the displayed swatch; only the parent's `key={role:color}`
  remount picks up a new seed. This is correct and intentional (and documented in
  both this file's header and `Panel`), but it is a non-obvious coupling — the row
  is only correct in the context of that exact key strategy. Keep the two in
  lockstep. No change.

## What is good
- **The uncontrolled-input rationale is correct and well-documented.** This is the
  single subtle React footgun on this surface (a controlled `<input type="color">`
  remounting mid-drag closes the OS dialog), and the file handles it the right way:
  `defaultValue` + `onInput` + parent-driven remount, with an accurate header
  comment explaining exactly why.
- **Pure + `memo`'d + props-only** — exactly the presentational discipline the
  contract wants. No context reads, no logic, no `any`.
- Good accessibility: `aria-label` on both the color input and the clear button,
  `type="button"` on the button, a `title` tooltip.
