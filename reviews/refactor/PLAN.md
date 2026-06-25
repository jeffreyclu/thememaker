# Decomposition / De-duplication Plan — Thememaker

**Date:** 2026-06-24
**Mandate:** every source file ≤ ~200 non-comment LOC; ZERO duplicated code; no heinously long functions.
**Baseline (verified this pass):** `npx vitest run` → **259 unit tests pass (17 files)**; `npx tsc --noEmit` → clean; e2e ≈ 31 specs across 7 spec files. Behavior must not change.

> Counts below are NON-COMMENT, non-blank LOC (block comments, `//`, JSDoc `*` lines, and blank lines excluded), measured with a script over `src/**/*.ts`. They differ slightly from the prompt's numbers (the prompt appears to count a looser line set) but the verdict (which files fail) is identical.

---

## 1. Files over budget — current LOC → target module count

| File | Non-comment LOC | Verdict | Target modules | Each ≤200? |
|---|---:|---|---:|---|
| `src/lib/inject.ts` | **1057** | FAIL (god file) | **8** | yes |
| `src/popup/view.ts` | 320 | FAIL | 3 | yes |
| `src/popup/index.ts` | 275 | SPLIT | 3 | yes |
| `src/popup/state.ts` | 244 | SPLIT | 2 | yes |
| `src/content/index.ts` | 228 | SPLIT | 3 | yes |
| `src/lib/palette.ts` | 227 | SPLIT | 3 | yes |
| `src/content/pick.ts` | 213 | SPLIT | 2 (+share) | yes |
| `src/lib/color.ts` | 196 | PASS (borderline) | keep / 2 if shared | yes |
| `src/lib/storage.ts` | 148 | PASS | keep | yes |
| `src/content/picker-panel.ts` | 133 | PASS | keep | yes |
| `src/lib/router.ts` | 94 | PASS (shrinks) | keep | yes |
| `src/content/picker-panel-model.ts` | 60 | PASS | keep | yes |
| `src/popup/engine-bridge.ts` | 129 | PASS | keep | yes |
| `src/lib/color-source.ts` | 90 | PASS | keep | yes |
| `src/lib/messages.ts` | 86 | PASS (grows slightly) | keep | yes |
| `src/lib/site-state.ts` | 42 | PASS | keep | yes |
| `src/lib/color-names.ts` | 34 | PASS | keep | yes |
| `src/types.ts` | 38 | PASS | keep | yes |
| `src/lib/history.ts` | 22 | PASS | keep | yes |
| `src/manifest.config.ts` | 37 | PASS | keep | yes |
| `src/background/index.ts` | 17 | PASS | keep | yes |
| `src/lib/random.ts` | 10 | PASS | keep | yes |
| `src/config.ts` | 11 | PASS | keep | yes |

**Files over the 200-line budget: 7** (inject, view, index, state, content/index, palette, pick). `color.ts` at 196 is a borderline PASS and only splits as a side effect of the inject de-dup.

**Proposed final module count:** the 23 current files become **~38 files** (net +15): inject 1→8, view 1→3, popup/index 1→3, state 1→2, content/index 1→3, palette 1→3, pick 1→2(+1 shared), plus shared util modules (`lib/color-runtime.ts`, `lib/dom-color.ts`, `lib/classify.ts`, `lib/override-grammar.ts`) created during de-dup. Every resulting file lands ≤200 non-comment LOC.

---

## 2. The headline: kill the `inject.ts` ↔ `lib/color` port by deleting `executeScript`

### Verdict: **FEASIBLE and strongly recommended.** This is the lever that unblocks everything else.

The 1057-LOC `inject.ts` re-implements `lib/color` (parse/hex/hsl/contrast/`relightToAA`/mix) plus its own classifiers **only because `applyAdaptiveScheme` is serialized** via `chrome.scripting.executeScript({ func })` and a stringified function cannot `import`. Remove that boundary and the entire port (~210 LOC of color math + classifier duplication) is **deleted**, not merely re-homed.

The escape hatch already exists and is already exercised in production:

