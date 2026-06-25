# Refactor plan — `src/lib/palette.ts`

**Non-comment LOC: 227.** Verdict vs ≤200: **SPLIT.**

Pure HSL palette generation. Three concerns: (1) the `Palette`/`PaletteRoles`/`ThemeColor` types + the `generatePalette`/`invertPalette` orchestration, (2) `deriveRoles` (the ~110-LOC anti-monochrome role derivation — the file's dominant mass), (3) `themeSwatches` (the swatch-fold / source-of-truth list). Splitting by concern lands all three under budget.

## Decomposition plan (3 files, each ≤200)

| File | Responsibility | Moves | Target LOC |
|---|---|---|---:|
| `src/lib/palette.ts` (kept) | `Palette`/`PaletteRoles`/`ThemeColor` interfaces, `generatePalette`, `invertPalette`, `surfaceRamp`, `harmonyHues`, `mapRoles`/`invertLightness`, `wrapHue`/`atLightness`. | — | ~120 |
| `src/lib/palette-roles.ts` | `deriveRoles` + its local helpers (`clampL`/`clampSat`, the bg/surface/text/accent/button/border derivations). The big one. | lines 131–282 | ~120 |
| `src/lib/palette-swatches.ts` | `themeSwatches`, `sameSwatch`, `NEUTRAL_SAT`/`HUE_FOLD_DEG`, `ThemeColor`. | lines 284–349 | ~60 |

`generatePalette` imports `deriveRoles` from `palette-roles.ts` and `themeSwatches` from `palette-swatches.ts`.

## Duplication found
None significant across the codebase — `palette.ts` is the canonical palette home and correctly imports all color math from `color.ts`. Internally `surfaceRamp` and `deriveRoles` both build HSL ramps but with different intent; no extraction warranted.

## Long functions
- **`deriveRoles` (155–282, ~110 LOC):** the single long function. It computes ~13 roles in labeled sections (backgrounds / body+secondary ink / accent roles / buttons / border). Split into named sub-builders within `palette-roles.ts`: `deriveSurfaces(base, hues, dark, isMono)`, `deriveInk(base, sat, dark, isMono, secondaryHue)`, `deriveAccents(hues, sat, isMono, monoBias)`, `deriveButtons(base, sat, dark, secondaryHue)`, `deriveBorder(base, sat, dark)`. `deriveRoles` becomes a ~25-LOC assembler that calls them and spreads the result. Each sub-builder is independently testable and the section comments become the function docs.
- `themeSwatches` (312–349, ~30 LOC): fine; `sameSwatch` is already a clean inner predicate.

## Shared utils to extract
- `lib/palette-roles.ts`, `lib/palette-swatches.ts` (palette-internal, not cross-cutting).

## Ordered steps
1. Move `themeSwatches`+fold consts → `palette-swatches.ts`. Repoint. `palette.test.ts` green (it tests swatch counts per mode).
2. Move `deriveRoles` → `palette-roles.ts`; THEN split it into the five sub-builders. Test after each (palette.test pins role distinctness + AA-seedness + invert self-inverse).
3. Re-measure (`palette.ts` ≤200); `tsc` + `vitest`.
