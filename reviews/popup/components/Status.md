# Review: src/popup/components/Status.tsx

**LOC**: 15 (under 200)

## Findings

- **Low** — `Status.tsx:15-16` — errors are announced with `role="status"` / `aria-live="polite"`. For error content, `role="alert"` (assertive) is the more conventional choice so screen readers surface failures promptly rather than waiting for an idle moment. Minor a11y nuance; "polite" is defensible if errors are non-urgent.

## React discipline
Correctly connected (reads `error` from context) and memoized; no business logic — pure conditional class + text. Empty-string fallback (`error ?? ""`) keeps the live region present in the DOM so changes are announced. Clean.
