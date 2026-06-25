# Review: `src/popup/view.ts`

**Purpose:** Popup view layer. Resolves typed element refs (`queryRefs`), populates the mode select, wires DOM events to handler callbacks once (`bindEvents`), and renders `PopupState` into the popup DOM (`render` + the `renderDetails`/`renderHistory`/`renderFavorites` helpers).
**LOC:** 374.

## Overall grade: **B+**

A disciplined view layer: no `chrome.*`, no business logic, intents flow out through typed callbacks, delegated event listeners wired once, ARIA attributes maintained. The weak spots are a full destroy-and-rebuild `render` on every state change (focus/interaction hazard), three near-identical swatch-row DOM builders, and the recurring `value as string` cast over the unsound `Scheme` type.

## Findings

- [x] FIXED: Gated the three expensive sub-renders on the immutable slices that drive them, keyed per-`refs` via a `WeakMap<PopupRefs, RenderedSlices>`. `renderDetails` rebuilds only when `state.current` or `state.overrides` changes; `renderHistory` only when `state.history` changes; `renderFavorites` only when `state.favorites` changes (the reducer swaps these references on real updates). The cheap attribute/visibility/disclosure updates still run every render. So an intensity-slider drag or a disclosure toggle no longer tears down + rebuilds list DOM (preserving focus/scroll). Keyed by `refs` so a fresh mount (new refs object) always renders even if a slice reference is shared. Verified with a throwaway probe: intensity-only change preserves the existing history node; a new `history` reference rebuilds; a remount with the same slice reference still renders.

### [medium] `render` is a full teardown-and-rebuild (`innerHTML = ""` then recreate) on EVERY state change
`renderDetails` (166), `renderHistory` (245), `renderFavorites` (285) each start with `container.innerHTML = ""` / `list.innerHTML = ""` and rebuild all children. `render` calls all three unconditionally every time. So every intensity-slider tick, every disclosure toggle, rebuilds the entire details/history/favorites DOM.

**Why it matters:** Performance + interaction safety. Rebuilding favorites/history on each `render` destroys any focused element inside them (keyboard focus jumps), and if `render` runs while the user is mid-interaction with a list it resets. For a small popup this is survivable, but it's the classic "re-render everything" smell and it makes the `render` non-idempotent w.r.t. focus despite the "Idempotent" docstring (332).

**Concrete fix:** Gate the expensive sub-renders on the data that drives them (only re-render history when `state.history` reference changes, favorites when `state.favorites` changes — both are replaced immutably by the reducer, so a cheap `prev === next` check works). Or move to keyed reconciliation. Minimum: don't rebuild history/favorites on intensity-drag renders.

- [x] FIXED: Extracted `makeSwatch(className, color)`, `makeSwatchStrip(stripClass, swatchClass, colors)`, `makeDetailRow(text, color)` (plus a tiny `makeDetailsSeed`). `renderDetails`' two row loops now each call `makeDetailRow`, and history/favorites both build their swatch strip via `makeSwatchStrip`. The four near-identical inline construction blocks are gone.

### [medium] Three near-identical swatch-row builders duplicated inline
`renderDetails` builds a `details__row` (swatch + tags + hex) at lines 178–194 AND again for overrides at 206–222 — the same five-line pattern twice. `renderHistory` (266–271) and `renderFavorites` (305–310) both build a swatch strip with the identical loop. Four copies of "make a span, set className, set backgroundColor, append".

**Why it matters:** DRY within the view. The repetition is mechanical and obscures the small differences (label vs tags) that actually matter.

**Concrete fix:** Extract `makeSwatch(color)`, `makeSwatchStrip(colors)`, and `makeDetailRow({swatch, text, hex})` helpers. `renderDetails`' two loops then differ only in their row source.

