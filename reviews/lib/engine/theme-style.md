# Review: src/lib/engine/theme-style.ts

**LOC**: 11

No findings.

Single-purpose primitive (`ensureStyleEl`) with a correct create-or-reuse-by-id contract and a sensible host fallback chain (`document.head` -> `querySelector("head")` -> `documentElement`) for the `document_start` case before `<head>` exists. The "never remove-then-append" rationale in the header correctly motivates the design (no themeless flash gap). Pure DOM, no `chrome.*`, no `src/popup`/`src/picker` imports. Comment uses a literal `{id}` placeholder (line 13) which reads slightly JSX-ish but is unambiguous. Export is consumed by both `theme.ts` and `engine-early.ts`.
