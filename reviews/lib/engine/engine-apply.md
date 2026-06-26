# Review: `src/lib/engine/engine-apply.ts`

**Purpose:** The per-apply resolution step — pure "palette + options → base CSS rules + surface paint context", so the `Engine` class stays a thin scheduler. Runs role/var/surface resolution, captures the frozen body original, caches the base bg for next-load early paint, returns `baseParts` + `surfaceCtx`.

**LOC:** 62 non-comment, non-blank lines. Within the ≤200 limit.

## Findings

No blocking/high findings.

### NOTE — `baseBackground` template-literal assembly with `!important` is duplicated for `html` and `body` (`engine-apply.ts:94-97`)
The two pushed rules are byte-identical except the selector. Trivial; a one-line `for (const sel of ["html","body"])` would dedupe, but the explicit pair is arguably clearer. Optional.

### NOTE — Hardcoded `#ffffff` fallback when `document.body` bg is null (`engine-apply.ts:61-64`)
`mixCss(bodyOriginal.bg || "#ffffff", themedBase, factor)` assumes a white default base when the body has no captured background. Reasonable default, but means a site with a transparent/unset body bg always blends *from* white regardless of the real (e.g. dark) `<html>` background. Minor visual-accuracy note, not a correctness bug; the early-paint cache and full-intensity case mask it.

## Correctness — verified clean
- Body original captured through the Engine's `originals` WeakMap (line 58-60) with a safe `{bg:null,...}` fallback when `document.body` is absent (early apply). ✔
- `writeBaseCache(baseBackground)` (line 68) caches the *resolved blended* base — matches what `index.ts preventReloadFlash` repaints next load. Contract between the two modules is consistent. ✔
- `baseText` floored against the deterministic `themedBase`, not the blended base (line 71) — so base ink is identical at every intensity/reload, as the comment claims. Verified against `roleText` semantics. ✔
- `:root` var decls only pushed when non-empty (line 91-93); the var-driven/`factor>=1` gating lives correctly in `buildVarDecls` (in `lib/color/css-var-remap`), not duplicated here. ✔

## Naming / duplication / architecture
- Names clear (`resolveApply`, `ResolvedApply`, `baseParts`, `surfaceCtx`). 
- **No color-math duplication** — only `mixCss` from `../color/css-color`; everything else is delegated to `engine-roles`/`css-var-remap`/`role-rules`/`role-classify`. This file is pure orchestration. ✔
- Imports `../storage/base-cache` (write) — appropriate; no `chrome.*` leaks (base-cache wraps `localStorage`). No `popup`/`picker` import.

## Comment quality
- Logic-only, accurate, explains the base-ink-vs-blended-base subtlety that would otherwise look like a bug. No stale paths.