- `src/content/index.ts` is an **always-on bundled content script** (`<all_urls>` @ `document_start`, see `src/manifest.config.ts`). It **already `import`s `applyAdaptiveScheme`** and runs it in the page (the auto-reapply path), and it **already handles an `APPLY_LIVE` content message** that runs the same engine in place (`handleContentMessage` → `applyLive` → `applyWhenReady`).
- It runs in the **same isolated world** that `chrome.scripting.executeScript` injects into, sharing the same `window.__themeMaker*` state and the single `<style id="themeMaker">`. So routing apply through it is behaviorally identical to the executeScript path.

So `APPLY_SCHEME` / `RESET_SCHEME` / `QUERY_STATE` can be delivered to the content script via `chrome.tabs.sendMessage` (exactly like the existing `SHOW_PICKER`/`HIDE_PICKER`/`APPLY_LIVE` messages) instead of `chrome.scripting.executeScript({ func })`. Once they are, `inject.ts` is **ordinary bundled code that can `import` from `lib/color`, `lib/palette`, and shared utils** — and the port is gone.

### Concrete shape of the change (full design in `reviews/refactor/lib/inject.ts.md`)

- **`src/lib/messages.ts`:** add three `ContentMessage` variants — `APPLY_SCHEME` (palette+options+scheme), `RESET_SCHEME`, `QUERY_STATE` — that ALSO need a reply. Because `chrome.tabs.sendMessage` supports a response callback, add a small typed `sendToContentWithReply(tabId, msg)` alongside the existing fire-and-forget `sendToContent`. The popup→content channel becomes the single apply transport. The popup↔background `ThememakerMessage` union shrinks to whatever (if anything) still needs the worker.
- **`src/content/index.ts`:** extend `handleContentMessage` to handle the three new messages: APPLY → `applyWhenReady(palette, options)` + report `{ applied: true }`; RESET → call `removeSchemeStyle()` (now a normal imported function) + report `{ applied: false }`; QUERY → `isSchemeApplied()`. The `onMessage` listener returns `true` and calls `sendResponse` for these (it currently returns undefined for the fire-and-forget set). The content script becomes the one place that owns page-side apply.
- **`src/lib/router.ts`:** `createChromeInjector` / `executeScript` / `run<T>` / the whole `Injector` indirection is **DELETED** (≈90 LOC gone). `routeMessage` either disappears or shrinks to a thin tab-resolution helper used by the popup. `originFromUrl` already lives in `storage.ts`, so the popup can resolve origin without the router.
- **`src/background/index.ts`:** the service worker's `onMessage`→`routeMessage`→`injector` wiring is no longer needed for apply. It can be reduced to `export {}` (kept as an MV3 SW stub) or removed from the message path entirely. (Keeping a trivial SW is harmless; decide during the change.)
- **`src/popup/index.ts`:** `applyCurrentScheme` / `onGenerate` / `onReset` / `onSelectIntensity` stop calling `sendMessage({type:"APPLY_SCHEME"...})` to the background and instead `sendToContentWithReply(activeTabId, {type:"APPLY_SCHEME",...})`. The popup already resolves `activeTabId` for pick mode, so the plumbing exists. The `QUERY_STATE` on hydrate likewise goes to the content script.
- **`inject.ts`:** the file-level docstring's "MUST be self-contained, NO imports" contract is retired for `applyAdaptiveScheme`. `removeSchemeStyle` / `isSchemeApplied` / `applySchemeStyle` lose their "safe to serialize" caveats. The inlined color port + classifiers are replaced by imports.

### Risks (assessed) and why they're acceptable

