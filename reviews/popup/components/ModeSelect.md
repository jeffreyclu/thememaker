# Review: src/popup/components/ModeSelect.tsx

**LOC**: 31 (under 200)

## Findings

- **Low** — `ModeSelect.tsx:26` — `e.target.value as ModeSelection` is an unchecked cast. Since options are sourced from `modes` + the literal `"random"`, the value is always valid at runtime today, so this is safe in context — but the cast bypasses the type system; if `modes`/`ModeSelection` drift apart later, a bad value passes silently. Acceptable as-is; consider a narrowing helper only if the union grows.

- **Low** — `ModeSelect.tsx:31` — option label renders the raw mode key `{m}`. If mode keys aren't human-friendly, a display formatter would read better. Cosmetic; ignore if keys are already presentable.

## React discipline
Correctly pure/presentational and memoized; value + onChange via props, no business logic. Controlled `<select>` handled correctly (`value` + `onChange`). Label associated via `htmlFor`/`id`. `key={m}` is a stable identity (mode keys are unique). Clean.
