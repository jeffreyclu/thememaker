# Review: src/lib/color/index.ts

**LOC**: 196 (non-comment). Under the 200 hard limit, but close — watch growth.

Pure color math (conversions, WCAG luminance/contrast, AA relighting, bucketing). DOM-free and `chrome.*`-free as the header claims — verified, holds.

## Findings

- **Low** — header doc (lines 7-9): references `color-runtime.ts` as the tolerant wrapper, but the actual sibling is `css-color.ts`. Stale path/jargon. Fix: rename the reference to `css-color.ts` (this module is itself `index.ts`, not `color.ts` either).
- **Low** — `relightToAA` search (line 205): loops `step` 1..100 in integer lightness units and recomputes contrast each step. Correct and bounded, but the "fine steps" comment (line 188) oversells it — steps are whole-percent, not fine. Fix: drop "fine" or note the 1% granularity.
- **Low** — `nudgeToAA` (line 265) and `ensureContrast` (line 236) are behaviorally identical except for the fallback thunk; the two long doc blocks (lines 184-263) restate the same mechanism three times. Not a bug — consider trimming the `nudgeToAA` block to "see ensureContrast; differs only in fallback."

No correctness, security, or export-surface issues. Math (hex/HSL/luminance/contrast) checks out.
