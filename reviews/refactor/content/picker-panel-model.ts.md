# Refactor plan — `src/content/picker-panel-model.ts`

**Non-comment LOC: 60.** Verdict vs ≤200: **PASS.**

Pure model for the floating control: `roleLabel`, `overrideRows`, and the map transitions `withPickedRole`/`withRoleColor`/`withoutRole`. Tested via `overrides.test.ts`. Under budget — but it DUPLICATES the override-label/row logic in `popup/state.ts`.

## Duplication found
- **D4/D5/D6:** `roleLabel` (21–32) duplicates `popup/state.ts`'s `overrideRoleLabel` (the `<tag>|<prop>` parse + `page` special + `tag · prop` formatting). `overrideRows` (43–48) duplicates `state.ts`'s `overrideRows`. These are two implementations of one grammar. **Canonical home: `lib/override-grammar.ts`** (`labelForOverrideKey`, `overrideRows`, `parseOverrideKey`). This file imports them.
- The map transitions (`withPickedRole`/`withRoleColor`/`withoutRole`, 55–92) are this file's unique value — they're the panel's pure state ops and stay here (they validate hex via `color.ts`, which is correct).

## Long functions
None.

## Shared utils to extract
- `lib/override-grammar.ts` (D4/D5/D6) — `roleLabel`/`overrideRows` move there; this file imports them and keeps the map transitions.

## Ordered steps (part of PLAN Phase 0, step 1)
1. Move `roleLabel`→`labelForOverrideKey` and `overrideRows` into `lib/override-grammar.ts`, merged with `state.ts`'s versions (one function handling both role-key and `<tag>|<prop>` keys).
2. Import them here + in `state.ts`/`view.ts`. `overrides.test.ts` green (it imports `withPickedRole`/`withoutRole`/`withRoleColor` from this file — keep those exports here).
3. `tsc` + `vitest`.
