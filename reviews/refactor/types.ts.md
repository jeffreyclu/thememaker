# Refactor plan — `src/types.ts`

**Non-comment LOC: 38.** Verdict vs ≤200: **PASS.**

Shared domain types: `ColorMode`, `Intensity`/`clampIntensity`/`MIN_INTENSITY`/`DEFAULT_INTENSITY`, `TagPropKey`/`RoleOverrides`, `ApplyOptions`, `SchemeDetails`, `Scheme`. The single types home. Under budget. No split needed.

## Duplication found
None. `TagPropKey`/`RoleOverrides` (60–81) are the canonical declaration of the `<tag>|<prop>` grammar's TYPE; the runtime parse/label/validate of that grammar should live in `lib/override-grammar.ts` (D4) — the type stays here, the behavior consolidates there. Keep them in sync (the type documents what the grammar module parses).

## Long functions
None (`clampIntensity` is one expression).

## Ordered steps
No action required. (When `lib/override-grammar.ts` is created, its functions should reference `TagPropKey`/`RoleOverrides` from here.)
