# Review: `src/lib/inject.ts`

**Purpose:** The in-page adaptive theming engine plus the self-contained `executeScript` payload functions (apply/remove/query, base-cache helpers). Runs in the target page's world; must be import-free and closure-free.
**LOC:** 1545 (by far the largest file in the codebase).

## Overall grade: **C-**

The engine *works* and is heavily, honestly documented — the comments are the best part of the file and explain WHY at almost every turn. But this single function (`applyAdaptiveScheme`, ~1330 lines on its own) is the codebase's defining maintainability liability: it is a 1300-line function holding the ENTIRE color algorithm, role-classification, observer lifecycle, time-slicer, override layer, and CSS emitter, duplicated wholesale from the tested core. It is essentially untestable except through coarse structural assertions. The duplication is *defensible in principle* (the `executeScript` serialization boundary is real) but the *current execution* of that duplication is a genuine maintenance hazard, not a clean trade-off.

## Findings

### [blocker] `applyAdaptiveScheme` is a ~1330-line single function — an extreme SRP violation
Lines 212–1545. One function declares ~50 nested helpers and does: color math (parse/hsl/contrast/nudge/mix), `:root` var detection, var remapping, frozen-original WeakMap state, button ordering, semantic surface classification, role-text CSS emission, time-sliced DOM walk, viewport prioritization, override-layer emission, AND MutationObserver lifecycle. This is the single biggest readability/maintainability problem in the repo. You cannot unit-test any piece in isolation; you cannot read it without scrolling through five distinct concerns.

**Why it matters:** SRP, testability, readability, reviewability. A reviewer (or interviewer) cannot reason about a 1330-line function. A bug in `classifyButton` can only be exercised by booting the whole engine against a DOM.

**Concrete fix:** The `executeScript` constraint forbids *imports*, not *internal structure*. Split the body into clearly delimited self-contained sub-functions DECLARED at the top of the function (still inlined, still serialized) — `const colorMath = () => {...}`, `const detectVars = (...) => {...}`, `const buildRoleRules = (...) => {...}`, `const makeObserver = (...) => {...}`. Even better: most of these helpers (color math, classification, role-rule building) are PURE and do not touch the closure — extract them to a `injectable-core.ts` module that `inject.ts` imports at BUILD time. The serialization concern is about runtime closures; a bundler inlines pure imported helpers into the serialized string IF they are referenced lexically inside the function — but that is fragile. The honest fix is: extract the pure math/classification into a string-templated or build-inlined module and unit-test it directly, so `inject.ts` shrinks to orchestration.

### [blocker] The "lockstep" duplication is real duplication with NO mechanical guarantee of sync
Lines 219–444 re-implement `parseColor`, `toHex`, `rgbToHsl`, `hslToHex`, `linearize`, `lumOfRgb`, `contrast`, `ensureContrast`, `nudgeToAA`, `bucketOf` — every one a hand-copied port of `color.ts` (lines 24–327). The two are kept in sync ONLY by a comment ("keep in lockstep") and developer discipline.

I verified the ports are *currently* faithful, but I also found a **latent divergence**: `inject.ts`'s `parseColor` accepts `rgb()/rgba()` strings (lines 250–259, necessary — it reads `getComputedStyle`), while `color.ts`'s `hexToRgb` does NOT. So the two are already NOT the same function — the port has a superset behavior. That is correct for its job, but it proves the "lockstep" framing is a fiction: they are different functions that happen to agree on hex inputs. There is no test that feeds the same inputs to both and asserts equal outputs.

**Why it matters:** DRY, correctness drift. The PLAN.md decision explicitly accepts this duplication, but accepting a hazard does not make it cheap. The next person who fixes a contrast bug in `color.ts` has no compiler/test forcing them to also fix it in the 200-line inlined copy.

**Concrete fix:** Add a **lockstep test** that imports both: feed a fixed grid of (text, bg, large) triples to `color.ts`'s `nudgeToAA`/`ensureContrast` and to an *extracted* copy of the inject port, asserting identical output. To extract the port testably without breaking serialization, move the pure math into its own module and have the build inline it (CRXJS/Vite supports `?raw` or a string-concat composition). Today there is `tests/inject.test.ts` but it asserts structural invariants on emitted CSS, not equivalence to the canonical math. The duplication should be mechanically enforced or eliminated; a comment is not enforcement.

