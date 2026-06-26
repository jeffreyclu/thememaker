# Review: src/lib/palette/palette-generate.ts

**LOC**: 96 (fine)

## Findings

- **Low** (122) `[...surfaceRamp(surfaceBase)].sort(...)` — the spread is redundant.
  `surfaceRamp` already returns a fresh array (`.map`), so the copy guards nothing.
  Fix: `surfaceRamp(surfaceBase).sort(...)`.
- **Low** (182-192) `invertPalette` re-derives `swatches`/`themeColors` by mapping
  `invertLightness` independently of `roles`, even though `swatches` is documented
  elsewhere as "the hex projection of `themeColors`," which itself derives from
  `roles`. Inverting all three in parallel works only because the projection is
  order-preserving and lightness-flip is per-color; if `themeSwatches` ever
  de-dups or reorders, these can drift. Fix: re-project after inverting roles
  (`themeSwatches(invertedRoles)`) so the invariant is enforced in one place, not
  replicated.
- **Note** (109 vs 92-94) `isMono` uses `mode.startsWith("monochrome")` while
  `harmonyHues` enumerates the three monochrome cases explicitly. Both correct, but
  two different membership tests for the same concept; minor consistency smell.

Pure/deterministic as documented, no `chrome.*`/DOM, no popup/picker imports.
Comments are accurate and high-value.
