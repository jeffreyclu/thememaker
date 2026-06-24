# Review: `src/types.ts`

**Purpose:** Shared domain types — `ColorMode`, `Intensity` (+ `clampIntensity`/`MIN_INTENSITY`/`DEFAULT_INTENSITY`), `RoleOverrides`, `ApplyOptions`, `HtmlElements`, `SchemeDetails`, `Scheme`.
**LOC:** 104.

## Overall grade: **C+**

Well-documented and the intensity helpers are clean. But this file is the SOURCE of two of the codebase's most pervasive type problems: the unsound `Scheme` index signature (which forces `value as string` casts in four files) and the over-loose `RoleOverrides = Record<string,string>` (which serves two incompatible key grammars). `ColorMode = string` and the dead `HtmlElements` round out the issues. The types being "intentionally permissive" is stated — but that permissiveness is exactly what leaks casts everywhere.

## Findings

### [high] `Scheme`'s index signature `[tag: string]: string | SchemeDetails | undefined` is the root of the codebase's `as string` casts
Lines 101–104. `Scheme = { schemeDetails: SchemeDetails; [tagName: string]: string | SchemeDetails | undefined }`. This mixes the metadata key (`schemeDetails`) and arbitrary tag-color keys into one index type, so any iteration over a scheme yields `string | SchemeDetails | undefined` and every consumer must cast: `schemeDetailRows` (state.ts) `value as string`, `schemeSwatches` (view.ts) `value as string`, `buildSchemeStyle` (theme-engine.ts) `value as string` + `scheme["p"] as string`, `schemeFromPalette` (engine-bridge.ts) `{ } as Scheme`. The unsoundness is DEFINED here and PAID FOR in four files.

**Why it matters:** Honest types, codebase-wide. The comment calls this "loosely typed on purpose" (104) — but "on purpose" doesn't make the four downstream blind casts safe; it just relocates the blame here.

**Concrete fix:** Split the two concerns: `interface Scheme { schemeDetails: SchemeDetails; colors: Record<string, string> }`. Iterating `scheme.colors` is then type-safe with no casts, and `schemeDetails` is a normal field. This one change removes blind casts from state.ts, view.ts, engine-bridge.ts (and obviates them in the doomed theme-engine.ts). It's the single highest-leverage type fix in the repo.

### [medium] `RoleOverrides = Record<string,string>` is too loose and serves two incompatible key grammars
Line 54. Documented as "semantic ROLE key → hex" (e.g. `heading`, `link`). But in practice the SAME type also carries the picker's `<tag>|<prop>` keys (e.g. `div|background`) — see picker-panel-model.ts, pick.ts, the inject.ts override block. So one type means two disjoint things depending on producer, and nothing distinguishes them.

**Why it matters:** Honest types / interface segregation. A `RoleOverrides` value could be `{heading:'#...'}` OR `{div|background:'#...'}` and the type can't tell you which — the two consumers (role-application vs tag-CSS) silently no-op on the wrong grammar.

**Concrete fix:** Two types: `type RoleOverrides = Partial<Record<keyof PaletteRoles, string>>` and `type TagOverrides = Record<TagPropKey, string>` (template-literal keyed). `ApplyOptions.overrides` then declares which it carries. This also lets `applyOverridesToRoles` (mapping.ts) drop its `as unknown as` casts.

### [medium] `ColorMode = string` discards a known finite taxonomy
Line 9. The modes are exactly the seven in `config.modes` / `harmonyHues`. Typing it `string` means typos compile, the popup `<select>` value isn't checked, and `harmonyHues`'s `default` silently swallows unknowns.

**Why it matters:** Honest types. A closed enum typed as open `string`.

**Concrete fix:** `export type ColorMode = 'monochrome' | 'monochrome-dark' | 'monochrome-light' | 'complement' | 'analogic-complement' | 'triad' | 'quad';` — one source of truth for `config.modes`, the palette switch, and the select.

### [low] `HtmlElements` type exists only for the dead v1 engine
Line 71. `HtmlElements = Record<string,string[]>` is imported only by `theme-engine.ts` (dead) and `config.htmlElements` (dead). Delete with the v1 engine.

### [low] `Intensity = number` and `ColorMode = string` are bare aliases that add doc but no constraint
`Intensity = number` (24) carries great doc comments but no nominal typing — any number is an `Intensity`. `clampIntensity` is the real guard. Acceptable (TS has no cheap nominal types), but the alias is documentation, not enforcement.

## What's GOOD
- **The intensity helpers are clean and correct**: `clampIntensity` handles non-finite input (`Number.isFinite(n) ? n : DEFAULT`), rounds, and clamps to `[MIN, 100]` — a proper total function with `MIN_INTENSITY`/`DEFAULT_INTENSITY` as named constants. The "0 is not selectable, here's why" reasoning is excellent.
- **Documentation is outstanding** — every type explains its role, the override-AA-floor contract, the legacy-palette-optional rationale, the intensity semantics. This is the most thoroughly-explained type file you'll see.
- **`ApplyOptions` and `SchemeDetails`** are sensible domain shapes; making `palette`/`intensity`/`overrides` optional on `SchemeDetails` with documented legacy reasons is the right call for migration tolerance.

## Top 3 concrete changes
1. **Restructure `Scheme`** to `{ schemeDetails; colors: Record<string,string> }` — kills the unsound index signature and the `value as string` casts in four downstream files. Highest-leverage fix in the repo.
2. **Split `RoleOverrides`** into a role-keyed type and a `<tag>|<prop>`-keyed `TagOverrides`, so the two override grammars are type-distinct and `applyOverridesToRoles` loses its `as unknown as`.
3. **Make `ColorMode` a union** and delete the dead `HtmlElements` type with the v1 engine.
