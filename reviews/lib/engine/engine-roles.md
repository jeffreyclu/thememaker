# Review: `src/lib/engine/engine-roles.ts`

**Purpose:** Resolves a generated `Palette` + `ApplyOptions` into the concrete `ResolvedRoles` value object (role colors, intensity `factor`, `themedBase`, tinted banner/comp bgs, the `roleText` AA-floor closure) that every downstream engine module reads. Pure derivation, no DOM.

**LOC:** 111 non-comment, non-blank lines. Within the ≤200 limit.

## Findings

### MEDIUM — Dead re-export `export { luminanceBucket }` (`engine-roles.ts:152-153`)
The trailing `export { luminanceBucket }` (re-exported "so role-keyed remap can bucket a detected var's value") has **zero importers**. Verified: the only consumer, `lib/color/css-var-remap.ts:14`, imports `luminanceBucket` *directly from `../color`*, not from `engine-roles`. Nothing imports it from this module.
**Why it matters:** Over-wide/dead export and a misleading comment — it implies a dependency edge (engine-roles → css-var-remap) that doesn't exist, and `luminanceBucket` is then imported *and re-exported* purely to dangle.
**Fix:** Delete line 153 (and its comment). The local `import { luminanceBucket }` on line 16 is also unused inside this file once the re-export goes — drop `luminanceBucket` from the line-16 import too, leaving `import { nudgeToAA } from "../color"`.

### LOW — `parseCssColor(v)` called twice for the same value (`engine-roles.ts:100-102`)
```ts
if (k in roles && parseCssColor(v)) {
  const rgb = parseCssColor(v) as [number, number, number];
```
`parseCssColor(v)` runs twice per override key — once for the truthiness guard, once for the value — plus an `as` cast to launder the second result. This is the override-application loop, not a per-element hot path (it runs once per apply over a handful of keys), so perf is negligible, but it's redundant work and an avoidable cast.
**Fix:**
```ts
const rgb = parseCssColor(v);
if (k in roles && rgb) {
  (roles as Record<string, string>)[k] = rgbTupleToHex(rgb);
}
```
Single parse, no cast.

## Naming
- Clear and consistent (`role*`, `surfaceFor`, `themedBase`, `factor`). Good.

## Duplication / color math
- **Clean.** All color work defers to `lib/color` (`nudgeToAA`, `mixCss`, `parseCssColor`, `rgbTupleToHex`). No reimplemented math. The `intensity → factor` clamp (lines 120-121) is trivial domain logic, not color math.

## Architecture fit
- Good. No `popup`/`picker` import; imports only `../color`, `../palette` (type), `../../types`. Pure, no DOM.

## Comment quality
- Logic-only and accurate, except the stale-edge comment on the dead re-export (see MEDIUM). The big `baseRoles` inline `Partial<{...}>` type (lines 78-92) is a 14-line structural type duplicated from the palette's role shape — not a finding per se, but if `Palette["roles"]` is already typed upstream, importing that type instead of re-declaring it here would remove a drift risk. Verify against `../palette`.
