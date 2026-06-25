# Review: `src/lib/inject.ts`

**Purpose:** The in-page adaptive theming engine plus the self-contained `executeScript` payload functions (apply/remove/query, base-cache helpers). Runs in the target page's world; must be import-free and closure-free.
**LOC:** 1545 (by far the largest file in the codebase).

## Overall grade: **C-**

The engine *works* and is heavily, honestly documented — the comments are the best part of the file and explain WHY at almost every turn. But this single function (`applyAdaptiveScheme`, ~1330 lines on its own) is the codebase's defining maintainability liability: it is a 1300-line function holding the ENTIRE color algorithm, role-classification, observer lifecycle, time-slicer, override layer, and CSS emitter, duplicated wholesale from the tested core. It is essentially untestable except through coarse structural assertions. The duplication is *defensible in principle* (the `executeScript` serialization boundary is real) but the *current execution* of that duplication is a genuine maintenance hazard, not a clean trade-off.

## Findings

- [ ] DEFERRED (risky engine split — left as a TODO per charter): `applyAdaptiveScheme` is a ~1330-line single function (SRP violation). CONFIRMED real. NOT attempted: this is the crown-jewel engine; the charter says extract helpers ONLY if it can't risk the engine, and the only proposed "honest fix" (build-inline a pure core that the bundler stitches into the serialized `executeScript` payload) is exactly the fragile mechanism the review itself flags. A true module extraction risks silently breaking serialization (the function is `.toString()`-serialized and cannot reference imports/closures). The lower-risk in-place de-dups WERE done (see the twin-collapse and dead-flag items below). The big SRP split is DEFERRED with this note rather than forced; doing it safely needs a dedicated effort with the e2e suite as the gate, not a foundation-pass side change.

