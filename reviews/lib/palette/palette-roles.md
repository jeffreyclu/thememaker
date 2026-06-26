# Review: src/lib/palette/palette-roles.ts

**LOC**: 96 (fine)

## Findings

- **Low** (165) `primary = hslToHex({ h: base.h, s: base.s, l: base.l })` round-trips
  the seed through HSL, but the comment (161-164) claims primary is "the user's root
  color, verbatim ... keeps its exact hex." HSL→hex rounding can shift the hex by a
  bit, so it is *not* verbatim. Fix: either pass the original `seedHex` through to
  `deriveRoles` and use it directly for `primary`, or soften the comment to "approx
  the seed color" so it stops overstating exactness.
- **Low** (166, 176) Contrast for `onPrimary`/`onSecondary` uses a hardcoded
  `luminanceOf(...) < 0.4` threshold and ad-hoc near-white/near-black literals
  (`#ffffff`/`#111111` vs `#f5f5f5`/`#1a1a1a`). The 0.4 magic number is duplicated and
  the two extreme pairs differ for no stated reason. Fix: extract a single
  `bestInkFor(fill)` helper so the AA-pick logic and threshold live in one place.
- **Note** (148-155) Many tuned magic numbers (saturation floors/caps, lightness
  steps) inline. Acceptable for a tuning-heavy generator and each is commented, but a
  named constants block would ease future tuning. Non-blocking.

Pure HSL math, no DOM/`chrome.*`, no popup/picker imports. `wrapHue` export is justified
(shared with palette-generate). Comments are thorough and accurate.
