# Review: src/lib/palette/palette-swatches.ts

**LOC**: 41 (fine)

## Findings

- **Low** (50-51) `sameSwatch` folds on "close hue at similar saturation," but the code
  never actually compares saturation — only hue distance (64-66) once both are saturated.
  The comment promises a saturation check that does not exist, so two same-hue colors at
  very different saturations (e.g. a vivid accent and a faintly-tinted border) still fold.
  Fix: either drop "at similar saturation" from the comments (49-51 and 35), or add the
  saturation-proximity check the comment describes.
- **Low** (64) `Math.abs(x.h - y.h) % 360` — the `% 360` is a no-op: hues are already in
  [0,360) so `abs(diff)` is < 360. Harmless but dead. The real wraparound is handled on
  line 65. Fix: drop the `% 360`.
- **Note** (33-36) Fold thresholds (`NEUTRAL_SAT`, `HUE_FOLD_DEG`) are named constants —
  good. The two block comments at 18-32 partially overlap (the doc comment is split by a
  stray second `/** ... */` at 33); cosmetic.

Pure HSL math, no DOM/`chrome.*`, no popup/picker imports. Fold logic is order-stable
(keeps the first/most-prominent of each family). Comments are accurate aside from the
saturation-claim mismatch above.