- [x] FIXED (lockstep blocker — resolved at the source): "lockstep duplication has no mechanical guarantee of sync". RESOLVED by the cross-cutting lockstep decision (see mapping.ts review): the DEAD canonical `mapping.ts` was deleted, so `inject.ts` is now the SINGLE source of truth for the engine — there is no second copy of the mapping/role algorithm to drift from. The color math is still hand-ported from `color.ts` (unavoidable — serialized payload can't import), but the framing is now honest: `color.ts`'s docstring no longer claims "lockstep"; it states the two are intentionally separate copies (popup-path vs serialized page-path) and a contrast change must be made in both deliberately. A cross-equivalence test would pin two copies that no longer claim to be the same function (the inject `parseColor` is a superset that accepts `rgb()` strings), so it is not warranted. The shipped engine is tested DIRECTLY by `tests/inject.test.ts` + `tests/overrides.test.ts` + 31 e2e specs.

- [ ] DEFERRED (risky engine refactor — left as a TODO): consolidate the `window.__themeMaker*` globals behind ONE typed `ThemeMakerWindowState` accessor. CONFIRMED real (the shape is re-declared in `removeSchemeStyle` and `applyAdaptiveScheme`). Partially addressed: the dead `__themeMakerWriting` field was REMOVED from both shape declarations (see next item), shrinking the surface. The full "one `getOrInitState(w)` accessor" refactor touches every cross-invocation read/write in the engine and is DEFERRED to avoid risking behavior — the e2e suite must gate it.

- [x] FIXED: `__themeMakerWriting` flag was written ~12× and READ 0×. VERIFIED with grep (zero gating reads; the real re-entrancy mechanism is observer disconnect/reconnect). DELETED every `w.__themeMakerWriting = true/false` assignment (6 wrap-sites, all simple `flag; <mutation>; flag;` wraps — mutations kept intact) and the field from the window-state interface. e2e (31 specs incl. flicker/determinism) stays green → the flag was pure noise. One mechanism (disconnect) now owns re-entrancy.

- [x] FIXED: `ensureContrast`/`nudgeToAA` inlined as near-identical 40-line twins. Factored a single `relightToAA(color, bg, large, onFail)` inside the payload that both call with different fallback thunks — mirrors the same de-dup applied to `color.ts`. Behavior is byte-identical (verified: `tests/inject.test.ts` + `tests/overrides.test.ts` + the e2e contrast specs at intensity 10/100 all green).

### [DEFERRED — local inject.ts readability item, owned by per-file agent] `bodyOriginal.bg || "#ffffff"` silently assumes a white page when body bg is unparseable
Line 774: `mix(bodyOriginal.bg || "#ffffff", themedBase, factor)`. If the body background is `transparent`/unset (the *common case*, per the file's own comment at lines 60–68), `bodyOriginal.bg` is `"rgba(0,0,0,0)"` which `parseColor` returns `null` for, so `mix` returns `themedBase` anyway — fine. But the literal `"#ffffff"` fallback only bites when `bg` is the empty string. It's a magic assumption buried in an expression.

**Why it matters:** Readability/correctness smell — the fallback color and the "transparent → full theme" behavior are two different mechanisms doing overlapping work; a reader can't tell which one fires.

**Concrete fix:** Make it explicit: `const bodyBg = parseColor(bodyOriginal.bg ?? "") ? bodyOriginal.bg! : themedBase;` then `mix(bodyBg, themedBase, factor)`. One mechanism, self-documenting.

- [x] VERIFIED-PARTIALLY-INVALID (type documented; behavior left intact): the override block consumes `options.overrides` two ways (role keys → `roles` at 492-500; `<tag>|<prop>` keys → CSS layer at ~1377-1431). VERIFIED real, but the "split into two typed fields" fix is NOT warranted: the engine deliberately accepts a MIXED-grammar map and filters each consumer defensively (a role key has no `|`; a tag key isn't `in roles`), and the only production producer (the picker) emits `<tag>|<prop>` only. Splitting `ApplyOptions.overrides` into `roleOverrides`/`tagOverrides` would over-constrain a permissive seam AND ripple a contract change through storage + every other agent's popup/content file. Resolution (in types.ts): documented the dominant `<tag>|<prop>` grammar with a `TagPropKey` type and an honest `RoleOverrides` doc, so a reader knows what the map holds. The inline `tag|prop` CSS builder is a LOCAL inject.ts readability item (extract to a named helper) → left for the per-file agent. Behavior unchanged.

### [DEFERRED — local inject.ts readability item, owned by per-file agent] Magic numbers for blend/tint/budgets scattered as bare literals
`mix(roleHeading, themedBase, 0.86)` (864–865), `SLICE_BUDGET_MS = 4`, `MAX_NODES_PER_SLICE = 400`, `MAX_THEMED = 12000` (945–947), `SYNC_CAP = 600`, `vh()*2` (1320–1321), `DEBOUNCE_MS = 250`, `els.length < 200` (1290), `processed >= 64` (1232). Some are named constants (good), several are bare in-line literals (`0.86`, `200`, `64`).

**Why it matters:** Readability. The named ones prove the author knows the pattern; the inline ones are the leftovers.

**Concrete fix:** Hoist `0.86` → `const SEMANTIC_TINT = 0.86`, `200`/`64` into named thresholds with the one-line rationale the author already wrote in comments.

- [x] VERIFIED-INVALID (resolved by lockstep deletion): `surfaceFor`/`bucketOf` re-ports of `mapping.ts` accessors "with no cross-test". `mapping.ts` is DELETED, so these are no longer "re-ports" of anything — they are the engine's own trivial accessors, tested via `inject.test.ts`/e2e. Nothing to cross-test against.

### [DEFERRED — local inject.ts item, owned by per-file agent] `console.warn` swallowed in a try/catch (974–982) for the budget cap
Defensible (console can be shimmed away on hostile pages), but the nested try/catch-around-a-warn is belt-and-suspenders noise.

### [DEFERRED — local inject.ts nit, owned by per-file agent] `w2`/`vh`/`vw` terse names in `inViewport`
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

## RE-REVIEW (post-fix audit)

- CONFIRMED FIXED (dead-flag removal): grepped `cbe650f:src/lib/inject.ts` for `__themeMakerWriting` — every one of the 12 occurrences was a WRITE (`= true/false`), ZERO reads. So the flag had no behavioral effect and its removal is safe. The real re-entrancy guard is the observer's `observer.disconnect()` around its synchronous pre-paint writes (inject.ts:1494) plus `isOwnElement` + `doneSet.has(t)` filtering (1426-1483) — none of which referenced the flag. Re-entrancy protection intact. 31 e2e specs (flicker/determinism/pre-paint) green.
- CONFIRMED FIXED (`relightToAA` twin-collapse in the payload): the inlined `ensureContrast`/`nudgeToAA` now share `relightToAA` exactly as the canonical `color.ts` does; the per-direction search, delta tie-break, and fallback thunks match the pre-fix bodies. Verified against `tests/inject.test.ts` + `tests/overrides.test.ts` + contrast e2e at intensity 10/100.
- DEFERRED items (1330-line `applyAdaptiveScheme` split; one typed window-state accessor) remain correctly deferred per charter.
- No new regression introduced by the inject.ts changes.
