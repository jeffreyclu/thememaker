# Review: `src/lib/engine/engine-surface.ts`

**Purpose:** The per-element surface painter. Captures/reads the frozen original style, and for one element emits its surface CSS rule: `background = mix(frozenOriginal, fixedTheme, factor)`, preserving image backgrounds + alpha + softened shadows, honoring the themed-surface budget. The hottest function in the engine (`processElement` runs once per DOM element).

**LOC:** 92 non-comment, non-blank lines. Within the ≤200 limit.

## Findings

### NOTE — `parseCssColor(orig.bg)` then `alphaOf(orig.bg)` re-parse the same string (`engine-surface.ts:107, 143`)
In the hot path, `orig.bg` is parsed by `parseCssColor` (line 107) for the RGB, then re-scanned by `alphaOf` (line 143) with a second regex for the alpha. Two independent regex passes over the same computed-color string per themed element.
**Why it's only a NOTE:** `alphaOf` is only reached for elements that *are* surfaces (passed the `bgRgb`/image guards), and the regex is cheap; the dominant cost per element is `getComputedStyle` (already cached after first sighting). Micro-opt, not a real bottleneck.
**Fix (optional):** If `lib/color` exposed a single parse returning `{rgb, alpha}`, both call sites could share it. Not worth a bespoke change in the engine — would belong in `lib/color`.

### NOTE — `state.themedCount` cap is checked, but image-backed/skipped elements still consume a `getComputedStyle` (`engine-surface.ts:80-118`)
Past the `MAX_THEMED` cap the function returns early (good). Below the cap, every non-done element pays an `originalStyleOf` → `getComputedStyle` (line 55/106) even if it turns out to be a non-surface (no bg) and is *not* added to `doneSet` (correct, by design — line comment 100-105 explains recycled nodes). So a page with many transparent wrappers re-pays `getComputedStyle` on each observer pass for the same non-surface nodes.
**Why it's only a NOTE:** This is a deliberate, documented trade-off (non-surfaces must stay re-checkable for SPA recycling). The `doneSet` + image-freeze short-circuits cover the common cases. Acceptable.

## Correctness — verified clean
- `originalStyleOf` caches-once correctly; re-apply reads the frozen value, never the engine's own drifted output. Idempotent. ✔
- Image-background elements are frozen (`doneSet.add`) and skipped — real assets preserved. ✔
- Alpha preservation (line 143-144): semi-transparent overlays stay see-through. ✔
- The `console.warn` budget warning is wrapped in `try/catch` with an eslint-disable — defensive, fine.
- `id` reuse: reads existing `ROOT_MARKER_ATTR` before minting a new `nextId` (lines 122-127), so re-apply doesn't renumber. ✔

## Naming / duplication / architecture
- Names clear (`processElement`, `originalStyleOf`, `frozenOriginal`, `fill`). 
- **No color-math duplication** — `mixCss`, `parseCssColor`, `rgbTupleToHex`, `alphaOf`, `withAlpha` all from `../color/css-color`. ✔
- `MAX_THEMED` is exported and consumed by `engine-walk` (the queue short-circuit) — legitimately shared, not over-wide.
- No `popup`/`picker` import. Boundary respected.

## Comment quality
- Excellent — logic-only, accurate, explains the non-obvious "fixed theme by role, never `bucketOf(frozenOriginal)`" invariant that is the heart of the no-drift design. No stale paths.
