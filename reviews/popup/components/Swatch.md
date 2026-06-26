# Review: src/popup/components/Swatch.tsx

**LOC**: 27 (under 200)

## Findings

- **Low** — `Swatch.tsx:32` — `key={`${color}-${i}`}` mixes color with the index. Since a strip can legitimately contain duplicate colors, the color alone isn't unique, so the index is a pragmatic tiebreaker — but it makes keys position-dependent if the strip is ever reordered. For a static, full-replace render (as here) this is fine; flagged only for awareness.

- **Low** — `Swatch.tsx:16` — swatches are purely decorative `<span>`s with no text/`aria` equivalent for the color. Acceptable if an adjacent label conveys the color (as in history/favorites rows); just confirm a swatch is never the sole carrier of information.

## React discipline
Both components are correctly pure/presentational and memoized; props-only, no state, no `chrome.*` (comment confirms intent). Good reuse — `SwatchStrip` composes `Swatch`. Clear, well-scoped doc comments. Clean.
