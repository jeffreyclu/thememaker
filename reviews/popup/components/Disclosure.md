# src/popup/components/Disclosure.tsx

**LOC:** 41 non-comment (≤200 ✓)

Shared disclosure: a `<section>` with an aria-wired toggle button + a collapsible panel (`hidden` when closed). Pure presentation; `expanded`/`onToggle` from props; `id`/`panelId`/`panelClassName`/`disabled` overridable (Details reuses it with its own ids + a disabled toggle).

## Findings

**None.** Exemplary presentational component — correct `aria-expanded` + `aria-controls` wiring, `disabled` support, memoized. The override props are justified by the three call sites (History / Favorites / Details). Clean.
