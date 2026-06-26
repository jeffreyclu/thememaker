# Review: `src/picker/state/picker-reducer.ts`

**Purpose:** The picker's overrides reducer — the immutable state machine for the
live override map. `overridesReducer` handles `pick` (seed a new key with the
element's current color), `clearRole` / `clearAll` (drop keys), `reseed` (replace
the whole map; the APPLY_LIVE path). `mergeColor` applies a validated, normalized
explicit color edit (the uncontrolled input's live value). Every transition
returns the same reference on a no-op.

**LOC:** 42 non-comment / non-blank — within the ≤200 limit.

## Findings

No findings.

This is a clean, pure, fully-typed state machine: a discriminated `OverridesAction`
union, exhaustive `switch` (TS narrows all four cases; no `default` needed), and
correct immutability — `pick`/`clearRole` return `state` unchanged on a no-op
(stable reference → no needless re-render), spread/delete on a change. Hex
validation is delegated to the shared `lib/color` (`isHexColor` / `normalizeHex`)
and the fallback to the shared `lib/overrides` (`FALLBACK_COLOR`), so no color
logic is duplicated here. `mergeColor` correctly ignores invalid hex (returns
`state`). Naming is verb/role-clear, comments are logic-only and accurate, and the
module mirrors the popup's reducer convention the contract asks for. Both exports
(`overridesReducer`, `mergeColor`) are consumed by `PickerProvider` /
`useApplyOverrides` — no over-wide surface.
