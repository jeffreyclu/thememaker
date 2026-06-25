# Review: `src/content/picker-panel-model.ts`

**Purpose:** Pure model for the floating picker panel — row projection (`overrideRows`) and immutable map transitions (`withPickedRole`/`withRoleColor`/`withoutRole`) over the `<tag>|<prop>` override map, plus label formatting.
**LOC:** 92.

## Overall grade: **A**

Near-exemplary functional module. Every transition is pure and returns a NEW map; invalid hex is validated at the boundary; no DOM, no `chrome.*`; small focused functions with honest types. This is the model the whole codebase should be measured against. Findings are minor.

## Findings

- [x] VERIFIED-INVALID (out of scope + not a net win): `RoleOverrides` lives in the SHARED `types.ts`, a FIXED contract for this pass, and is the exact type the panel (`picker-panel.ts`), the content script (`index.ts`), the engine override layer (`inject.ts`), and `overrides.test.ts` all pass around. A model-local `TagOverrides` alias would either force every signature here to diverge from the shared type its callers use (casts at every boundary — the opposite of honest types) or just re-alias the same `Record<string,string>` shape (cosmetic). With `mapping.ts` now deleted, there is no longer a SECOND producer keying this type by role names — the `<tag>|<prop>` grammar is the only override grammar in the codebase, so the "two incompatible grammars on one type" tension this finding rests on is gone. Any remaining cross-codebase cleanup belongs in `types.ts` (out of scope), not as a local divergence here.

- [x] VERIFIED-INVALID (the one place that COULD share already can't, and the rest is a 3-line split): the inject.ts parse (now at `inject.ts` ~1376–1383) lives INSIDE the serialized `executeScript` payload (`applyAdaptiveScheme`'s body) and CANNOT import this module — the review itself concedes this. So the only consumer left that could import a shared `parseOverrideKey` is this very file (and the content script, which doesn't parse keys — it only passes them through). Exporting a `parseOverrideKey` helper to be used by one caller (this file's `roleLabel`) is indirection without DRY payoff: it does not de-duplicate the inject copy (the actual duplication), it just renames a 3-line `indexOf`/`slice` already local to where it's used. No real reduction in complexity; left as-is.

### [nit] `overrideRows` silently substitutes `FALLBACK_COLOR` for an invalid stored hex (line 47)
Correct defensiveness, but it means a corrupt persisted override is shown as gray with no signal that it was invalid. Fine for a UI seed; just noting the silent coercion. No change needed. (Reviewer marked "No change needed"; agreed — left as-is.)

## What's GOOD
- **Pure, immutable, total.** Every mutator returns a new object (`{...overrides, [key]: ...}` / `delete` on a copy); no in-place mutation; early-return identity when nothing changes (`if (key in overrides) return overrides`) is a nice touch that keeps referential equality stable for unchanged maps.
- **Validation at the boundary**: `isHexColor` gates every write, `normalizeHex` canonicalizes — invalid input can never enter the map. This is exactly right for a model.
- **Honest, minimal types** (`OverrideRow`) and clear single-purpose functions; trivially unit-testable (and is tested).
- **The `role` field name carrying a `<tag>|<prop>` key** is documented (line 36) — slightly confusing name, but the comment owns it.

## Top 3 concrete changes
1. **Give the `<tag>|<prop>` override map its own type alias** (template-literal keyed) so it's not interchangeable with the role-key `RoleOverrides` — the cleanest place in the codebase to start fixing the overloaded-overrides-type theme.
2. **Export a shared `parseOverrideKey`** and use it in both this model and (where possible) the content script, so the key grammar is parsed in one place.
3. Nothing else — this file is essentially done. Consider it the reference for the rest.
