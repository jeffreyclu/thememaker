# Review: src/lib/color/css-var-remap.ts

**LOC**: 147 (non-comment). Under 200.

`:root`/`html` CSS custom-property detection + remap toward the theme. Logic itself is sound (best-effort cross-origin skipping, AA-floor against lightest rendered surface). The problem is *where it lives*.

## Findings

- **High** — misplaced module / `color` DOM-free contract violation. `detectRootVars` (lines 49-99) calls `getComputedStyle(document.documentElement)` and walks `document.styleSheets`. Its sibling `index.ts:5` declares the `color` module "Nothing here touches the DOM," and `css-color.ts:16` reiterates "No DOM." This file silently breaks that module-wide invariant — it is the *only* DOM-touching file under `color/`. Verified: `grep getComputedStyle/document.` across `color/` matches only this file (the css-color.ts hit is a comment). Fix: move `css-var-remap.ts` into `src/lib/engine/` (where `getComputedStyle` already lives, e.g. engine-surface/walk) and keep `color/` purely computational. It is imported by exactly one consumer (`engine-apply.ts`), so the move is low-risk.

- **High** — layering inversion (circular direction). Line 15 imports `ResolvedRoles` from `../engine/engine-roles`, while the engine imports *from* `color` (engine-roles, role-rules, engine-apply, engine-surface all `from "../color"`). So `color → engine → color`. `color` is the lower/foundational layer and must not depend up into `engine`. Moving this file into `engine/` (see above) resolves both findings at once: the DOM + the engine type both belong on the engine side.

- **Low** — `buildVarDecls` text-var seed selection (lines 173-180) duplicates name-substring matching (`heading|title`, `link|anchor`, etc.) that conceptually overlaps `classifyVarName` (lines 25-41); the two name-classification schemes can drift. Note only.

Net: the code works, but it does not belong in `color`. Recommend relocating to `engine/` and recording it as the intended home. This is a blocker for the "color is DOM-free / foundational" contract, hence High.