### [high] Heavy reliance on `window as unknown as {...}` global mutable state (8+ ad-hoc globals)
Lines 151–159, 691–704, plus scattered writes to `w.__themeMakerObserver/Args/NextId/Writing/Originals/Done/ThemedCount/Capped`. The engine's entire cross-invocation state lives in untyped, stringly-keyed globals on `window`, cast through `unknown`. `removeSchemeStyle` (149) and `applyAdaptiveScheme` (212) each re-declare the SAME shape independently — a third DRY violation, and they can drift (e.g. `removeSchemeStyle` clears `__themeMakerWriting`? No — it does NOT, see below).

**Why it matters:** Immutability/honest-types/FP. This is the opposite of side-effect isolation: global mutable state with no single typed owner. `__themeMakerWriting` is set/unset across ~10 call sites as a manual re-entrancy guard — a classic footgun (if any throw happens between set-true and set-false, it stays true forever).

**Concrete fix:** Define one `interface ThemeMakerWindowState` once (even inline) and a single `const state = getOrInitState(w)` accessor. Replace the `__themeMakerWriting` flag pattern with the existing disconnect/reconnect discipline (the observer is already disconnected during writes in `drainQueue`/the observer callback — the flag is largely redundant defense; see next finding).

### [high] `__themeMakerWriting` flag is set but apparently never READ
Grep the file: `__themeMakerWriting` is assigned `true`/`false` at ~10 sites (1014, 1027, 1117, 1124, 1139, 1392, etc.) but I find no read of it that gates behavior — the observer callback dedupes via `doneSet`/`isOwnElement`/`recaptured` and disconnects around writes, not via this flag. `removeSchemeStyle` does not even clear it.

**Why it matters:** Dead code / speculative defense. If a flag is written everywhere and read nowhere, it is pure noise that obscures the real re-entrancy strategy (disconnect/reconnect) and invites the reader to hunt for a guard that does nothing.

**Concrete fix:** Confirm with a grep across the bundle, then DELETE every `w.__themeMakerWriting = ...` assignment. If it *is* read somewhere I missed, document the read site next to the writes. Either way, one mechanism (disconnect) should own re-entrancy, not two.

### [high] `ensureContrast` and `nudgeToAA` are inlined as near-identical 40-line twins
Lines 348–433. Within this one function, `ensureContrast` (348) and `nudgeToAA` (395) share ~90% of their body — same `search` closure, same darker/lighter tie-break — differing only in the final fallback. This duplicates the *same* duplication that already exists in `color.ts` (which has the same two near-twins). So the pattern is copied twice over.

**Why it matters:** DRY, within a single function this time.

**Concrete fix:** Factor a single `relightToAA(color, bg, target, fallback)` helper that both call with different `fallback` thunks. Do it in `color.ts` first (the canonical), then mirror.

