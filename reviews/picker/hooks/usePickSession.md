# Review: `src/picker/hooks/usePickSession.ts`

**Purpose:** The in-page element-pick session, as one effect. While the panel is
mounted it installs capture-phase `mousemove` / `click` / `scroll` listeners and a
hover overlay that highlights the element under the cursor. Each click resolves a
`<tag>|<prop>` key + the element's current color (via `lib/overrides`) and commits
the pick through `useApplyOverrides.pick`. The panel host is excluded. Cleanup
removes every listener + the overlay.

**LOC:** 92 non-comment / non-blank — within the ≤200 limit.

## Findings

- **MEDIUM — Duplicated overlay-id literal, and the engine never excludes the overlay.**
  `usePickSession.ts:27` declares `OVERLAY_ID = "themeMakerPickOverlay"` as its own
  string literal. The engine *already* declares the identical id as
  `PICK_OVERLAY_ID` in `lib/engine/theme-dom-constants.ts:17` — but (a) that engine
  constant is referenced by **nothing** (dead in the engine), and (b) the engine's
  `isOwnElement` (`lib/engine/engine-observe.ts:24-27`) excludes only the three
  `<style>` ids, NOT the overlay. So the same string is hardcoded in two places
  with no shared source of truth, and the apparent intent (engine skips its own
  overlay during the mutation walk) was never wired up. The overlay is appended to
  `document.body` (`usePickSession.ts:59`), inside the engine's walk scope, so on a
  live edit the engine's MutationObserver *can* visit it. In practice it is benign
  (the overlay is `background: transparent`, transient, `pointer-events: none`),
  but the duplication is a real maintainability trap: rename one literal and the
  (intended) exclusion silently diverges. Concrete fix: import `PICK_OVERLAY_ID`
  from the engine constants here instead of the local literal, and add
  `el.id === PICK_OVERLAY_ID` to `isOwnElement` (or drop the now-dead engine
  constant if the exclusion is deliberately not wanted). Pick one — today the
  codebase asserts both an exclusion that does not exist and a constant that is
  never used.

- **LOW — `click` handler `preventDefault`/`stopPropagation` BEFORE the pickable check.**
  `usePickSession.ts:103-106`. A click on a non-excluded but non-pickable element
  is still fully swallowed (default prevented, propagation stopped) and then
  discarded (`!isPickable` → `return`). That is almost certainly the intended
  "while picking, the page does not navigate/click-through on any in-page element"
  behavior — but it means even un-themeable clicks are eaten silently. If a user
  expects a non-pickable element to remain interactive during pick mode, this
  surprises them. Confirm the intent; if "swallow everything while picking" is
  desired, add a one-line comment saying so (right now the ordering reads like it
  *might* be accidental). NOTE.

- **LOW — `scroll` capture listener fires on every scroll container.**
  `usePickSession.ts:117`. A capture-phase `scroll` listener on `document` catches
  scroll on any nested scrollable subtree and drops the overlay each time
  (re-drawn on the next `mousemove`). Documented and correct (viewport-rect overlay
  would otherwise strand). No throttle needed since it only does a `remove()`.
  NOTE only.

## What is good
- **Capture-phase listeners + full cleanup are correct.** All three listeners are
  added with `capture: true` (so the page can't act first) and removed with the
  exact same `capture: true` in the cleanup — listener add/remove pairs match,
  including the boolean third arg, so there is no leaked listener. The overlay is
  removed in cleanup too. This is the single most error-prone part of the file and
  it is right.
- **Listeners install once and commit through the stable `pick`** (memoized in
  `useApplyOverrides`), so the effect's `[pick]` dep doesn't churn and re-picks
  don't re-install listeners.
- **Host exclusion is correct:** `isExcluded` uses `closest('#'+PANEL_HOST_ID)`,
  so clicks/hover on the floating control (whose host carries that id) pass through
  untouched; combined with the host living on `documentElement`, the control never
  highlights or recolors itself.
- All DOM math (overlay positioning, role resolution) is delegated to inline
  geometry + the shared `lib/overrides` resolvers — no color/classifier logic
  duplicated here.
