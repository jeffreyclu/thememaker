# Refactor plan — `src/lib/color.ts`

**Non-comment LOC: 196.** Verdict vs ≤200: **PASS (borderline).**

Pure color math: hex/rgb/hsl conversions, WCAG luminance/contrast, `relightToAA`/`ensureContrast`/`nudgeToAA`, `mixHex`, `luminanceBucket`. Clean, fully tested (`color.test.ts`, 10KB of cases), no DOM/`chrome.*`. At 196 it is UNDER budget and does not require a split on its own.

## Why it still appears in the plan: it is the canonical home for the killed inject port (D1)

The headline de-dup deletes `inject.ts`'s ~210-LOC inline copy of THIS file's functions. `color.ts` is where they consolidate. Two adjustments make it the clean single source:

1. **Runtime CSS-color parsing belongs next door, not here.** `color.ts` is deliberately hex-only (`hexToRgb` throws on non-hex). The engine + picker need to parse `rgb()`/`rgba()`/named/`transparent` computed values. Putting that in `color.ts` would muddy a pure, throwing, hex-domain module. **Create `lib/color-runtime.ts`** that imports `color.ts` and adds `parseCssColor`/`cssColorToHex`/`alphaOf`/`withAlpha` (the tolerant, null-returning runtime layer). `color.ts` stays as-is; `color-runtime.ts` is the engine/picker-facing surface.
2. **Export what the port needs.** The inline port used `rgbToHsl`/`hslToHex`/`relightToAA`/`ensureContrast`/`nudgeToAA`/`mixHex`/`luminanceBucket`/`contrastRatio` — all already exported. `relightToAA` is currently PRIVATE (module-internal, shared by `ensureContrast`/`nudgeToAA`). The engine only calls `ensureContrast`/`nudgeToAA`, so `relightToAA` can stay private. No new exports required.

After D1, `color.ts` is unchanged in size and remains the sole color-math home; the only growth is the new sibling `color-runtime.ts` (~80 LOC).

## Duplication found
- **D1 (resolved here):** `color.ts` is the canonical math home for the deleted inject port. The two were "intentionally separate copies" (per the docstrings) ONLY because of serialization; once that's gone they MUST be one. After consolidation, update `color.ts`'s docstring (lines 7–13) to drop the "the in-page engine carries its OWN copy … a change must be made in both deliberately" caveat — there is no second copy anymore.

## Long functions
None. `relightToAA` (198–231, ~30 LOC) and `hslToRgb` (109–140, ~28 LOC) are the longest and are appropriately atomic.

## Shared utils to extract
- `lib/color-runtime.ts` (new sibling, the runtime/tolerant layer over `color.ts`).

## Ordered steps
1. Create `lib/color-runtime.ts` (re-exports + `parseCssColor`/`cssColorToHex`/`alphaOf`/`withAlpha`). Add focused unit tests mirroring inject's parse cases (rgb/rgba/alpha-0/named/transparent) so the runtime layer is pinned independently of the engine.
2. (During inject Phase 2 D1) repoint the engine to `color.ts` + `color-runtime.ts`; delete the inline port.
3. Update the `color.ts` docstring to drop the obsolete "second copy" framing.
4. `tsc` + `vitest` (`color.test.ts` unchanged + new runtime tests).
