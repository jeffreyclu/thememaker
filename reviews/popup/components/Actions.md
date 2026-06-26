# Review: src/popup/components/Actions.tsx

**LOC**: 82 (under 200)

Connected component reading state/actions from context, with a memoized presentational `ActionButton`. Button-descriptor approach removes markup duplication. Clean React discipline: no business logic inline (delegated to `isCurrentSaved`, hooks). Header comment is accurate and useful.

## Findings

- **Low** — Inconsistent disabled-expression style. Line 76 uses `!state.applied && !state.current`, while line 94 uses `!(Boolean(state.current) || state.applied)`. Same intent expressed two ways. Fix: pick one idiom (e.g. `!state.current && !state.applied`) for readability.
- **Low** — a11y on `loading` button (line 60). Label changes to "Generating…" but no `aria-busy`/`aria-live`, so SR users get no progress cue. Fix: add `aria-busy={loading}` to the generate button (would require threading an extra optional field through `ButtonSpec`).
- **Note** — `ButtonSpec.id` doubles as DOM `id` and React `key`. Fine while ids are unique/static, but ties test selectors to render keys; acceptable here.

Otherwise solid — presentational/connected split is correct and memoization is appropriate.