1. **"Is the content script always present?"** It is registered for `<all_urls>` at `document_start`. The ONE gap is pages where no content script can run AT ALL: `chrome://`, `chrome-extension://`, the Web Store, `view-source:`, `about:`, PDF viewer, and `file://` when "Allow access to file URLs" is off. **But `executeScript` cannot run on those pages either** — both transports fail on exactly the same surface. Today `originFromUrl` returns null / the popup's QUERY_STATE try/catch swallows the failure on those tabs; the new path swallows a "no receiving end" `lastError` identically (the existing `sendToContent` already does this). **Net: no NEW dead surface.** Mitigation: keep the popup's existing try/catch + `applied=false` fallback.
2. **Timing / readiness.** `executeScript` runs whenever the popup fires it (post-load). The content-script listener is registered at `document_start`, so by the time the popup is open and the user clicks Generate, the listener is live. The engine's own `applyWhenReady` already defers to `DOMContentLoaded` if `document.body` is missing. No new race.
3. **Reply channel.** `chrome.tabs.sendMessage` with a callback + the listener returning `true` + calling `sendResponse` is the standard MV3 request/response pattern (the popup→background path already relies on it). The `applied` boolean the popup needs is trivially returned.
4. **CSP.** Irrelevant to this change — neither path injects inline page scripts; both run privileged extension JS in the isolated world. The injected `<style>` is unaffected.
5. **Double-apply.** Both the auto-reapply (content script on load) and an explicit popup apply write the SAME `<style id="themeMaker">` in place. That invariant is unchanged; the popup apply now travels the same channel as auto-reapply, if anything REDUCING the chance of conflicting paths.

### Test-suite impact (must stay green)
- `tests/router.test.ts` + `tests/messages.test.ts` test `routeMessage` + the injector seam. If the router is deleted, these tests are **deleted or rewritten** to target the content script's new `handleContentMessage` branches. This is the only test rewrite the change forces; it is in-scope (the behavior moves, the test moves with it). The content script's apply path is already tested in `tests/content.test.ts` via `vi.spyOn(inject, "applyAdaptiveScheme")` — extend that file for the new APPLY/RESET/QUERY branches.
- `tests/inject.test.ts`, `tests/overrides.test.ts`, `tests/base-cache.test.ts` import `applyAdaptiveScheme` / the payload helpers directly and run them under jsdom. **These keep passing unchanged** — the function still exists with the same signature; it just gains `import`s. (jsdom resolves imports, so importing `lib/color` inside the engine is fine under test.) This is the safety net: the engine's behavior is pinned by direct DOM tests, so swapping the inlined port for the imported core is verified function-by-function.

### The escape hatch's alternative (only if executeScript MUST stay — it doesn't)
If a future requirement forced apply to keep using `executeScript({func})` (e.g. a page where the content script is intentionally absent but the popup still has `activeTab`), the honest fix is a **build step that bundles the engine into a single self-contained string** the worker injects — i.e. compile `applyAdaptiveScheme` + its now-imported deps into one IIFE artifact and inject THAT, so the source can still `import` while the shipped payload is self-contained. **I do not recommend this:** it adds a custom build step, a second artifact to keep in sync, and source-map/debugging friction, to solve a problem the always-on content script already solves for free. The content-message route is strictly simpler. Record the executeScript→content-message migration as a new ADR.

---

## 3. Cross-cutting de-duplication list (canonical home → who shares)

