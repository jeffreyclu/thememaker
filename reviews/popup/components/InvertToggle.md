# Review: src/popup/components/InvertToggle.tsx

**LOC**: 29 (under 200)

No findings.

Correctly pure/presentational and memoized; `checked`/`onToggle` via props, no business logic. Accessibility is well done: `role="switch"` with `aria-checked` reflecting state, `aria-labelledby` pointing at the visible label, `type="button"` to avoid form submission. The native `<button>` gives keyboard (Enter/Space) activation for free. Controlled state is handled correctly (parent owns `checked`, toggle only signals intent).
