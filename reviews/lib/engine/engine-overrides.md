# Review: `src/lib/engine/engine-overrides.ts`

**Purpose:** Builds + installs the per-tag custom override `<style id="themeMakerOverrides">` layer (emitted after the main theme so it wins). Parses `<tag>|<prop>` keys via the shared `parseOverrideKey` grammar, validates hex + tag-name safety, and emits specificity-tuned rules.

**LOC:** 54 non-comment, non-blank lines. Within the ≤200 limit.

## Findings

### LOW — Duplicated hex-validation regex instead of deferring to `lib/color` (`engine-overrides.ts:49`)
`if (!val || !/^#[0-9a-fA-F]{6}$/.test(val))` inlines a 6-digit-hex check. `lib/color` exposes `isHexColor` (`color/index.ts:46`) for exactly this. The override-roles path (`engine-roles.ts`) validates via `parseCssColor` instead, so there are now ≥2 different hex-validation idioms across the engine.
**Why it matters:** Minor duplication of color-domain logic the contract says should live in `lib/color`; also `isHexColor` may accept `#rgb` shorthand or be case-tolerant, and inlining diverges from the canonical rule.
**Fix:** `import { isHexColor } from "../color"` and use `if (!val || !isHexColor(val)) continue;` — confirm `isHexColor`'s accepted forms match the intent (6-digit only) first.

### NOTE — `head.appendChild(ovrStyle)` re-moves an existing override `<style>` every apply (`engine-overrides.ts:74-79`)
When the override style already exists, `head.appendChild(ovrStyle)` *re-appends* (moves) it to the end of `head` on each `apply()`. This is actually the intent — re-appending guarantees it stays the last sheet so it keeps winning source-order — but it's worth noting it's a deliberate move, not a no-op. The `textContent` is then overwritten wholesale. Correct.

## Correctness — verified clean
- Empty/absent overrides remove a stale layer (lines 40-45). ✔
- Tag-name safety regex `^[a-z][a-z0-9-]*$` (line 55) blocks injection via tag names before interpolating into a selector. ✔ Combined with the hex regex on `val`, both interpolated positions are validated — no CSS-injection vector found.
- `page` sentinel → `html, body`; `html`/`body` → bare tag; bg → `tag[data-thememaker]` (0,1,1); text → root-scoped + per-surface variants. Specificity story matches the comment and the engine's own rules. ✔

## Naming / duplication / architecture
- `SURFACE_KEYS` mirrors the four tinted surface tokens used in `role-classify`/`engine-surface` (`card`/`code`/`banner`/`comp`). These four string tokens now appear in three modules as literals — not a bug, but a small drift risk; a shared `const` (e.g. in `theme-dom-constants` or a surface-tokens module) would centralize them. NOTE-level.
- Defers key parsing to the shared `parseOverrides`/`parseOverrideKey` grammar in `../overrides` — correct centralization. ✔
- No `popup`/`picker` import.

## Comment quality
- Logic-only and accurate; the specificity rationale (0,1,1 vs 0,1,0 etc.) is genuinely useful. No stale paths.