| # | Duplicated logic | Where it lives now | Canonical home | Sharing mechanism |
|---|---|---|---|---|
| D1 | **The entire color port** — `parseColor`, `toHex`, `rgbToHsl`, `hslToHex`, `linearize`, `lumOf*`, `contrast`, `relightToAA`, `ensureContrast`, `nudgeToAA`, `bucketOf`, `mix` | `inject.ts` (inlined ~210 LOC) duplicating `lib/color.ts` | **`lib/color.ts`** (+ a thin `lib/color-runtime.ts` for the rgb()/named-string parsing the engine needs that `color.ts` doesn't expose) | DELETE the inline port; `import` from `color.ts`/`color-runtime.ts` once executeScript is gone (§2) |
| D2 | **`isButtonLike`** | `inject.ts` (`surfaceFillFor` path) AND `content/pick.ts` (re-ported) | **`lib/classify.ts`** | both `import isButtonLike` |
| D3 | **rgb()/rgba() → hex parsing** | `inject.ts` (`parseColor`), `content/pick.ts` (`rgbToHex`), `color.ts` (`hexToRgb` is hex-only — the rgb() variant is the dup) | **`lib/color-runtime.ts`** (`parseCssColor` returning rgb + alpha; `cssColorToHex`) | `import`; pick + inject share one parser |
| D4 | **`<tag>\|<prop>` override-key grammar** — parse `key.indexOf("\|")`, split tag/prop, "page"/"html"/"body" specials, tag-name validation | `inject.ts` (override CSS builder ~1377-1428), `content/pick.ts` (`pickKeyFor`/`propForElement`), `content/picker-panel-model.ts` (`roleLabel`), `popup/state.ts` (`overrideRoleLabel`) | **`lib/override-grammar.ts`** (`parseOverrideKey`, `makeOverrideKey`, `labelForOverrideKey`, `isSafeTag`) | `import`; the 4 sites call shared parse/label fns |
| D5 | **Override-row → label mapping** (`OVERRIDE_ROLE_LABELS` in state.ts vs `roleLabel` in picker-panel-model.ts) — two label tables for the same keys | `popup/state.ts` + `content/picker-panel-model.ts` | **`lib/override-grammar.ts`** (one `labelForOverrideKey`) | both import; delete the second table |
| D6 | **`overrideRows` mapper** (entries → `{role,label,color}`) implemented twice | `popup/state.ts` (`overrideRows`) + `content/picker-panel-model.ts` (`overrideRows`) | **`lib/override-grammar.ts`** or a shared `overrideRows` util | one impl, both import (color-validation stays where each needs it) |
| D7 | **Surface/role/CSS-var classifiers** — `classifyVarName`, `CODE_TAGS`/`CARD_TAGS`/`BANNER_TAGS`/`COMP_TAGS`, `isSkippable`, `isEditableRoot`, `hasImageBackground`, `classifyButton`, `surfaceFillFor` | all inlined in `inject.ts` | **`lib/role-classify.ts`** (engine-internal, but now an importable module once executeScript is gone) | `import` into the engine's orchestrator |
| D8 | **`STYLE_ID`/`themeMaker*` id literals** repeated as inline string literals inside each serialized fn (`"themeMaker"`, `"themeMakerOverrides"`, `"themeMakerEarly"`, `"__thememaker_base__"`) | `inject.ts` (×several), `content/index.ts` (`EARLY_STYLE_ID`) | **`lib/theme-dom-constants.ts`** (or reuse exported `STYLE_ELEMENT_ID`/`BASE_CACHE_KEY`) | once not-serialized, reference the exported consts directly instead of re-inlining |
| D9 | **`originFromUrl`-style URL→origin** + `activeTab` resolution | `router.ts` (`activeTab`) + `popup/index.ts` (`activeOrigin`) + `storage.ts` (`originFromUrl`) | **`storage.ts` already owns `originFromUrl`**; fold `activeTab` into a small `lib/active-tab.ts` | import; router's copy dies with the router |
| D10 | **`schemeDetailRows`/`schemeSwatches`** color-grouping read from `scheme.colors` | `popup/state.ts` + `popup/view.ts` (schemeSwatches) | **`popup/scheme-view-model.ts`** (new) | import into the view |

The single biggest de-dup is **D1**, gated entirely on §2. D2/D3/D7/D8 also collapse only after §2 (the engine can finally import). D4/D5/D6/D10 are independent of §2 and can be done first as low-risk warm-ups.

---

## 4. Global execution order (low-risk first, behavior-preserving throughout)

Each step ends with `npx tsc --noEmit && npx vitest run` (259 green) and, for steps touching the engine/messaging, `npm run test:e2e` (≈31 green).

**Phase 0 — independent de-dups (no executeScript dependency, lowest risk).**
1. Extract `lib/override-grammar.ts` (D4/D5/D6): move `parseOverrideKey`/`labelForOverrideKey`/`isSafeTag`/`overrideRows`. Repoint `popup/state.ts`, `content/picker-panel-model.ts`. Delete the duplicate label table. Tests: `popup-state`, `popup-view`, `overrides`, `pick` stay green.
2. Extract `popup/scheme-view-model.ts` (D10): `schemeDetailRows`, `schemeSwatches`, `historyLabel`, `defaultFavoriteName`, override-row VM. Repoint `state.ts`/`view.ts`.
3. Split `popup/view.ts` (320→3): `popup/view.ts` (refs+bindEvents+top-level render), `popup/view-lists.ts` (history/favorites list builders), `popup/view-details.ts` (details/swatch/detail-row builders). Pure presentational — `popup-view.test.ts` pins it.
4. Split `popup/state.ts` (244→2): `popup/state.ts` (PopupState + reducer + initial/hydrate) and `popup/state-selectors.ts` (the `schemeDetailRows`/`overrideRows`/label/`defaultFavoriteName` selectors — most of which move into the view-model in step 2, leaving state.ts as just the reducer). `popup-state.test.ts` + `popup-hydrate.test.ts` pin it.
5. Split `lib/palette.ts` (227→3): `lib/palette.ts` (types + `generatePalette`/`invertPalette` orchestration), `lib/palette-roles.ts` (`deriveRoles` — the ~110-LOC function, the file's biggest), `lib/palette-swatches.ts` (`themeSwatches` + fold logic + `ThemeColor`). `palette.test.ts` pins it.
6. Extract `lib/classify.ts` (D2) + `lib/color-runtime.ts`/`lib/dom-color.ts` (D3): pull `isButtonLike` and the rgb()→hex parser out of `content/pick.ts` into shared modules; split `content/pick.ts` (213→2): `content/pick.ts` (session/overlay/listeners) + reuse the shared classify/color modules for `propForElement`/`currentColorFor`. `pick.test.ts` pins it. (inject still has its own copies at this point — that's fine; they get deleted in Phase 2.)

**Phase 1 — the executeScript→content-message migration (§2). THE UNBLOCKER. Do as one focused, e2e-gated change.**
7. Add the three reply-carrying `ContentMessage` variants + `sendToContentWithReply` to `messages.ts`.
8. Extend `content/index.ts` `handleContentMessage` + `onMessage` listener to handle APPLY/RESET/QUERY with `sendResponse`.
9. Repoint `popup/index.ts` apply/reset/query to `sendToContentWithReply(activeTabId, …)`.
10. Delete `createChromeInjector`/`Injector`/`run`/`executeScript` from `router.ts`; reduce/remove `background/index.ts` from the apply path. Rewrite/relocate `router.test.ts` + `messages.test.ts` to target the content-script branches. **Run e2e here** — `apply`, `reset`, `persistence`, `dynamic-spa` specs are the real gate.

**Phase 2 — the inject.ts decomposition (now that imports work). The big one (§ inject plan).**
11. With imports unlocked, DELETE the inline color port from `inject.ts` and `import` from `color.ts` + new `lib/color-runtime.ts` (D1). Re-run `inject.test.ts`/`overrides.test.ts`/`base-cache.test.ts` — they pin equivalence.
12. Extract engine sub-modules per the inject plan: `lib/color-runtime.ts`, `lib/css-var-remap.ts`, `lib/role-classify.ts`, `lib/role-rules.ts`, `lib/override-layer.ts`, `lib/engine-scheduler.ts`, `lib/engine-observer.ts`, `lib/engine-state.ts`, leaving `inject.ts` as the ≤200-LOC orchestrator + the small payload helpers. Move one concern at a time, test after each.
13. Final sweep: re-measure every file ≤200; full `tsc` + `vitest` + e2e.

**Why this order:** Phase 0 banks ~6 file splits with zero coupling to the risky bits, shrinking the surface and de-duping the override grammar that 4 files share. Phase 1 is the single architectural change that makes Phase 2 possible at all — and it is the highest-risk step, so it is isolated and e2e-gated. Phase 2 is mechanical once imports work, with the direct inject DOM tests as a per-extraction safety net.

---

## 5. Per-file plans

See `reviews/refactor/<path>.md` for each file's exact LOC, PASS/FAIL, module split with target LOC, duplication, long-function splits, shared-util extractions, and ordered steps. The marquee plan is `reviews/refactor/lib/inject.ts.md`.
