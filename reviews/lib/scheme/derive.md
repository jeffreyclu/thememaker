# Review: `src/lib/scheme/derive.ts`

**Reviewed:** 2026-06-26
**Purpose:** Read-only `Scheme` → view-model derivations: `currentSchemeDetails`, `overrideRoleLabel`, `overrideRows`, `isCurrentSaved` (+ `SavedCheckInput`), `historyLabel`, `schemeDetailRows`, `schemeSwatches`, `defaultFavoriteName`. Pure, DOM-free, framework-free.

## LOC
113 non-comment / non-blank lines. Within ≤200.

## Findings

No blocking/high findings. The module is pure and reads scheme data only, as the docstring claims.

### Correctness
- `isCurrentSaved` (87-105) builds a content signature (`saveSignature`, 62-73) from `rootColor|colorMode|invert|intensity|overridesSig` and compares it against each favorite. `overridesSig` (55-59) sorts keys before joining, so the comparison is **order-independent** — correct, since override maps can be built in any insertion order. Returns `false` for a null current. Total. Tests cover it (`isCurrentSaved` has 3 external refs).
  - **[Low] Subtle dedupe asymmetry.** `file:src/lib/scheme/derive.ts:101`. For the favorite side, intensity falls back to `snapshot.intensity` when the favorite's `schemeDetails.intensity` is absent (`f.scheme.schemeDetails.intensity ?? snapshot.intensity`). So a favorite saved without a stored intensity will match the live look at *any* current intensity, because both sides then use the same `snapshot.intensity`. In practice every saved favorite carries an intensity (`schemeWithIntensity` always stamps one), so this branch is effectively dead — but it means the "already saved?" check silently ignores intensity for legacy/intensity-less favorites. Acceptable given current write discipline; worth a comment that the fallback exists only for legacy entries.
- `schemeDetailRows` (117-128) and `schemeSwatches` (131-142): both guard `scheme.colors ?? {}` / a null scheme, dedupe colors, and cap swatches at 5. Pure, immutable, correct.
- `historyLabel` (110-114) / `defaultFavoriteName` (145-149): both fall back to `describeColor(rootColor)` when `rootColorName` is absent. Correct and total.
- `overrideRows` (49-52) delegates to the shared `overrideRowsBase` (`lib/overrides`) with the local label fn — good reuse of the single override-key grammar; no re-implementation of parsing.

### Dead / over-wide exports
- **[Medium] `overrideRoleLabel` is exported but used only inside this file.** `file:src/lib/scheme/derive.ts:42`. Grep: zero external refs (its only use is `overrideRows` at line 52, same module). It is an internal helper; drop the `export` keyword. Over-wide export — it is surfaced as domain-public via the `scheme/index.ts` barrel for no consumer.
- **[Low] `currentSchemeDetails` (23) has no production consumer.** `file:src/lib/scheme/derive.ts:23`. Referenced only in `tests/popup-state.test.ts:272-274` — it is a one-line `scheme?.schemeDetails ?? null` wrapper that nothing in `src/**` calls. Either inline it at the (absent) call site or drop it; carrying a test-only public helper is the false-coverage pattern this repo's review log flags. Low — it is trivially correct, just unused surface.
- **[Low] `SavedCheckInput` (76) is exported but only names `isCurrentSaved`'s param.** Defensible (a caller building the snapshot wants the type), and `isCurrentSaved` is consumed externally — leave as-is or drop the `export` if no caller names it. No impact.

### Duplication
- **[Low] `OVERRIDE_ROLE_LABELS` (27-39) duplicates the role→label intent that also lives in palette role docs / picker panel labels.** `file:src/lib/scheme/derive.ts:27`. This is the popup's *role* table fed into the shared `labelForOverrideKey` (which is correctly the single grammar). The picker panel supplies its own table by design (see `lib/overrides/keys.ts:53-58` — "each consumer supplies its own role table"), so this is *intended* per-consumer wording, not accidental duplication. Not a finding to fix; noted for traceability — the shared grammar is in `overrides`, only the wording table is local, which is the documented split.

## Naming / comments / architecture
- Names are domain-correct, no React/Redux jargon. Comments are logic-only and accurate (e.g. the `colors ?? {}` guards, the "order-independent signature" note). No stale paths.
- Domain fit: read-only scheme→view-model derivation belongs in the scheme domain. Imports `lib/color/color-names`, `lib/overrides`, `lib/storage` (type-only `Favorite`), `types` — no DOM, no `chrome.*`, no React/popup/picker. The `Favorite` import is type-only (`import type`), so the read-side does not pull in storage runtime. Clean.
