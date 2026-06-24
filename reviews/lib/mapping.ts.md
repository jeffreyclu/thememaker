# Review: `src/lib/mapping.ts`

**Purpose:** The PURE, unit-tested adaptive-mapping core. Takes synthetic `DetectedNode[]` + `:root` vars + palette + options and returns style decisions + the CSS string. The canonical reference the in-page `inject.ts` port is supposed to mirror.
**LOC:** 934.

## Overall grade: **B+**

This is the file `inject.ts` should aspire to be: pure, dependency-injected via fixtures, no DOM, no globals, decomposed into small well-named exported functions. It is testable and largely readable. It loses points only for being the OTHER half of the lockstep duplication (carrying real logic that is hand-copied into `inject.ts`), some honest-types escapes (`as unknown as`), and a handful of dead/over-engineered fields.

## Findings

**RESOLUTION: the entire module was DELETED.** This resolves the blocker and every finding below in one stroke — there is no `mapping.ts` to fix.

- [x] FIXED (lockstep blocker): The ENTIRE module was imported by zero non-test `src/` files — production-dead, kept green only by its own 44 tests while the SHIPPED engine (`inject.ts`) diverged freely. RE-VERIFIED with grep (only a stale comment in `pick.ts` referenced it). Chose the SIMPLEST defensible resolution (audit's option (a)): DELETED `src/lib/mapping.ts` + `tests/mapping.test.ts`. `inject.ts` is now the single standalone engine (it MUST be self-contained — `executeScript` serializes the function and can't import). The live engine stays covered by `tests/inject.test.ts` (DOM apply) + `tests/overrides.test.ts` (override layer) + 31 Playwright e2e specs — all green. No false-confidence tests left. `overrides.test.ts` imports from `inject.ts`, NOT mapping, so it survived. Recorded the reversal of the Phase 2 "two implementations in lockstep" decision in `PLAN.md`.

- [x] FIXED (consumed by deletion): `DetectedNode.area`/`luminance` vestigial fields — gone with the module.
- [x] FIXED (consumed by deletion): `applyOverridesToRoles`'s `as unknown as` round-trip — gone. This was the ONLY production-style consumer of the role-keyed override grammar; deleting it leaves a single override grammar (`<tag>|<prop>`), which is why the `RoleOverrides` type could be made honest in `types.ts` without a second `TagOverrides` type.
- [x] FIXED (consumed by deletion): `classifyVarName` byte-for-byte dup with `inject.ts` — the mapping copy is gone; `inject.ts` keeps the one shipped copy.
- [x] FIXED (consumed by deletion): three split role→color tables (`textRoleColor`/`surfaceRoleFill`/`OVERRIDE_KEY_BY_ROLE`) — gone.
- [x] FIXED (consumed by deletion): `bucketHexFromLuminance` magic-hex fallback — gone.
- [x] FIXED (consumed by deletion): `effectiveBackground` cycle-guard nit — gone.

## What's GOOD
- **Genuinely pure and testable.** No DOM, no `chrome.*`, no globals. Every decision function is a small exported pure function with fixtures — this is the model the rest of the engine should follow. 44 mapping tests pass.
- **`roleOfElement` / `overrideKeyForElement` / `OVERRIDE_KEY_BY_ROLE`** form a clean, single-source contract that the picker and engine share — the exhaustive `Record<SemanticRole, keyof PaletteRoles>` is exactly right (compiler enforces completeness).
- **The two-pass structure (`buildMapping`) is clearly delineated** with PASS 1 / PASS 2 / borders sections and strong WHY comments on the stability/SPA reasoning.
- **`classifyButton` priority ladder** (explicit signal → class → text → order) is readable and well-documented.

## Top 3 concrete changes
1. **Extract the truly-shared pure helpers** (`classifyVarName`, the color math, the role tables) into a build-inlined module so `mapping.ts` and `inject.ts` stop carrying parallel copies — start with `classifyVarName` as the proof-of-concept.
2. **Tighten the override types**: change `RoleOverrides` (types.ts) to key on `keyof PaletteRoles` and delete the two `as unknown as` casts in `applyOverridesToRoles`.
3. **Mark or remove the vestigial fields/exports**: `DetectedNode.area`, make `luminance` optional, and label `buildMapping`/`decisionToCss`/`varsToCss`/`effectiveBackground` as canonical-reference (test-only-in-production) so readers know they aren't the shipped path.
