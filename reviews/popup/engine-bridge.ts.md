# Review: `src/popup/engine-bridge.ts`

**Purpose:** Glue from the popup to the palette engine. Resolves dropdown selection → seed + mode, generates a palette (online API with fallback / local), builds display `Scheme`s for history, and resolves apply payloads (palette + options) for new/history/favorite/inverted schemes.
**LOC:** 215.

## Overall grade: **A-**

A clean bridge: mostly-pure functions, dependencies INJECTED (`online`, `deps`, `seed`, `overrides` all parameters, not hard-wired), no `chrome.*`, an explicit "NEVER throws" generation contract with a real fallback. The marks against it are the `{...} as Scheme` cast feeding the dynamic-key `Scheme` map, and a small family of `schemeXxx` functions whose palette-resolution logic (`details.palette ?? localPalette(...)`) is repeated three times.

## Findings

- [x] VERIFIED-INVALID (already resolved by the foundation pass): `schemeFromPalette` no longer uses `as Scheme`. `Scheme` now carries an explicit `colors: Record<string,string>` map (types.ts), so it builds `{ schemeDetails, colors }` with no cast, and the read-side `value as string` casts in state.ts/view.ts are gone.

### [medium] `schemeFromPalette` builds a `Scheme` via `{ ... } as Scheme` then mutates dynamic keys
Lines 69–76: `const scheme = { schemeDetails: details } as Scheme;` then `palette.themeColors.forEach((tc) => { scheme[tc.role] = tc.color; })`. The `as Scheme` asserts a half-built object is complete, and the loop writes arbitrary string keys onto it. This is the construction side of the unsound `Scheme` index-signature (flagged in types.ts/state.ts/view.ts) — every consumer then has to cast on the read side.

**Why it matters:** Honest types, codebase theme. The `Scheme` shape `{ schemeDetails } & Record<string,string>` is the root cause of `value as string` casts in three other files. Building it here with `as Scheme` is where the unsoundness is injected.

**Concrete fix:** Model `Scheme` as `{ schemeDetails: SchemeDetails; colors: Record<string,string> }` (or just carry the palette and derive display colors on demand). Then `schemeFromPalette` becomes `{ schemeDetails, colors: Object.fromEntries(palette.themeColors.map(tc => [tc.role, tc.color])) }` with no cast, and the read-side casts in state/view disappear too. This single type change cleans up four files.

- [x] FIXED: Extracted `resolvePalette(details)` and used it in `applyPayloadForScheme` + `schemeWithIntensity`. Left `invertScheme` as-is: it guards `if (!details.palette) return scheme` and uses the palette directly (no legacy regeneration), so `resolvePalette` doesn't apply there.

### [low] Palette-resolution `details.palette ?? localPalette(details.rootColor, details.colorMode)` is repeated in 3 functions
`applyPayloadForScheme` (172–173), `schemeWithIntensity` (197–198), and conceptually `invertScheme` (146–149) all do the same "use stored palette or regenerate locally for legacy schemes" dance.

**Why it matters:** DRY. The legacy-fallback rule lives in three places; a change to how legacy schemes resolve palettes must touch all three.

**Concrete fix:** Extract `resolvePalette(details): Palette` once and call it from all three.

- [x] FIXED: Extracted `resolveOverrides(details, overrides)` that owns the "explicit wins, else stored, empty → undefined" normalization. Both `applyPayloadForScheme` and `schemeWithIntensity` now call it; the latter's `...(hasOverrides ? {overrides} : {overrides: undefined})` spread trick is gone (replaced by a plain `overrides: resolved`, serialization-identical since an `undefined` value is dropped by storage).

### [low] `overrides ?? details.overrides` + "empty map → undefined" convention is duplicated and subtle
`applyPayloadForScheme` (177–181) and `schemeWithIntensity` (204–212) both resolve overrides the same way, and the latter encodes "empty → drop the key" via the `...(hasOverrides ? {overrides} : {overrides: undefined})` spread. The `overrides: undefined` spread trick (to delete vs include) is clever but non-obvious, and it's the same "represent absence" inconsistency seen in content/index.ts.

**Why it matters:** Readability + a codebase-wide inconsistency in how "no overrides" is represented (omit key vs `undefined` vs `{}`).

**Concrete fix:** A small `withOverrides(details, resolved)` helper that owns the empty→absent normalization, used by both; and align on ONE absence representation project-wide.

- [x] VERIFIED-INVALID: No double-`#`. Line 49 is `randomHexColor()` with nothing prepended, and `randomHexColor` (lib/random.ts) already returns a full `#rrggbb`. The review quoted code that doesn't exist; the current code is correct and consistent.

### [nit] `resolveSeed` returns `\`#${randomHexColor()}\`` while `randomHexColor` apparently returns no `#`
Line 49. The bridge prepends `#` to `randomHexColor()`, implying `randomHexColor` returns bare hex. Minor inconsistency in where the `#` lives (compare `resolveMode`/`localPalette` which deal in full hex). Worth confirming `randomHexColor`'s contract is "no #" and is used consistently (it's in theme-engine.ts — will verify there).

## What's GOOD
- **Dependencies are injected, not hard-wired.** `online`, `deps` (fetch+cache), `seed`, `intensity`, `overrides` are all parameters. `generateForSelection` takes the online-ness as input rather than reading `navigator.onLine` itself — that's proper DIP and makes it testable. This is the cleanest example of side-effect injection in the codebase.
- **Explicit total/throwing contracts**: `resolveSeed` "Pure + total: always returns a normalized #rrggbb"; `generateForSelection` "NEVER throws" with a documented fallback. These guarantees are stated and honored.
- **Legacy-scheme handling is consistent and intentional** — every consumer regenerates a palette locally for pre-Phase-2 history entries, so old history stays re-applyable.
- **Small, single-purpose functions** (`modesForSelection`, `resolveMode`, `resolveSeed`, `invertScheme`, `applyPayloadForScheme`, `schemeWithIntensity`) — easy to test, and they are tested.

## Top 3 concrete changes
1. **Fix the `Scheme` type at the root** (separate `colors` map from `schemeDetails`) so `schemeFromPalette` stops using `as Scheme` and the downstream `value as string` casts vanish across state.ts/view.ts.
2. **Extract `resolvePalette(details)`** to dedupe the legacy-fallback palette resolution repeated in three functions.
3. **Unify the "no overrides" representation** with a shared `withOverrides` helper instead of the `overrides: undefined` spread trick, and align the project on one absence convention.
