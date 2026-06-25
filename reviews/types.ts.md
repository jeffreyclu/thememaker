# Review: `src/types.ts`

**Purpose:** Shared domain types — `ColorMode`, `Intensity` (+ `clampIntensity`/`MIN_INTENSITY`/`DEFAULT_INTENSITY`), `RoleOverrides`, `ApplyOptions`, `HtmlElements`, `SchemeDetails`, `Scheme`.
**LOC:** 104.

## Overall grade: **C+**

Well-documented and the intensity helpers are clean. But this file is the SOURCE of two of the codebase's most pervasive type problems: the unsound `Scheme` index signature (which forces `value as string` casts in four files) and the over-loose `RoleOverrides = Record<string,string>` (which serves two incompatible key grammars). `ColorMode = string` and the dead `HtmlElements` round out the issues. The types being "intentionally permissive" is stated — but that permissiveness is exactly what leaks casts everywhere.

## Findings

- [x] FIXED: `Scheme`'s index signature `[tag: string]: string | SchemeDetails | undefined` is the root of the `as string` casts. Split into `interface Scheme { schemeDetails: SchemeDetails; colors: Record<string,string> }`. Iterating `scheme.colors` is now type-safe with NO casts. Removed the `value as string` casts in `state.ts` (`schemeDetailRows`) and `view.ts` (`schemeSwatches`), and the index write in `engine-bridge.ts` (`schemeFromPalette` builds a `colors` map). `theme-engine.ts`'s casts died with the dead engine. The single highest-leverage type fix in the repo.

- [x] FIXED (re-scoped after verification): `RoleOverrides` "serves two incompatible key grammars". VERIFIED the real picture: the live `inject.ts` engine DEFENSIVELY accepts BOTH grammars from the same `options.overrides` map — role keys (`k in roles`) are applied to `roles` (lines 492-500), and `<tag>|<prop>` keys are emitted as the override CSS layer (lines 1377-1431). But the ONLY production PRODUCER is the picker (`pickKeyFor`), which emits `<tag>|<prop>` keys; the role-keyed branch is a forward-looking capability nothing currently feeds (the dead role-keyed `applyOverridesToRoles` lived in the now-deleted `mapping.ts`). So splitting into two STRICT types would over-constrain a deliberately-permissive seam whose map can legitimately hold mixed keys that each consumer filters. Resolution: kept `RoleOverrides = Record<string,string>` (honest for a mixed-grammar map) but documented it precisely — added a `TagPropKey` template-literal type for the dominant grammar and re-wrote the doc to describe the `<tag>|<prop>` keys the picker emits and the engine parses defensively. Kept the exported NAME `RoleOverrides` so no rename ripples into other agents' popup files.

- [x] FIXED: `ColorMode = string` discards a known finite taxonomy. Now a union of the seven modes — one source of truth for `config.modes`, the palette switch, and the popup `<select>`. Typos now fail to compile.

- [x] FIXED: `HtmlElements` type existed only for the dead v1 engine. Deleted it along with `config.htmlElements` and `theme-engine.ts`.

- [x] VERIFIED-INVALID (acceptable, left as-is): `Intensity = number` is a bare alias with no nominal constraint. TS has no cheap nominal types; `clampIntensity` is the real total-function guard. The review itself called this "acceptable". Left as documentation-with-a-guard.

## What's GOOD
- **The intensity helpers are clean and correct**: `clampIntensity` handles non-finite input (`Number.isFinite(n) ? n : DEFAULT`), rounds, and clamps to `[MIN, 100]` — a proper total function with `MIN_INTENSITY`/`DEFAULT_INTENSITY` as named constants. The "0 is not selectable, here's why" reasoning is excellent.
- **Documentation is outstanding** — every type explains its role, the override-AA-floor contract, the legacy-palette-optional rationale, the intensity semantics. This is the most thoroughly-explained type file you'll see.
- **`ApplyOptions` and `SchemeDetails`** are sensible domain shapes; making `palette`/`intensity`/`overrides` optional on `SchemeDetails` with documented legacy reasons is the right call for migration tolerance.

## Top 3 concrete changes
1. **Restructure `Scheme`** to `{ schemeDetails; colors: Record<string,string> }` — kills the unsound index signature and the `value as string` casts in four downstream files. Highest-leverage fix in the repo.
2. **Split `RoleOverrides`** into a role-keyed type and a `<tag>|<prop>`-keyed `TagOverrides`, so the two override grammars are type-distinct and `applyOverridesToRoles` loses its `as unknown as`.
3. **Make `ColorMode` a union** and delete the dead `HtmlElements` type with the v1 engine.

## RE-REVIEW (post-fix audit)

- CONFIRMED FIXED: `Scheme` is now `{ schemeDetails: SchemeDetails; colors: Record<string,string> }` (types.ts:127-131). Every read site (`state.ts:258 schemeDetailRows`, `view.ts:237 schemeSwatches`, `color-source.ts:55`) and every build site (`engine-bridge.ts schemeFromPalette`, `content/index.ts:218`) is cast-free. Build + 259 unit + 31 e2e all green.
- CONFIRMED FIXED: `ColorMode` union, `HtmlElements`/`htmlElements` deleted (grep: zero refs), `RoleOverrides`/`TagPropKey` documented. All accurate.
- VERIFIED-INVALID re-check (`Intensity = number`): agree, correctly invalid.
- NEW (robustness NOTE, known/accepted decision — flagged once): `colors` is now a REQUIRED field with no optionality and no read-side guard. A persisted `Scheme` (favorite/history/savedScheme) written before this split, or any hand-edited storage, lacks `.colors` and HARD-CRASHES `Object.entries(scheme.colors)`/`Object.values(scheme.colors)` with `TypeError: Cannot convert undefined or null to object` (reproduced). Because `render()` runs synchronously inside `dispatch` with NO try/catch, this white-screens the popup on hydrate. The chosen remediation is "clear storage" (legacy unsupported) — accepted per charter. Residual risk noted: a one-line guard (`Object.entries(scheme.colors ?? {})` at the two read sites, or `colors?: Record<string,string>` + `?? {}`) would turn an unrecoverable popup crash into graceful degradation (swatches just don't render) for ~zero cost. Recommend recording as a decision either way.
