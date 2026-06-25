# Refactor plan — `src/lib/inject.ts`

**Non-comment LOC: 1057** — measured (block comments, `//`, JSDoc `*`, blanks excluded). The file is 1542 raw lines; ~485 are comments/docstrings (excellent comments, the file's saving grace).
**Verdict vs ≤200 directive: FAIL — by 5×. The single worst offender in the codebase.**

The damage is concentrated in ONE function: **`applyAdaptiveScheme` is ~820 non-comment LOC by itself** (lines 218–1541). It holds: the inlined color math, CSS-var detection + remap, semantic surface classification, role-text rule emission, the per-element surface painter, the time-sliced walk + scheduler, the MutationObserver wiring, and the `<tag>|<prop>` override layer — all in one closure. Everything else in the file (the payload helpers + `baseBackgroundFor` + base-cache helpers) is clean and small.

---

## The root cause and the fix (read `reviews/refactor/PLAN.md` §2 first)

The duplication and the giant function both exist for ONE reason: `applyAdaptiveScheme` is shipped to the page via `chrome.scripting.executeScript({ func })`, which serializes it with `func.toString()`. A serialized function cannot `import` and cannot close over module scope, so **every helper it uses must be declared inside its own body** — forcing the color port and every classifier inline, and forcing one mega-closure.

**Delete the executeScript boundary** (PLAN §2: route APPLY/RESET/QUERY through the already-bundled, already-`applyAdaptiveScheme`-importing content script via `chrome.tabs.sendMessage`). Once apply travels the content-message channel, `inject.ts` is **ordinary bundled code**. Then:
- the inline color port is **DELETED** and imported from `lib/color.ts` + a thin `lib/color-runtime.ts` (D1);
- the mega-closure is decomposed into named, importable, individually-tested modules;
- the file-level "MUST be self-contained, NO imports" docstring contract is retired.

This is the prerequisite. Attempting the split WITHOUT it (the prior review pass's situation — see `reviews/lib/inject.ts.md`, which DEFERRED the split precisely because serialization made it unsafe) leaves you extracting into inner functions only, which doesn't reduce file LOC and keeps the port. The prior pass did not consider the content-message route; this plan's whole premise is that route.

---

## Target module breakdown (8 focused files, each ≤200)

All "engine-internal" modules below are pure-ish functions over `(palette, options, document)`-derived inputs — importable and unit-testable in isolation once serialization is gone.

| New file | Responsibility | Moves from `inject.ts` | Target LOC |
|---|---|---:|---:|
| **`src/lib/inject.ts`** (kept, slimmed) | The payload/DOM helpers (`applySchemeStyle`, `removeSchemeStyle`, `isSchemeApplied`, `baseBackgroundFor`, `readBaseCache`/`writeBaseCache`/`clearBaseCache`) + the thin `applyAdaptiveScheme` **orchestrator** that wires the modules below. Exports stay identical (test + content-script imports unchanged). | the orchestration spine + the existing small helpers | ~150 |
| **`src/lib/color-runtime.ts`** | The runtime color helpers `color.ts` doesn't expose: `parseCssColor` (handles `rgb()`/`rgba()`/named/`transparent` → rgb+alpha, not just hex), `cssColorToHex`, `alphaOf`, `withAlpha`. Thin wrappers that delegate the math to `color.ts`. Resolves **D1 + D3** (pick.ts's `rgbToHex` imports `cssColorToHex` too). | `parseColor`, `toHex`, `alphaOf`, `withAlpha`, `mix` (re-export `mixHex`) | ~80 |
| **`src/lib/role-classify.ts`** | Surface/element classification: `isButtonLike` (shared with pick — **D2**), `classifyButton`, `isSkippable`, `isEditableRoot`, `hasImageBackground`, the `*_TAGS` sets, `surfaceFillFor`, `buttonOrder` builder. Pure decisions over an element + palette roles. | lines ~794–916, 828–863, 917–941 | ~150 |
| **`src/lib/css-var-remap.ts`** | `:root`/`html` CSS custom-property detection + remap: `classifyVarName`, the styleSheets walk (`collectFromRule`), `variableDriven` decision, and the `varDecls` builder (surface/text/border remap + floor-surface logic). | lines 556–684 | ~140 |
| **`src/lib/role-rules.ts`** | The ROOT-scoped role-text CSS emitter: `roleRulesFor`, `harderRef`, the page-level + per-`data-tm-surf` rule generation, `SURFACE_ROLE_BG`. Pure string building from resolved role colors. | lines 1052–1113 | ~110 |
| **`src/lib/override-layer.ts`** | The `<tag>\|<prop>` override `<style id="themeMakerOverrides">` builder. Consumes `lib/override-grammar.ts` (**D4**) for key parsing/validation; emits the CSS rules. | lines 1377–1429 | ~80 |
| **`src/lib/engine-state.ts`** | The `window.__themeMaker*` state: one typed `EngineWindow` shape + `getOrInitEngineState(w)` accessor (frozen-originals WeakMap, doneSet, counters, nextId, observer handle). Used by orchestrator + observer + scheduler so the shape is declared ONCE (today it's re-declared in `removeSchemeStyle` and `applyAdaptiveScheme`). | the two `w` interface decls + init blocks (155–164, 695–734) | ~70 |
| **`src/lib/engine-walk.ts`** | The time-sliced surface painter + scheduler + observer: `processElement`, `expand`, `enqueue`, `drainQueue`, `yieldThen`, `inViewport`/`vh`/`vw`, `processNowInViewport`, the `MutationObserver` callback + debounce (`flush`/`schedule`), `OBSERVE_OPTS`, budgets. This is the largest remaining concern; if it exceeds 200, split into `engine-walk.ts` (painter + time-slicer) and `engine-observer.ts` (observer + pre-paint + debounce). | lines 943–1041, 1145–1375, 1431–1538 | ~190 (or 2×~110) |

Result: `inject.ts` itself drops from 1057 → ~150 non-comment LOC; the heaviest new module is `engine-walk.ts` at ~190 (splittable if needed). **All ≤200.**

> Naming note: the pre-existing `reviews/lib/mapping.ts.md` and `reviews/lib/theme-engine.ts.md` are stubs from a prior planning pass for modules that were never created (`mapping.ts` was deleted as dead). Use the names above; do not resurrect `mapping.ts`.

---

## Duplication found (this file's share of the cross-cutting list)

- **D1 — the color port (~210 LOC):** `parseColor`, `toHex`, `rgbToHsl`, `hslToHex`, `linearize`, `lumOfRgb`/`lumOfHex`, `contrast`, `relightToAA`, `ensureContrast`, `nudgeToAA`, `bucketOf`, `mix` (lines 226–543) are a hand-port of `color.ts`. `color.ts` carries the exact twins (`rgbToHsl`/`hslToHex`/`relightToAA`/`ensureContrast`/`nudgeToAA`/`mixHex`/`luminanceBucket`/`contrastRatio`). **Canonical home: `color.ts`** for the pure math; **`color-runtime.ts`** for the rgb()/named-string parsing `color.ts` deliberately omits. DELETE the inline copy; import. (Gated on the executeScript removal.)
- **D2 — `isButtonLike`:** identical logic in `inject.ts` (828–844) and `content/pick.ts` (32–48). Canonical: `lib/classify.ts` (or `role-classify.ts`). Both import.
- **D3 — rgb()→hex parsing:** `inject.ts`'s `parseColor` rgb() branch (256–265) and `content/pick.ts`'s `rgbToHex` (141–157) parse the same `rgba?(...)` shape with the same alpha-0→null rule. Canonical: `color-runtime.ts` `parseCssColor`/`cssColorToHex`. Both import.
- **D4 — `<tag>\|<prop>` grammar:** the override builder (1396–1421) re-derives `key.indexOf("|")`, tag/prop split, `page`/`html`/`body` specials, `^[a-z][a-z0-9-]*$` tag validation — logic also in `pick.ts` (`pickKeyFor`/`propForElement`), `picker-panel-model.ts` (`roleLabel`), `popup/state.ts` (`overrideRoleLabel`). Canonical: `lib/override-grammar.ts`. The override-layer module imports `parseOverrideKey`/`isSafeTag`.
- **D8 — id literals:** `"themeMaker"`, `"themeMakerOverrides"`, `"themeMakerEarly"`, `"__thememaker_base__"` are re-inlined as string literals across the serialized fns AND duplicated in `content/index.ts` (`EARLY_STYLE_ID`). Once not-serialized, reference the exported `STYLE_ELEMENT_ID`/`BASE_CACHE_KEY` consts (and add `OVERRIDE_STYLE_ID`/`EARLY_STYLE_ID` to a `theme-dom-constants.ts`) instead of re-typing the strings.

---

## Long functions (over ~40–50 non-comment LOC) with split plans

1. **`applyAdaptiveScheme` — ~820 LOC. The whole point.** Split into the orchestrator + 7 modules above. The orchestrator becomes a readable spine: resolve roles → detect+remap vars → build base rules → emit role rules → init engine state → run the walk → build override layer → install observer. Each step is one named call into a module.
2. **`processElement` (968–1040, ~55 LOC)** — the per-element painter. Already single-responsibility; moves whole into `engine-walk.ts`. Optionally factor the "compute themed bg+color for a fill" tail into a `paintForElement(orig, fill, factor)` helper for testability.
3. **`drainQueue` (1205–1255, ~45 LOC)** — the time-slicer. Moves into `engine-walk.ts`; the slice-budget loop is fine as one function but extract `runSlice(work, start)` if it crosses 50 after the move.
4. **The CSS-var remap block (638–684, ~45 LOC)** — currently an inline `if (variableDriven || intensity >= 100) { … }`. Becomes `buildVarDecls(detectedVars, roles, factor)` in `css-var-remap.ts`.
5. **The observer callback (1477–1534, ~50 LOC)** — moves into `engine-observer.ts` as a named factory `makeObserver(state, ctx)`.

---

## Shared utils to extract (named)

- `lib/color-runtime.ts` — runtime CSS-color parsing/formatting over `color.ts` (D1/D3).
- `lib/role-classify.ts` (a.k.a. `classify.ts`) — `isButtonLike` + surface/element classifiers (D2/D7).
- `lib/override-grammar.ts` — `<tag>|<prop>` parse/label/validate (D4/D5/D6; shared with pick/popup/panel-model).
- `lib/theme-dom-constants.ts` — the `themeMaker*` ids + cache key (D8), or reuse the existing exported consts.
- `lib/engine-state.ts` — the one typed `window.__themeMaker*` accessor.

---

## Ordered, low-risk steps (keep 259 unit + ~31 e2e green at every step)

> Prereq: PLAN Phase 1 (executeScript→content-message) is DONE. Until then, none of the import-based de-dups are possible and this file cannot shrink.

1. **Land D1 first, in place.** With imports now legal, replace the inline color port with `import`s from `color.ts` + a new `color-runtime.ts`. Keep `applyAdaptiveScheme` one function for now. Run `tests/inject.test.ts`, `tests/overrides.test.ts`, `tests/base-cache.test.ts` (they call the engine directly under jsdom and assert contrast/structure — they pin equivalence byte-for-byte). Run e2e contrast specs. This alone deletes ~210 LOC.
2. **Extract `engine-state.ts`.** Replace the two inline `w` shape decls + init with `getOrInitEngineState(w)`. Pure mechanical; `removeSchemeStyle` + the engine both consume it. Test.
3. **Extract `role-classify.ts`** (`isButtonLike`, `surfaceFillFor`, the tag sets, skip/editable/image predicates). Repoint `inject.ts` AND `content/pick.ts` (D2). Test (`pick.test.ts` + inject/overrides).
4. **Extract `css-var-remap.ts`** (detection + `buildVarDecls`). Test (`tests/inject.test.ts` has css-var cases; e2e `css-vars.spec`).
5. **Extract `role-rules.ts`** (`roleRulesFor`/`harderRef`/`SURFACE_ROLE_BG`). Test (contrast + overrides specs).
6. **Extract `override-layer.ts`** using `override-grammar.ts` (D4). Test (`tests/overrides.test.ts`, `overrides.spec`).
7. **Extract `engine-walk.ts` (+`engine-observer.ts` if >200)** — the painter/scheduler/observer. This is the riskiest extraction (timing/observer lifecycle); do it LAST and gate hard on `dynamic-spa.spec.ts` (18 specs — the flicker/determinism/pre-paint coverage) plus `tests/inject.test.ts`.
8. **Slim the orchestrator** to the wiring spine; re-measure (`inject.ts` ≤200, every new module ≤200). Full `tsc` + `vitest` + e2e.

**Invariants to preserve throughout:** the public exports of `inject.ts` (`STYLE_ELEMENT_ID`, `BASE_CACHE_KEY`, `applyAdaptiveScheme`, `removeSchemeStyle`, `isSchemeApplied`, `applySchemeStyle`, `baseBackgroundFor`, `readBaseCache`/`writeBaseCache`/`clearBaseCache`) must keep their names + signatures — `tests/*` and `content/index.ts` import them by name, and `tests/content.test.ts` does `vi.spyOn(inject, "applyAdaptiveScheme")`, so `applyAdaptiveScheme` must remain a named export of the inject module namespace (it can delegate internally, but the spy target must survive).
