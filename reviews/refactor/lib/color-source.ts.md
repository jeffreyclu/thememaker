# Refactor plan — `src/lib/color-source.ts`

**Non-comment LOC: 90.** Verdict vs ≤200: **PASS.**

The color SOURCE layer: local vs API (`thecolorapi.com`) palette resolution with in-memory + persistent caching and a real fallback to local generation. Dependency-injected (fetch + cache), fully unit-tested (`color-source.test.ts`). Cohesive, under budget. No split needed.

## Duplication found
None. It correctly delegates all generation to `palette.ts` (`generatePalette`) and all hex handling to `color.ts`.

## Long functions
- `apiPalette` (106–152, ~40 LOC) — the 3-tier resolve (memory → persistent → fetch+fallback). At the threshold but cohesive and linear; each tier is a small guarded block. Acceptable as one function (splitting the cache tiers would scatter the resilience logic). Leave it.

## Ordered steps
No action required. Leave as-is.
