# Review: `src/lib/color.ts`

**Purpose:** Pure color math — hex/RGB/HSL conversions, WCAG luminance & contrast, contrast enforcement (`ensureContrast`/`nudgeToAA`), sRGB blend (`mixHex`), luminance bucketing.
**LOC:** 327.

## Overall grade: **A-**

This is the cleanest substantial file in the repo: pure functions, honest `RGB`/`HSL` types, no DOM, no globals, thorough doc comments stating guarantees, and full test coverage. The only real marks against it are the internal `ensureContrast`/`nudgeToAA` near-duplication and the fact that this same code is hand-copied into `inject.ts`.

## Findings

### [medium] `ensureContrast` (192) and `nudgeToAA` (257) are ~90% identical
Both: early-return if already passing, compute `base = hexToHsl`, define an identical `search(dir)` lightness walk, run darker+lighter, tie-break on the smaller lightness delta, then fall through. They differ ONLY in the fallback: `ensureContrast` ends at black/white; `nudgeToAA` ends by *calling* `ensureContrast`. The shared 30-line body is copied.

**Why it matters:** DRY. Two functions that must stay behaviorally aligned (and which are BOTH re-ported into inject.ts, so the duplication is 4x in effect) should share their core.

**Concrete fix:**
```ts
const relightToAA = (color: string, bg: string, target: number,
                     onFail: () => string): string => {
  if (contrastRatio(color, bg) >= target) return normalizeHex(color);
  const base = hexToHsl(color);
  const search = (dir: 1 | -1) => { /* the shared walk */ };
  const d = search(-1), l = search(1);
  if (d && l) return Math.abs(hexToHsl(d).l - base.l) <= Math.abs(hexToHsl(l).l - base.l) ? d : l;
  return d ?? l ?? onFail();
};
export const ensureContrast = (t, bg, large=false) =>
  relightToAA(t, bg, large?AA_LARGE:AA_NORMAL, () =>
    contrastRatio("#000",bg) >= contrastRatio("#fff",bg) ? "#000000" : "#ffffff");
export const nudgeToAA = (c, bg, large=false) =>
  relightToAA(c, bg, large?AA_LARGE:AA_NORMAL, () => ensureContrast(c, bg, large));
```
This halves the surface that must be kept in lockstep with the inject port.

### [low] `ensureContrast`'s `search` returns `{hex, ratio}` but `nudgeToAA`'s returns `string` — needless shape divergence
Lines 206 vs 263. `ensureContrast` carries `ratio` in its search result and then... never uses it (the tie-break recomputes `hexToHsl(...).l`, and the comment "tie-break on ratio headroom" at 225 is not actually implemented — it tie-breaks on lightness delta only). So the `ratio` field is computed and discarded.

**Why it matters:** Dead field + a comment that lies about the behavior. "tie-break on ratio headroom" (225) does not happen.

**Concrete fix:** Drop `ratio` from the search result; fix or delete the misleading comment. (Folds naturally into the `relightToAA` refactor above.)

### [low] This module is hand-duplicated into `inject.ts` (219–444) with no equivalence test
Same lockstep concern flagged in the `inject.ts`/`mapping.ts` reviews. `color.ts` is the canonical source; the inline port in `inject.ts` is a near-copy that additionally accepts `rgb()` strings. No test feeds identical inputs to both and asserts equality.

**Concrete fix:** A small table-driven equivalence test (covered in the inject.ts review) would pin them.

### [nit] `hexToRgb`/`hexToHsl` will THROW on invalid input (via `normalizeHex`), while `isHexColor` exists to guard
The throwing contract is fine and documented-by-implication, but several callers (e.g. `applyOverridesToRoles` in mapping.ts) must remember to guard with `isHexColor` first. A reader has to know which functions throw. Minor — the types don't advertise the throw.

## What's GOOD
- **Textbook pure module.** Every function is referentially transparent, typed with real `RGB`/`HSL` structs (not bare tuples — contrast this with inject.ts's `[number,number,number]`), and individually testable.
- **WCAG math is correct and cites the spec** (`linearize` threshold 0.03928, the 0.2126/0.7152/0.0722 coefficients, AA 4.5/3 thresholds). `contrastRatio` is documented as symmetric and is.
- **`nudgeToAA`'s "preserve the hue, only move lightness, fall back to black/white only as last resort"** is a genuinely thoughtful anti-monochrome strategy with a clear GUARANTEE stated in the doc comment.
- **`normalizeHex` as the single validation choke point** (with `isHexColor` as its non-throwing companion) is a clean design.

## Top 3 concrete changes
1. **Collapse `ensureContrast`/`nudgeToAA` into a shared `relightToAA` helper** — removes the biggest internal duplication and shrinks the lockstep surface.
2. **Delete the unused `ratio` field** in `ensureContrast`'s search result and fix the "tie-break on ratio headroom" comment that describes behavior the code doesn't implement.
3. **Add a cross-implementation equivalence test** between this canonical math and the inject.ts port (shared with the inject.ts recommendation).
