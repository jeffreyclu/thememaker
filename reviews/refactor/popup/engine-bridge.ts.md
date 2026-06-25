# Refactor plan — `src/popup/engine-bridge.ts`

**Non-comment LOC: 129.** Verdict vs ≤200: **PASS.**

Bridge from popup → palette engine: resolves seed/mode, fetches a palette (API/local), and builds display `Scheme`s + apply payloads. Cohesive, under budget, well-tested via the popup/site-persistence tests. No split needed.

## Duplication found
- It is the canonical home for the "empty → no overrides" convention (`resolveOverrides`, 154–160), also echoed in `site-state.ts` (`loadDecision`) and `content/index.ts` (`optionsFor`). See `site-state.ts.md` — optional shared `withOverrides` helper, low priority.
- `schemeFromPalette` (57–78) builds the display `colors` map from `palette.themeColors`; this is the single producer of that mapping. No dup.

## Long functions
None over ~30 LOC. `generateForSelection` (112–137) and `schemeWithIntensity` (210–232) are compact.

## Ordered steps
No action required. (If the apply-options helper is extracted during override-grammar work, repoint `resolveOverrides`.)
