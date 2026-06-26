# Review: src/lib/palette/random.ts

**LOC**: 10 (fine)

## Findings

- **Low** (16) `Math.floor(Math.random() * 16777215)` is an off-by-one in the range.
  `Math.random()` is `[0, 1)`, so this yields `[0, 16777214]` (0x000000–0xFFFFFE):
  `#ffffff` (pure white) is unreachable and the distribution is computed against the
  *max value* rather than the *count of values* (2^24). Fix: multiply by `16777216`
  (i.e. `0x1000000`) so all 16,777,216 colors are equiprobable, matching the inclusive
  pattern `randomInt` already uses. Cosmetic for a "surprise me" seed, but it is a real
  bug and `randomInt` right below shows the correct inclusive idiom.
- **Note** (10-12) `randomInt`'s `min` is always called with `0`; the general two-arg
  form is unused breadth but harmless and reads clearly. Could inline, but fine.
- **Note** Uses `Math.random()` (non-crypto). Correct choice here — these are cosmetic
  theme seeds, not security tokens; crypto RNG would be over-engineering.

No DOM/`chrome.*`, no popup/picker imports. Pure and testable as documented.
