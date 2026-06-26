# Review: src/popup/components/History.tsx

**LOC**: 44 (under 200)

## Findings

- **High** — `History.tsx:35` — `key={index}` uses the array index as React key. Because `rows` is `history.map(...).reverse()`, inserting a new scheme (most-recent-first) shifts every row's index, so React reconciles by position and can mis-associate DOM/state across entries. Use a stable per-scheme identity (scheme id/hash, or a composed key) instead of the index.

- **Medium** — `History.tsx:30` — duplicate `id="history"`: the `<ul>` and the `Disclosure` (line 26) both set `id="history"`. Duplicate `id` is invalid HTML and breaks any `aria-controls`/label association the disclosure relies on. Give the panel/list distinct ids.

- **Low** — `History.tsx:22` — `rows` is recomputed (`map().reverse()`) on every render despite `memo`. Minor, but if `history` is large, wrap in `useMemo` keyed on `history`.

## React discipline
Correctly connected (reads context/intents, container passes nothing) and memoized; no business logic in the component — display ordering only. Good separation.
