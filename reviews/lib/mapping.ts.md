# Review: `src/lib/mapping.ts`

**Purpose:** The PURE, unit-tested adaptive-mapping core. Takes synthetic `DetectedNode[]` + `:root` vars + palette + options and returns style decisions + the CSS string. The canonical reference the in-page `inject.ts` port is supposed to mirror.
**LOC:** 934.

## Overall grade: **B+**

This is the file `inject.ts` should aspire to be: pure, dependency-injected via fixtures, no DOM, no globals, decomposed into small well-named exported functions. It is testable and largely readable. It loses points only for being the OTHER half of the lockstep duplication (carrying real logic that is hand-copied into `inject.ts`), some honest-types escapes (`as unknown as`), and a handful of dead/over-engineered fields.

## Findings

### [blocker] The ENTIRE module is imported by zero non-test `src/` files — it is production-dead, exercised only by tests
I verified with grep: **no file under `src/` imports anything from `mapping.ts`**. The in-page engine (`inject.ts`) re-implements the whole two-pass algorithm inline; the picker (`pick.ts`) has NO import statements at all yet its comments *claim* to call `roleOfElement` "from mapping.ts" (a comment-vs-code drift I'll confirm in the pick.ts review — the classifier appears to be re-ported there too). So `mapping.ts` ships in no runtime path: 934 lines of carefully-tested logic that nothing in production calls.

**Why it matters:** This is the sharpest possible statement of the lockstep hazard. The "canonical, unit-tested reference" is a parallel universe: it can be green forever while the two SHIPPED copies (`inject.ts`'s inline port and, apparently, `pick.ts`'s inline classifier) drift arbitrarily. The 44 mapping tests give false confidence — they test code that never runs for a user. A reader/interviewer will reasonably ask "if nothing imports this, what is it protecting?" and the honest answer today is "developer discipline."

**Concrete fix:** Make the canonical core the ACTUALLY-shipped core. Extract the pure pieces (`buildMapping` is mostly pure already; the color math and `classifyVarName`/role tables are fully pure) into a module the build INLINES into the `executeScript` payload, so `inject.ts` calls `buildMapping` instead of re-deriving it, and `pick.ts` imports `roleOfElement` instead of re-porting it. If the serialization boundary genuinely forbids that (it should be tested, not assumed — see the classifyVarName finding), then at minimum add a cross-implementation equivalence test so the canonical and the shipped port are mechanically pinned together. Until one of those exists, the value of this module is aspirational.

### [medium] `DetectedNode` carries fields that are documented as no-longer-used
`area` (line 129): comment says "the blend model no longer gates surfaces by area (every surface is repainted)". `luminance` (123) is required but, with the role-based mapping, surfaces no longer bucket by luminance — only `bucketHexFromLuminance` (591) uses it, as a *fallback* when `bgColor` is absent. So the interface advertises an input that the algorithm has largely abandoned.

**Why it matters:** Honest types / dead surface. Required fields that the algorithm ignores mislead every test author and the port maintainer ("do I need to compute area in the walk? — no, but the type says yes").

**Concrete fix:** Make `area` optional-and-deprecated or remove it; demote `luminance` to optional (`luminance?: number`) since it is now only a fallback seed. The walk in `inject.ts` does not even produce a `DetectedNode` anymore, confirming these are vestigial.

### [medium] `applyOverridesToRoles` uses `as unknown as Record<string,string>` round-trip
Lines 448–454. `const next = { ...roles } as unknown as Record<string, string>; ... return next as unknown as PaletteRoles;`. The double `as unknown as` defeats the type system to mutate by string key.

**Why it matters:** Honest types. `PaletteRoles` is a known fixed-key interface; iterating `Object.entries(overrides)` and assigning to arbitrary string keys is exactly the unsoundness `RoleOverrides = Record<string,string>` invites (see types.ts review). If an override key is `"bg"` it lands in roles; if it's `"p|color"` it silently does nothing here (the OTHER override grammar — the tag DSL — lives only in inject.ts).

**Concrete fix:** Constrain the override key type to `keyof PaletteRoles`, then `if (key in roles)` narrows cleanly and the cast disappears. The loose `Record<string,string>` should be tightened at the type (types.ts) so this and the inject-side both benefit.

### [medium] `classifyVarName` here and the inline copy in `inject.ts` (552–568) are byte-for-byte duplicates
The three regexes and the function body are identical between `mapping.ts:492-506` and `inject.ts:552-568`. This is the cleanest, most mechanically-extractable piece of the duplication and there is no excuse for it being copied: it is a pure string→string|null function with zero DOM/closure dependency.

**Why it matters:** DRY. If `classifyVarName` is the easiest thing to share and it's STILL copied, the "we can't import across the boundary" justification is weaker than claimed — a bundler will happily inline a referenced pure top-level function into the serialized payload string.

**Concrete fix:** Prove the bundler inlines it: import `classifyVarName` into the page func and check the built service-worker chunk. If it inlines (likely), delete the copy. This single extraction would test the whole "we must duplicate everything" premise.

### [low] `OVERRIDE_KEY_BY_ROLE` maps `subheading → accent` but `textRoleColor` maps `subheading → accent` too while `surfaceRoleFill` never handles `subheading` — role tables split across 3 functions
`textRoleColor` (464), `surfaceRoleFill` (609), and `OVERRIDE_KEY_BY_ROLE` (410) are three separate role→color tables. They must stay consistent (a heading's display color, its override target, and its surface fill all reference the palette) but nothing enforces it. It is easy to add a `SemanticRole` and update two of the three.

**Why it matters:** Open/closed — adding a role touches three switch/maps with no exhaustiveness link between them.

**Concrete fix:** `OVERRIDE_KEY_BY_ROLE` is already a `Record<SemanticRole, ...>` (exhaustive — good, the compiler catches a missing role there). Make `textRoleColor` and `surfaceRoleFill` also `Record<SemanticRole, ...>`-typed (or add a `default: never` exhaustiveness check) so adding a role forces all three to update.

### [low] `bucketHexFromLuminance` (591) is a 3-way magic-hex synthesizer used only as a fallback seed
Returns `#1a1a1a`/`#808080`/`#f0f0f0`. Only reached when a surface node has no `bgColor`. With role-based mapping this path barely runs. Minor dead-ish weight.

### [nit] `guard < nodes.length + 1` cycle-guard in `effectiveBackground` (712)
A defensive infinite-loop guard against a malformed `parent` chain. Correct and cheap, but it guards against fixture/port bugs that the type system can't express — fine to keep, worth a one-word "cycle guard" label (it has none).

## What's GOOD
- **Genuinely pure and testable.** No DOM, no `chrome.*`, no globals. Every decision function is a small exported pure function with fixtures — this is the model the rest of the engine should follow. 44 mapping tests pass.
- **`roleOfElement` / `overrideKeyForElement` / `OVERRIDE_KEY_BY_ROLE`** form a clean, single-source contract that the picker and engine share — the exhaustive `Record<SemanticRole, keyof PaletteRoles>` is exactly right (compiler enforces completeness).
- **The two-pass structure (`buildMapping`) is clearly delineated** with PASS 1 / PASS 2 / borders sections and strong WHY comments on the stability/SPA reasoning.
- **`classifyButton` priority ladder** (explicit signal → class → text → order) is readable and well-documented.

## Top 3 concrete changes
1. **Extract the truly-shared pure helpers** (`classifyVarName`, the color math, the role tables) into a build-inlined module so `mapping.ts` and `inject.ts` stop carrying parallel copies — start with `classifyVarName` as the proof-of-concept.
2. **Tighten the override types**: change `RoleOverrides` (types.ts) to key on `keyof PaletteRoles` and delete the two `as unknown as` casts in `applyOverridesToRoles`.
3. **Mark or remove the vestigial fields/exports**: `DetectedNode.area`, make `luminance` optional, and label `buildMapping`/`decisionToCss`/`varsToCss`/`effectiveBackground` as canonical-reference (test-only-in-production) so readers know they aren't the shipped path.
