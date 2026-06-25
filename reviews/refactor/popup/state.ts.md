# Refactor plan — `src/popup/state.ts`

**Non-comment LOC: 244.** Verdict vs ≤200: **SPLIT (must justify or split).**

Two concerns share the file: (1) the pure `PopupState` model + `popupReducer` + `initialPopupState`/`hydratePartial` (the actual state machine), and (2) a set of view-model SELECTORS read by `view.ts` (`historyLabel`, `schemeDetailRows`, `overrideRoleLabel`, `overrideRows`, `baseColorForRole`, `defaultFavoriteName`, `OVERRIDE_ROLE_LABELS`). Splitting them gives two files well under budget and removes the override-label duplication.

## Decomposition plan (2 files + shared, each ≤200)

| File | Responsibility | Moves | Target LOC |
|---|---|---|---:|
| `src/popup/state.ts` (kept) | `PopupState`, `PopupAction`, `initialPopupState`, `popupReducer`, `HydrateInputs`, `hydratePartial`. | — | ~150 |
| `src/popup/scheme-view-model.ts` | `historyLabel`, `schemeDetailRows`, `defaultFavoriteName`, `baseColorForRole`, `currentSchemeDetails` — the scheme→display derivations (shared with `view.ts`, D10). | lines 241–267, 301–335 | ~70 |

The override-label/row pieces (`OVERRIDE_ROLE_LABELS`, `overrideRoleLabel`, `overrideRows`, lines 273–324) **move to `lib/override-grammar.ts`** (D4/D5/D6), not to a popup file — they duplicate `content/picker-panel-model.ts`'s `roleLabel`/`overrideRows`.

## Duplication found
- **D5/D6:** `overrideRoleLabel` (288–299) + `OVERRIDE_ROLE_LABELS` table vs `picker-panel-model.ts` `roleLabel` (21–32). Two label functions for the same `<tag>|<prop>` keys, with overlapping logic (`page` special, `tag · prop`). And `overrideRows` (317–324) duplicates `picker-panel-model.ts`'s `overrideRows` (43–48). Canonical: `lib/override-grammar.ts` `labelForOverrideKey` + `overrideRows`. Note: `state.ts`'s table maps ROLE keys (`textPrimary`→"Body text") while panel-model maps TAG keys (`div`→"div · background"); the merged `labelForOverrideKey` handles both (role-key table fallback + `<tag>|<prop>` formatting) — they're two halves of one grammar.
- **D4:** `overrideRoleLabel`'s `role.indexOf("|")` + slice is the same key-parse as `pick.ts`/`inject.ts`/`panel-model`. Use `parseOverrideKey` from `override-grammar.ts`.

## Long functions
None over 50 LOC — the reducer (147–239, ~75 LOC) is a flat switch; acceptable as one pure reducer (splitting a discriminated-union switch hurts more than it helps). Leave it.

## Shared utils to extract
- `lib/override-grammar.ts` (D4/D5/D6), `popup/scheme-view-model.ts` (D10).

## Ordered steps
1. Create `lib/override-grammar.ts`; move `overrideRoleLabel`/`OVERRIDE_ROLE_LABELS`/`overrideRows` there, merge with panel-model's versions. Repoint `state.ts`, `view.ts`, `picker-panel-model.ts`. `popup-state.test.ts`/`overrides.test.ts` green.
2. Move scheme selectors → `scheme-view-model.ts`. Repoint `view.ts`.
3. Re-measure (`state.ts` ≤200); `tsc` + `vitest`.
