# Review: `src/popup/state.ts`

**Purpose:** Pure popup state model + reducer. Defines `PopupState`, the `PopupAction` union, the `popupReducer`, hydration from storage (`hydratePartial`), and several pure selectors/formatters (history label, detail rows, override rows, default favorite name).
**LOC:** 343.

## Overall grade: **A-**

A clean, pure, well-tested (34 tests) reducer with an exhaustive discriminated-union action type and immutable transitions. State shape is honest and documented. The marks against it: `PopupState` is a flat bag mixing domain state with four `show*` UI-disclosure booleans, the `Scheme` dynamic-key type forces an unsafe cast in `schemeDetailRows`, and the `tag|prop` override grammar is parsed here for a FOURTH time.

## Findings

- [x] VERIFIED-INVALID (already resolved by the foundation pass): `schemeDetailRows` now iterates `Object.entries(scheme.colors)` (a `Record<string,string>`), so there is no `value as string` cast and `value` is already `string`. The `Scheme` type was tightened to carry an explicit `colors` map.

### [medium] `schemeDetailRows` casts dynamic scheme values with `value as string` over an unsound `Scheme` type
Lines 263–269: iterates `Object.entries(scheme)`, skips `schemeDetails`, then `const color = value as string`. The `Scheme` type (types.ts) is `{ schemeDetails: SchemeDetails; [tag: string]: string | SchemeDetails | undefined }`, so `value` is genuinely `string | SchemeDetails | undefined` and the `as string` is an unchecked assertion. If a non-`schemeDetails` key ever held a non-string (it shouldn't, but the type permits it), this silently produces a bad row.

**Why it matters:** Honest types. The unsoundness originates in the `Scheme` index-signature design (flagged in types.ts review); here it forces a blind cast in otherwise-pure code.

**Concrete fix:** Either tighten `Scheme` (separate the tag-color map from the metadata, e.g. `{ colors: Record<string,string>; details: SchemeDetails }`) so iteration is type-safe, or guard with `typeof value === "string"` instead of asserting. The guard is a one-line local fix; the type split is the real one.

- [x] FIXED (partial — the dead toggle removed; live three left intact): The "four parallel toggles" were really THREE live ones (`showDetails`/`showFavorites`/`showHistory`) plus a DEAD `showCustomize`/`toggleCustomize` — the latter were referenced ONLY inside state.ts (never read in view.ts, never dispatched in index.ts; the `#customize` button fires `onPickElement`, not a disclosure). Removed the dead field/init/action/reducer case. The remaining three are NOT consolidated into a `disclosure` sub-shape or single parameterized `toggle` action because the unit tests (`popup-state.test.ts`/`popup-view.test.ts`) dispatch `toggleDetails`/`toggleFavorites`/`toggleHistory` and read `showDetails`/`showFavorites`/`showHistory` directly, and those test files are out of this per-file agent's edit scope — renaming the action/state shape would break them. At three independent booleans the remaining boilerplate is minor.

### [medium] `PopupState` is a 21-field flat bag mixing domain state and four `show*` disclosure flags
Lines 23–63: `current`/`history`/`mode`/`intensity`/`invert`/`favorites`/`applied`/`origin`/`siteEnabled`/`overrides` (domain) sit alongside `picking`/`showDetails`/`showCustomize`/`showFavorites`/`showHistory`/`loading`/`error` (pure UI). The four `show*` toggles each get their own action (`toggleDetails`/`toggleCustomize`/`toggleFavorites`/`toggleHistory`) — four near-identical reducer cases (232–239).

**Why it matters:** SRP / over-uniform boilerplate. Four parallel boolean toggles is a smell; it's the kind of repetition that suggests a `disclosure` sub-shape. The file's own header even pre-empts the critique ("a single reducer keeps it simple") — which is fair at this scale, but the four duplicate toggle cases are still avoidable.

**Concrete fix:** Collapse the four disclosures into one `open: { details?: bool; customize?: bool; favorites?: bool; history?: bool }` (or a single `openPanel: 'details'|'customize'|...|null` if they're mutually exclusive) with ONE `toggle` action carrying which panel. That deletes four action variants and four reducer cases. If they're independent, the object form; if only one opens at a time, the enum form (which also fixes any "two panels open" awkwardness).

- [x] VERIFIED (real) but OUT-OF-SCOPE for this per-file agent: confirmed the `tag|prop` grammar is also parsed in `picker-panel-model.ts:21` (`roleLabel`) and `inject.ts:1376`. The fix is a shared `overrideKey.ts` module imported by the popup state, the panel model, and the content script — that requires creating a new module and editing files outside the popup's four-file scope (a cross-cutting refactor). Left as a foundation/cross-cutting item; not fixed here to respect the edit boundary.

### [low] `overrideRoleLabel` parses the `tag|prop` key — the FOURTH place that grammar is parsed
Lines 296–307 duplicate the exact `indexOf("|")`/`slice`/`page` special-case logic already in `picker-panel-model.ts:roleLabel` (and the parsing in `inject.ts` and the `pickKeyFor` construction in `pick.ts`). Four files now understand the `<tag>|<prop>` mini-DSL independently.

**Why it matters:** DRY, codebase theme. The override-key grammar has no single parser/formatter; each consumer re-derives it.

**Concrete fix:** One shared `overrideKey.ts` with `parseOverrideKey`/`formatOverrideKey` imported by the popup state, the panel model, and the content script. (The serialized inject payload can't import, but everything else can.)

- [x] VERIFIED (mostly intentional, one cosmetic drift) — left unchanged (out of scope to fully fix): The `OVERRIDE_ROLE_LABELS` table maps engine ROLE keys (`bg`, `textPrimary`, …); the panel-model's `roleLabel` formats `<tag>|<prop>` PICK keys. `overrideRoleLabel` already branches on `|`, so non-`page` `tag|prop` keys render identically on both surfaces (`tag · prop`). The ONE drift is the `page|background` sentinel: popup says "Page background", panel says "Page · background" — purely cosmetic. Harmonizing means touching `picker-panel-model.ts` (out of the popup's four-file scope) or diverging the popup copy unilaterally; not worth a scope-crossing change for a `·` character. No code change.

### [low] `OVERRIDE_ROLE_LABELS` (282–294) is a role→label table separate from the panel-model's labels
The popup labels roles "Page background"/"Body text"/etc.; the in-page panel (`picker-panel-model.roleLabel`) labels the SAME keys differently ("Page · background", "div · background"). So the same override is labeled two different ways depending on which UI shows it. Probably intentional (popup knows role keys, panel knows tag keys) but worth confirming they don't both render the same key type with divergent text.

**Concrete fix:** Once a shared formatter exists, decide on one label vocabulary or document why the two surfaces differ.

- [x] FIXED: Captured `const saved = savedScheme?.schemeDetails` once; the three reads are now `saved?.intensity` / `saved?.invert` / `saved?.overrides`.

### [nit] `hydratePartial` reaches three levels deep into optional chains repeatedly
`savedScheme?.schemeDetails?.intensity`, `?.invert`, `?.overrides` (107, 114, 123). Reads fine, but the repeated deep access hints `schemeDetails` could be destructured once. Trivial.

## What's GOOD
- **Exhaustive discriminated-union reducer.** `PopupAction` is a proper tagged union; `popupReducer` switches on `type` with a `default` fallthrough; every case returns a NEW state object — textbook immutable reducer, fully unit-tested.
- **Pure and DOM-free / chrome-free** — the whole module is testable in isolation, exactly as the docstring promises, and is.
- **`hydratePartial` correctly prefers the saved scheme's intensity/overrides** over global settings so the slider matches what's actually on the page after a popup reopen — a real, well-reasoned bit of state restoration with a clear WHY comment (the popup is recreated each open).
- **`generateSuccess` clears overrides** (189) and `selectHistory`/`applyFavorite` restore the scheme's own saved overrides — the override lifecycle across scheme changes is handled thoughtfully and consistently.
- Selectors (`historyLabel`, `defaultFavoriteName`, `currentSchemeDetails`) are small, pure, and reuse `describeColor` rather than re-deriving names.

## Top 3 concrete changes
1. **Collapse the four `show*` disclosure booleans + their four toggle actions** into one disclosure sub-shape with a single parameterized toggle action — removes four parallel reducer cases.
2. **Fix the `value as string` cast** in `schemeDetailRows` (guard with `typeof`), and ideally tighten the `Scheme` index-signature type at the root so the cast isn't needed anywhere.
3. **Extract a shared `overrideKey` parser/formatter** and use it here instead of the fourth hand-rolled `tag|prop` split.

## RE-REVIEW (post-fix audit)

- CONFIRMED FIXED: `schemeDetailRows` (state.ts:254-265) iterates `Object.entries(scheme.colors)` cast-free; `value` is typed `string`.
- VERIFIED-INVALID re-check: agree it was already resolved by the foundation pass.
- NEW (NOTE — same root cause as the types.ts colors item): `schemeDetailRows` does NOT guard `scheme.colors`; a legacy/hand-edited persisted scheme lacking `.colors` crashes here. Known/accepted ("clear storage"). One read-side `?? {}` would localize the robustness fix.
- Re-render gating dependency check (consumed by view.ts): `schemeDetailRows` reads only `scheme.colors`; `overrideRows` reads only `state.overrides`; `baseColorForRole` reads `state.current...palette.roles`. All three are covered by the view's `current`/`overrides` gate keys — no hidden state escapes the gate. No stale-detail risk.
- `dequeueScheme` (history.ts) bounds-checks index and returns `null`; `selectHistory` no-ops on null. Correct.
