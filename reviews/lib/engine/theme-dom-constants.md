# Review: `src/lib/engine/theme-dom-constants.ts`

**Purpose:** The single source of truth for the DOM identifiers Thememaker owns on a page — the `<style>` element ids, the root/per-element marker attribute, and the surface token attribute. Constants only, no DOM, no `chrome.*`.

**LOC:** 6 non-comment, non-blank lines. Within the ≤200 limit.

## Findings

### MEDIUM — Dead export `PICK_OVERLAY_ID` (`theme-dom-constants.ts:16-17`)
`export const PICK_OVERLAY_ID = "themeMakerPickOverlay";` has **zero usages anywhere in `src/`** (verified by grep across the whole tree, excluding its own declaration). The picker that would use a "hover-highlight overlay" id does not reference it.
**Why it matters:** It's dead code in the engine's public constant surface, and worse it implies the engine is involved in the picker overlay (it isn't — and the engine must not depend on the picker). The comment "the in-page picker's hover-highlight overlay" describes a concern that doesn't belong to the engine at all.
**Fix:** Delete lines 16-17. If the picker actually needs this id, define it in the picker's own module (or a shared `content`/`overrides` constant), not in the engine's DOM-constants file — keeping the engine free of picker concepts.

## Naming / duplication / architecture
- Remaining six constants (`STYLE_ELEMENT_ID`, `OVERRIDE_STYLE_ID`, `EARLY_STYLE_ID`, `ROOT_MARKER_ATTR`, `SURFACE_TOKEN_ATTR`) are all live and used by both engine modules and external consumers (`content/index.ts`, tests) — correctly centralized so there's no string duplication. Good.
- No `popup`/`picker` import (pure constants). Boundary respected — modulo the dead `PICK_OVERLAY_ID` *concept* noted above.

## Comment quality
- Logic-only and accurate for the live constants. The `PICK_OVERLAY_ID` comment is the only problem (documents a dead, mis-placed constant).
