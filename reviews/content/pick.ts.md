# Review: `src/content/pick.ts`

**Purpose:** In-page element picker for the custom-theme editor. Hover overlay + capture-phase click that resolves a clicked element to a `<tag>|<background|color>` override key and reports it via `onPicked`. Runs in the content-script world.
**LOC:** 335.

## Overall grade: **C+**

The picker session machinery (overlay, capture-phase listeners, re-arm, teardown) is clean, idempotent, and well-commented. But the file's HEADER DOCUMENTATION IS FALSE — it claims to use the shared `roleOfElement`/`mapping.ts` core, and it does no such thing (no imports at all). It re-implements `isButtonLike`, `hasOwnBackground`, and `rgbToHex` inline, producing a THIRD parallel copy of logic that already exists in two other places, AND it speaks a different override grammar than `mapping.ts` does.

## Findings

### [blocker] The module docstring lies: it claims to use `roleOfElement` from `mapping.ts`, but imports nothing and uses a different scheme
Lines 12, 21–23 state: "resolves the clicked element's semantic role via the shared `roleOfElement` core" and "The classifier here is the pure-core `roleOfElement` (from `mapping.ts`)". Reality: the file has **zero `import` statements**; `roleOfElement` does not appear anywhere in the code; the override key produced (`pickKeyFor` → `<tag>|<prop>`, line 137) is a completely DIFFERENT contract from `mapping.ts`'s `overrideKeyForElement` (which returns a `keyof PaletteRoles` like `heading`/`link`). So the picker emits `p|color`, `button|background` — the tag-DSL the inject.ts override block (1389–1432) consumes — NOT role keys.

**Why it matters:** This is the most dangerous kind of finding in a public repo: documentation that actively misdescribes the architecture. An interviewer reading the comment then the code will immediately catch the contradiction. Worse, it means the carefully-built `roleOfElement`/`OVERRIDE_KEY_BY_ROLE` contract in `mapping.ts` (which I already flagged as production-dead) is dead EVEN HERE, the one place its own comments claim it's used. The "picker and engine agree on every element" guarantee (line 23) is unverified and, given the two different key grammars, likely false in edge cases.

**Concrete fix:** Pick ONE truth. Either (a) actually import and use `roleOfElement`/`overrideKeyForElement` so the picker emits role keys and `mapping.ts` becomes live — and reconcile the two override grammars into one — or (b) rewrite the docstring to describe what the code actually does (a self-contained `<tag>|<prop>` picker that shares no code with mapping.ts). Today the comment is a correctness hazard, not just stale.

### [high] Third inline re-port of `isButtonLike` / `hasOwnBackground` / `rgbToHex`
`isButtonLike` (29–45) is byte-near-identical to `inject.ts`'s `isButtonLike` (825–841). `rgbToHex` (146–162) re-derives the same rgb-parse-to-hex that `inject.ts`'s `parseColor`+`toHex` and `color.ts` already do. `hasOwnBackground` (48–69) re-implements transparency detection a fourth time.

**Why it matters:** DRY at codebase scale. This is now the THIRD copy of the color-parse + button-detect logic (canonical `color.ts`/`mapping.ts`, inline `inject.ts`, inline here). The content-script boundary is real, but `pick.ts` is a NORMAL bundled module (it CAN import) — unlike the `executeScript` payload, there is no serialization excuse here. It simply chose not to import.

**Concrete fix:** `pick.ts` is bundled like any content script, so it can `import { isHexColor, ... }` and reuse the shared button/background detection. Extract `isButtonLike`/`hasOwnBackground` into a small shared `dom-roles.ts` that the picker imports (the inject.ts payload still needs its own inline copy, but the picker has no reason to).

### [medium] `currentColorFor` falls back to `"#ffffff"`/`"#808080"` magic colors silently
Lines 184, 186, 189. Background fallback assumes white page; color fallback is mid-gray; catch returns gray. These are reasonable but undocumented-as-arbitrary, and the white-page assumption can seed a visibly wrong starting swatch on dark sites.

**Concrete fix:** Minor — name them (`ASSUMED_PAGE_BG = "#ffffff"`) and note the dark-site caveat.

### [medium] `propForElement` and `mapping.ts`'s `roleOfElement` can DISAGREE on the same element
`propForElement` (125–134) decides background-vs-color from `hasOwnBackground`/`hasDirectText`; `roleOfElement` (mapping.ts) decides surface-vs-text from `hasOwnBackground`/`buttonLike`. These overlap but aren't identical (pick.ts adds the `hasDirectText` leaf rule, mapping.ts doesn't). Since the docstring claims they're the same core, this latent disagreement is exactly the bug the false comment hides.

**Concrete fix:** Folds into the blocker — reconcile to one classifier or stop claiming they're shared.

### [low] `removeOverlay` removes the overlay twice (defensive double-remove)
Lines 263–267: `overlay?.remove()` then also `document.getElementById(OVERLAY_ID)?.remove()`. Belt-and-suspenders against a stale duplicate; harmless but signals uncertainty about overlay lifecycle ownership.

### [nit] `onClick` is a hoisted `function` while siblings are `const` arrows
Line 303 vs the arrow handlers around it. It's `function` specifically so `teardown` (292) can reference it before definition — a legitimate hoisting use, but the inconsistency reads oddly; a forward `let onClick` or reordering would be uniform.

## What's GOOD
- **The session lifecycle is genuinely clean**: capture-phase listeners, idempotent `teardown` guarded by `active`, overlay re-drawn on move and dropped on scroll (with a clear WHY comment about fixed-position stranding). This is the strong part.
- **`pointer-events:none` outline-only overlay at max z-index** is the right, non-intrusive highlight technique, and excluding the panel's own host via `isExcluded` is correctly handled.
- **`rgbToHex` returning `null` for transparent** (never `#000000`) with an explicit comment about why (avoids seeding every element of a tag black) is a real, well-reasoned edge-case fix.
- `NON_PICKABLE_TAGS` is a sensible, readable denylist.

## Top 3 concrete changes
1. **Fix or delete the false `roleOfElement`/`mapping.ts` docstring** (lines 12, 21–23). Either wire the picker to the shared core or describe the self-contained reality. This is the headline issue.
2. **Stop re-porting** `isButtonLike`/`hasOwnBackground`/`rgbToHex` — `pick.ts` is a bundled module and can import shared helpers; extract a `dom-roles.ts`.
3. **Reconcile the override-key grammar**: the picker emits `<tag>|<prop>` while `mapping.ts` defines a role-key contract. Decide which one is real and delete the other so there is one override language in the codebase.
