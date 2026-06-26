# Review: `src/picker/App.tsx`

**Purpose:** The picker composition root. Wraps `PickerProvider` (seeded from the
shim's props: palette / intensity / overrides / onClose) around the connected
`<Panel />`. Does no prop drilling beyond seeding the provider and reads no state
itself.

**LOC:** 18 non-comment / non-blank — within the ≤200 limit.

## Findings

No findings. This is a textbook pure composition root: a single provider wrapping
a single connected view, with every prop forwarded straight into the provider and
nothing read or computed in the root. React discipline is exactly right — state
lives in the provider, the root is presentational glue, and the docstring matches
the code. Naming is clear; no dead code, no duplication, comments are accurate and
logic-only.
