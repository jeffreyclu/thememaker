# Refactor plan — `src/popup/view.ts`

**Non-comment LOC: 320.** Verdict vs ≤200: **FAIL.**

Pure presentational layer: query refs, bind events, and rebuild the popup DOM (details / history / favorites) from `PopupState`. No `chrome.*`, no business logic — well-layered already, just too big because three independent list renderers live together.

## Decomposition plan (3 files, each ≤200)

| File | Responsibility | Moves | Target LOC |
|---|---|---|---:|
| `src/popup/view.ts` (kept) | `PopupRefs`/`PopupHandlers` interfaces, `queryRefs`, `populateModes`, `bindEvents`, the top-level `render` + the `lastRendered` memo/gating, the shared `makeSwatch`/`makeSwatchStrip` primitives | — | ~150 |
| `src/popup/view-details.ts` | `renderDetails`, `makeDetailRow`, `makeDetailsSeed` (the details disclosure) | lines 185–230 | ~70 |
| `src/popup/view-lists.ts` | `renderHistory`, `renderFavorites`, `schemeSwatches` (the two list disclosures) | lines 232–328 | ~110 |

`render` imports `renderDetails`/`renderHistory`/`renderFavorites` and keeps owning the reference-equality gating that protects focus/scroll.

## Duplication found
- **D10:** `schemeSwatches` here (232–245) and `schemeDetailRows`/swatch grouping in `state.ts` both read `scheme.colors`. Move the scheme→view-model derivations into `popup/scheme-view-model.ts`; `view-lists.ts` imports `schemeSwatches` from there. `makeSwatch`/`makeSwatchStrip` stay the canonical chip builders (used by both list renderers) — keep in `view.ts` and import into `view-lists.ts`.
- The history/favorites renderers share the "empty-state `<li>` + labeled button + swatch strip" shape; factor `makeListItem(label, swatches, data)` into `view-lists.ts` to remove the near-duplicate `forEach`/`for` bodies (favorites adds a delete button).

## Long functions
- `render` (348–409, ~50 LOC): mostly cheap attribute writes + the gating block — acceptable, but the three `if (!prev || …) render*()` calls become one-liners once the renderers are imported. Keep as the spine.
- `renderFavorites` (285–328, ~40 LOC) and `renderHistory` (247–283, ~35 LOC): collapse via the shared `makeListItem` helper above.

## Shared utils to extract
- `popup/scheme-view-model.ts` (D10) — `schemeSwatches`, `schemeDetailRows`, `historyLabel`, override-row VM (also consumed by `state.ts`).

## Ordered steps
1. Extract `popup/scheme-view-model.ts`; repoint `schemeSwatches`. `popup-view.test.ts` green.
2. Move `renderDetails`+helpers → `view-details.ts`. Test.
3. Move `renderHistory`/`renderFavorites`/`makeListItem` → `view-lists.ts`. Test.
4. Re-measure (`view.ts` ≤200); `tsc` + `vitest`.
