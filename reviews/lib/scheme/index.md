# Review: `src/lib/scheme/index.ts`

**Reviewed:** 2026-06-26
**Purpose:** Barrel entry for the scheme domain — re-exports `mode`, `transforms`, `derive`.

## LOC
3 non-comment / non-blank lines (`export * from "./mode" | "./transforms" | "./derive"`). Well within the ≤200 limit.

## Findings

No findings.

### Notes (non-blocking)

- **[Low] Barrel re-exports widen every sub-module's public surface.** `index.ts:10-12` does `export *` over three modules. Several of their exports have **zero external consumers** (see the per-file reviews: `overrideRoleLabel`, `currentSchemeDetails`, `SavedCheckInput`, `GeneratePaletteOptions`, `GenerateResult`). The barrel makes all of them domain-public regardless of need, so dead/over-wide exports are invisible at this layer. Not a defect — `export *` is the documented pattern here — but the place to tighten is the sub-modules (drop the `export` keyword on internal-only symbols), not this file. `file:src/lib/scheme/index.ts:10`.
- The module docstring (lines 1-9) is accurate to the current structure: it names the three sub-modules and their consumers (popup hooks/components, content-script/persistence tests). No stale paths or jargon. Good.

## Architecture / domain fit
Correct. This is a pure, DOM-free, `chrome.*`-free aggregation point as the docstring claims, and it does not import from `src/popup` or `src/picker` (verified: no lib→popup/picker imports anywhere). Nothing to flag.
