# Review: `src/content/picker-panel-model.ts`

**Purpose:** Pure model for the floating picker panel — row projection (`overrideRows`) and immutable map transitions (`withPickedRole`/`withRoleColor`/`withoutRole`) over the `<tag>|<prop>` override map, plus label formatting.
**LOC:** 92.

## Overall grade: **A**

Near-exemplary functional module. Every transition is pure and returns a NEW map; invalid hex is validated at the boundary; no DOM, no `chrome.*`; small focused functions with honest types. This is the model the whole codebase should be measured against. Findings are minor.

## Findings

### [low] `RoleOverrides` is `Record<string,string>` but this module's keys are actually `<tag>|<prop>` strings — the type doesn't say so
Every function here keys on `<tag>|<prop>` (e.g. `div|background`), the SAME `RoleOverrides` type that `mapping.ts`/`inject.ts` ALSO use for role keys (e.g. `heading`). The single loose `Record<string,string>` type serves two incompatible grammars across the codebase (see types.ts and inject.ts reviews). This file is correct, but its correctness rides on a type that can't distinguish its own key space from the role-key space.

**Why it matters:** Honest types / interface segregation, codebase-wide theme. A `RoleOverrides` value produced here (`div|background`) and one produced by the role path (`heading`) are structurally identical but semantically disjoint; nothing prevents mixing them.

**Concrete fix:** Introduce a distinct alias (even just `type TagOverrides = Record<TagPropKey, string>` where `TagPropKey = \`${string}|${'background'|'color'}\``) so this module's contract is self-describing and can't be confused with role overrides. Template-literal types make `<tag>|<prop>` expressible.

### [low] `roleLabel` parses the `<tag>|<prop>` key with manual `indexOf("|")`/`slice` in two places
Lines 21–32 here and `inject.ts` lines 1404–1406 both split the `tag|prop` key by hand. Same mini-DSL parsed in two files.

**Why it matters:** DRY — the override-key grammar is parsed independently in the model and in the inject payload, so they can disagree (e.g. on the `page` special-case).

**Concrete fix:** Export a single `parseOverrideKey(key): { tag: string; prop: 'background'|'color' }` from this module and have inject.ts use it where it can (the serialized payload can't import, but the model and content script can share it).

### [nit] `overrideRows` silently substitutes `FALLBACK_COLOR` for an invalid stored hex (line 47)
Correct defensiveness, but it means a corrupt persisted override is shown as gray with no signal that it was invalid. Fine for a UI seed; just noting the silent coercion. No change needed.

## What's GOOD
- **Pure, immutable, total.** Every mutator returns a new object (`{...overrides, [key]: ...}` / `delete` on a copy); no in-place mutation; early-return identity when nothing changes (`if (key in overrides) return overrides`) is a nice touch that keeps referential equality stable for unchanged maps.
- **Validation at the boundary**: `isHexColor` gates every write, `normalizeHex` canonicalizes — invalid input can never enter the map. This is exactly right for a model.
- **Honest, minimal types** (`OverrideRow`) and clear single-purpose functions; trivially unit-testable (and is tested).
- **The `role` field name carrying a `<tag>|<prop>` key** is documented (line 36) — slightly confusing name, but the comment owns it.

## Top 3 concrete changes
1. **Give the `<tag>|<prop>` override map its own type alias** (template-literal keyed) so it's not interchangeable with the role-key `RoleOverrides` — the cleanest place in the codebase to start fixing the overloaded-overrides-type theme.
2. **Export a shared `parseOverrideKey`** and use it in both this model and (where possible) the content script, so the key grammar is parsed in one place.
3. Nothing else — this file is essentially done. Consider it the reference for the rest.
