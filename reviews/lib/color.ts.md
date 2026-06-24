# Review: `src/lib/color.ts`

**Purpose:** Pure color math — hex/RGB/HSL conversions, WCAG luminance & contrast, contrast enforcement (`ensureContrast`/`nudgeToAA`), sRGB blend (`mixHex`), luminance bucketing.
**LOC:** 327.

## Overall grade: **A-**

This is the cleanest substantial file in the repo: pure functions, honest `RGB`/`HSL` types, no DOM, no globals, thorough doc comments stating guarantees, and full test coverage. The only real marks against it are the internal `ensureContrast`/`nudgeToAA` near-duplication and the fact that this same code is hand-copied into `inject.ts`.

## Findings

- [x] FIXED: `ensureContrast`/`nudgeToAA` were ~90% identical. Extracted a shared private `relightToAA(color, bg, target, onFail)` that owns the early-return, the `search(dir)` lightness walk, and the smaller-delta tie-break. The two public functions now differ ONLY in their `onFail` thunk (`ensureContrast` → black/white extreme; `nudgeToAA` → `ensureContrast`). Behavior is byte-identical — verified by the 38 `color.test.ts` tests staying green. Halves the surface that must mirror the inject port.

- [x] FIXED: `ensureContrast`'s `search` returned `{hex, ratio}` where `ratio` was computed and discarded, with a "tie-break on ratio headroom" comment that lied (it tie-broke on lightness delta). The unified `relightToAA` search returns a bare `string` (no dead `ratio` field); the misleading comment is gone (the tie-break is now honestly labelled "Prefer the smaller lightness move").

- [x] VERIFIED-INVALID (deferred by design, not fixed here): "hand-duplicated into inject.ts with no equivalence test". CONFIRMED real but the resolution chosen for the lockstep blocker (see mapping.ts review) is option (a): `inject.ts` is the SINGLE standalone shipped engine, tested directly via `tests/inject.test.ts` + e2e; `color.ts` is the popup/palette path's math. They are no longer framed as a "lockstep pair" — the `color.ts` docstring now states they are intentionally separate copies (the inject one is a serialized `executeScript` payload that cannot import). A cross-equivalence test would pin two copies that no longer claim to be the same function, so it's not warranted. Updated the docstring instead of adding a false-precision test.

- [x] VERIFIED-INVALID (acceptable, left as-is): `hexToRgb`/`hexToHsl` throw on invalid input via `normalizeHex`. The throwing contract is documented-by-implication and `isHexColor` is the non-throwing guard. The one caller that needed the guard (`applyOverridesToRoles` in `mapping.ts`) is DELETED. Live callers feed already-validated hex. Left as a clean validation choke point.

## What's GOOD
- **Textbook pure module.** Every function is referentially transparent, typed with real `RGB`/`HSL` structs (not bare tuples — contrast this with inject.ts's `[number,number,number]`), and individually testable.
- **WCAG math is correct and cites the spec** (`linearize` threshold 0.03928, the 0.2126/0.7152/0.0722 coefficients, AA 4.5/3 thresholds). `contrastRatio` is documented as symmetric and is.
- **`nudgeToAA`'s "preserve the hue, only move lightness, fall back to black/white only as last resort"** is a genuinely thoughtful anti-monochrome strategy with a clear GUARANTEE stated in the doc comment.
- **`normalizeHex` as the single validation choke point** (with `isHexColor` as its non-throwing companion) is a clean design.

## Top 3 concrete changes
1. **Collapse `ensureContrast`/`nudgeToAA` into a shared `relightToAA` helper** — removes the biggest internal duplication and shrinks the lockstep surface.
2. **Delete the unused `ratio` field** in `ensureContrast`'s search result and fix the "tie-break on ratio headroom" comment that describes behavior the code doesn't implement.
3. **Add a cross-implementation equivalence test** between this canonical math and the inject.ts port (shared with the inject.ts recommendation).
