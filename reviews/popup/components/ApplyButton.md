# Review: src/popup/components/ApplyButton.tsx

**LOC**: 32 (under 200)

Pure, memoized presentational component shared by history items and favorite apply controls. No business logic, no context — props in, markup out. Header comment accurately explains the `data` spread rationale. Good reuse via `SwatchStrip`.

## Findings

- **Low** — a11y: the swatch label. `labelText` is the only accessible name; the swatch strip presumably conveys color info visually only. If `labelText` can be empty/non-descriptive for some callers, the button would have a weak accessible name. Fix: ensure callers always pass meaningful `labelText`, or add an `aria-label` prop fallback. Not blocking without evidence of an empty-label caller.
- **Note** — `data?: Record<\`data-${string}\`, string>` is spread last (line 30), so a caller could override `type`/`className`/`onClick` via `data`. Template-literal key type prevents that in practice (only `data-*` keys allowed), so this is safe — good typing choice.

No blocking or high findings. Clean.
