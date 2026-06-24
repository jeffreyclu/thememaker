# Review: `src/config.ts`

**Purpose:** Static config — the `modes` list, the `htmlElements` tag-role buckets, and `MAX_HISTORY`.
**LOC:** 34.

## Overall grade: **C**

`modes` and `MAX_HISTORY` are fine, live, and correct. But `htmlElements` (lines 13–31) — over half the file — is DEAD v1-engine config: I verified it is imported ONLY by the dead tag-bucket functions in `theme-engine.ts`, which no production path calls. So a tiny config file is 60% graveyard.

## Findings

- [x] FIXED: `htmlElements` was dead v1-engine config (only the dead `theme-engine.ts` consumed it). Deleted all seven buckets (incl. the doubly-dead `clearContainer`) and the `HtmlElements` import. `config.ts` now shrinks to `modes` + `MAX_HISTORY`.

- [x] FIXED: `modes: ColorMode[]` had no compile-time validity check. `ColorMode` is now a union (in types.ts), so `modes` (and `harmonyHues` and the popup select) are validated against one source of truth at compile time.

- [x] FIXED: No module docstring. Added a one-line purpose comment to match the codebase norm.

## What's GOOD
- **`modes` and `MAX_HISTORY` are exactly the right kind of centralized config** — small, named, single source of truth, consumed by the live engine-bridge/storage/theme-engine.
- Keeping `MAX_HISTORY` here (not inline in storage) is the correct call — it's a product constant, not a storage detail.

## Top 3 concrete changes
1. **Delete `htmlElements`** (all seven buckets) and `clearContainer` with the v1-engine removal — it's dead config masquerading as the role table.
2. **Tighten `ColorMode` to a union** so `modes` is validated at compile time.
3. **Add a one-line module docstring** to match the codebase norm.