### [medium] `bodyOriginal.bg || "#ffffff"` silently assumes a white page when body bg is unparseable
Line 774: `mix(bodyOriginal.bg || "#ffffff", themedBase, factor)`. If the body background is `transparent`/unset (the *common case*, per the file's own comment at lines 60–68), `bodyOriginal.bg` is `"rgba(0,0,0,0)"` which `parseColor` returns `null` for, so `mix` returns `themedBase` anyway — fine. But the literal `"#ffffff"` fallback only bites when `bg` is the empty string. It's a magic assumption buried in an expression.

**Why it matters:** Readability/correctness smell — the fallback color and the "transparent → full theme" behavior are two different mechanisms doing overlapping work; a reader can't tell which one fires.

**Concrete fix:** Make it explicit: `const bodyBg = parseColor(bodyOriginal.bg ?? "") ? bodyOriginal.bg! : themedBase;` then `mix(bodyBg, themedBase, factor)`. One mechanism, self-documenting.

### [medium] The override-emission block (1379–1433) parses a `tag|prop` mini-DSL inline and overlaps the role logic in `RoleOverrides`
Two override systems coexist: (1) `options.overrides` as `role → hex` applied to `roles` at lines 492–500, and (2) the SAME `options.overrides` re-interpreted as a `tag|prop → hex` CSS mini-language at 1389–1432. The same map is consumed two completely different ways in the same function, with two different key grammars (`bg`/`heading` role keys vs `p|color`/`page` tag keys). This is genuinely confusing — a reader cannot tell what shape `overrides` actually is.

**Why it matters:** Honest types / interface segregation. `RoleOverrides = Record<string,string>` (types.ts) is too loose to express that some keys are roles and some are `tag|prop`. The two consumers will fight (does `bg` mean the `bg` role or a `<bg>` tag?).

**Concrete fix:** Split into two typed fields on `ApplyOptions` — `roleOverrides: Partial<Record<PaletteRoleKey,string>>` and `tagOverrides: Record<string, string>` — or at minimum document the disjoint key namespaces at the type. Move the `tag|prop` CSS builder into its own named helper.

### [medium] Magic numbers for blend/tint/budgets scattered as bare literals
`mix(roleHeading, themedBase, 0.86)` (864–865), `SLICE_BUDGET_MS = 4`, `MAX_NODES_PER_SLICE = 400`, `MAX_THEMED = 12000` (945–947), `SYNC_CAP = 600`, `vh()*2` (1320–1321), `DEBOUNCE_MS = 250`, `els.length < 200` (1290), `processed >= 64` (1232). Some are named constants (good), several are bare in-line literals (`0.86`, `200`, `64`).

**Why it matters:** Readability. The named ones prove the author knows the pattern; the inline ones are the leftovers.

**Concrete fix:** Hoist `0.86` → `const SEMANTIC_TINT = 0.86`, `200`/`64` into named thresholds with the one-line rationale the author already wrote in comments.

### [low] `surfaceFor`/`bucketOf` etc. are silent re-ports of `mapping.ts` accessors with no cross-test
Lines 446–463 re-implement `surfaceForBucket`/`borderSeed` from `mapping.ts`. Same lockstep concern as the color math, lower severity because the logic is trivial.

### [low] `console.warn` swallowed in a try/catch (974–982) for the budget cap
Defensible (console can be shimmed away on hostile pages), but the nested try/catch-around-a-warn is belt-and-suspenders noise.

### [nit] `w2`/`vh`/`vw` terse names in `inViewport` (1262–1283)
Fine locally, but `w2` exists only to dodge the outer `w` (the window-state alias). The collision is a symptom of the global-state aliasing.

## What's GOOD
- **The comments are genuinely excellent** — they explain WHY (SPA recycling, specificity math, microtask-before-paint timing, flash elimination) at a level most codebases never reach. This is the file's saving grace and is interview-defensible on its own.
- **The frozen-original WeakMap + role-as-pure-function-of-structure design** (TRACK 1/TRACK 2, lines 16–31) is a legitimately clever, correct solution to the SPA-recycling flicker problem, and the rationale is documented.
- **Time-slicing with `requestIdleCallback` + viewport prioritization + a hard `MAX_THEMED` cap** is responsible engineering for a content engine that runs on arbitrary pages.
- The small payload helpers (`applySchemeStyle`, `removeSchemeStyle`, `isSchemeApplied`, `readBaseCache`/`writeBaseCache`/`clearBaseCache`) are clean, single-purpose, and correctly defensive about `localStorage`.
- `baseBackgroundFor` is pure and importable — the right call for the early-paint path.

## Top 3 concrete changes
1. **Break `applyAdaptiveScheme` apart.** Extract the pure color math + role classification + role-rule builder into a separately unit-tested module and have the build inline it (or at minimum into clearly-named self-contained inner functions). The function must stop being 1330 lines.
2. **Make "lockstep" mechanical, not aspirational.** Add a test that feeds identical inputs to `color.ts` and an extracted copy of the inject port and asserts equal output. A comment is not a guarantee; a CI assertion is.
3. **Consolidate the `window.__themeMaker*` global state behind one typed accessor and delete the dead `__themeMakerWriting` flag**, letting disconnect/reconnect be the single re-entrancy mechanism.