- [x] VERIFIED-INVALID / NOT-WORTH-IT: The `value as string` cast is already gone (foundation pass) — `schemeSwatches` now iterates `Object.values(scheme.colors)`, a `Record<string,string>`. It does NOT diverge from the source of truth: `scheme.colors` is built in `schemeFromPalette` from `palette.themeColors` (`colors[tc.role] = tc.color`), the SAME list `palette.swatches = themeColors.map(tc => tc.color)` is built from. So `Object.values(scheme.colors)` == the palette's swatch colors. Switching to `scheme.schemeDetails.palette?.swatches` would add a legacy-fallback branch (legacy schemes carry `colors` but may lack `palette`) for no display difference, and would split the display source away from `scheme.colors` (which the detail rows + tests already use). Left as-is.

### [low] `schemeSwatches` (227–242) duplicates `schemeDetailRows`/`themeSwatches` color-extraction with another `value as string` cast
It iterates `Object.entries(scheme)`, skips `schemeDetails`, casts `value as string`, dedupes, takes 5. This is a THIRD place (after state.ts `schemeDetailRows` and palette.ts `themeSwatches`) that extracts "the distinct colors of a scheme", and it repeats the unsound cast over the `Scheme` index type.

**Why it matters:** DRY + honest types. The palette already computes `swatches` (the canonical distinct-color list); the view re-derives a different five-color projection from the raw scheme map instead of using `scheme.schemeDetails.palette.swatches`.

**Concrete fix:** Prefer `scheme.schemeDetails.palette?.swatches` (the source-of-truth list palette.ts already builds) and fall back to the map only for legacy schemes. Removes the cast and the divergent dedupe.

- [x] FIXED: Narrowed `queryRefs(root: Document)` and dropped the `getElementById ? ... : querySelector` branch — `byId` now calls `root.getElementById(id)` directly. Confirmed only `document` is ever passed (index.ts:43 and the view test both call `queryRefs(document)`).

### [low] `queryRefs` `byId` branches on `getElementById` presence to support `Document | HTMLElement`
Lines 72–81. The dual-root support (Document vs HTMLElement) exists presumably for testability, but it adds a runtime branch and a `querySelector(\`#${id}\`)` path that's subtly different (CSS-escaping). In practice the popup always passes `document`.

**Why it matters:** Mild over-generality — a flexible signature that's only ever called one way (confirm in index.ts).

**Concrete fix:** If only `document` is ever passed, narrow to `Document` and drop the branch. If tests pass a fragment, a single `root.querySelector("#"+id)` works for both (Document supports querySelector too), removing the branch.

- [x] FIXED: Removed the duplicate `refs.favoriteSave.disabled = !state.current` (kept the one near the other generate/reset disabled-state lines; deleted the second in the favorites block).

### [nit] `refs.favoriteSave.disabled` is set twice in `render` (341 and 368) with the same condition
Both `refs.favoriteSave.disabled = !state.current`. Harmless but redundant — the second is dead.

## What's GOOD
- **Clean view/controller separation.** No `chrome.*`, no reducer logic; everything flows out via `PopupHandlers` callbacks. Matches the architecture docs exactly.
- **Delegated event listeners wired once** in `bindEvents` (one listener on the favorites/history containers using `closest` + `data-*`), not per-row — the correct, leak-free pattern, and it survives the re-render churn.
- **ARIA maintained**: `aria-valuenow` on the slider, `aria-checked` on invert, `aria-expanded` on every disclosure, `aria-label` on delete buttons. This is more accessibility care than most popups show.
- **`queryRefs` throws a clear `missing popup element: #id`** instead of silently producing nulls — fail-fast and debuggable.
- **Disabled-state logic is thoughtful** (generate disabled while loading with a "Generating…" label; reset disabled unless applied-or-current; customize gated on current-or-applied).

## Top 3 concrete changes
1. **Stop full-rebuilding history/favorites/details on every `render`** — gate those sub-renders on their immutable slice changing, so an intensity drag (or any unrelated state change) doesn't destroy list DOM/focus.
2. **Extract the swatch/row DOM builders** (`makeSwatch`, `makeSwatchStrip`, `makeDetailRow`) to kill the four near-identical inline construction blocks.
3. **Use the palette's canonical `swatches`** instead of re-deriving colors from the raw scheme map with a `value as string` cast in `schemeSwatches`.
