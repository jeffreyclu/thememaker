# Review: `src/lib/scheme/site-state.ts`

**Reviewed:** 2026-06-26
**Purpose:** Pure per-site state reducer (`siteStateReducer`) + the content-script auto-reapply `loadDecision`. The unit-tested brain of the per-site persistence path.

## LOC
42 non-comment / non-blank lines. Well within ≤200.

## Findings

No blocking/high findings. This is a clean, pure, well-documented reducer + decision function. A prior full audit (see `reviews/lib/site-state.ts.md`, the pre-move version) already collapsed `SiteAction` to the single `enable` variant and removed dead actions; that cleanup is reflected here.

### Correctness (verified against consumers)
- `siteStateReducer` (24-42) is pure and immutable: it spreads `{ ...state, ... }` and never mutates the input. The `enable` branch correctly preserves a prior `savedScheme` when no scheme is supplied, and **only adds the `savedScheme` key when there is something to remember** (35-37) — so it never writes an `undefined` key that storage would have to strip. Confirmed the sole production dispatch matches: `src/popup/client/scheme-client.ts:115-116` calls `siteStateReducer(state, { type: "enable", ... })`.
- The `default` branch (39-41) returns `state` unchanged — exhaustive and safe; with the single action type there is no fall-through risk.
- `loadDecision` (61-85) is total and conservative: returns `{ apply: false }` when `state` is null/disabled, **or when the saved scheme carries no concrete `palette`** (72-74) rather than guessing — correct, and the comment explains the popup re-saves a full palette next apply. Intensity is clamped (76); overrides are carried only when non-empty (80-83). `LoadDecision` as a discriminated union means a consumer cannot read `palette` without first checking `apply`. Good type design.
- **Reset interaction is correct.** The popup's `onReset` (`useApplyScheme.ts:80-83`) writes `{ enabled: false, savedScheme: undefined }` directly to storage, bypassing the reducer; storage's `definedOnly` strips the `undefined`, so a subsequent `getSiteState` returns `{ enabled: false }` and `loadDecision` returns `{ apply: false }`. The chain is sound. The comment at 18-20 documenting that the popup owns this "full reset" is accurate.

### Notes (non-blocking)
- **[Low] `loadDecision`'s "overrides → omit when empty" options-build is duplicated in ~3 other places.** `file:src/lib/scheme/site-state.ts:80-83` repeats the `overrides && Object.keys(overrides).length > 0 ? { intensity, overrides } : { intensity }` shape also seen in `scheme/transforms.ts` (`resolveOverrides` + `applyPayloadForScheme`) and the content/engine option assembly. A shared `applyOptions(intensity, overrides)` builder would collapse them. Cross-file nit, deferred — no defect in this file.

## Naming / comments / architecture
- Names are domain-correct (`siteStateReducer`, `loadDecision`, `LoadDecision`, `SiteAction`). "Reducer" is a generic pure-function term here, not React/Redux coupling — the reducer takes plain data and is dispatched by a plain client, no hook. Acceptable in lib.
- Comments are logic-only and accurate; references to `Storage.getSiteState`/`setSiteState`, `src/content/index.ts`, and popup `onReset` all resolve to real current code (verified). No stale paths.
- **Domain fit — does `site-state` belong in `scheme/`?** Defensible. `loadDecision` and the reducer both operate on `SiteState.savedScheme` (a `Scheme`) and produce a `palette` + `ApplyOptions` — i.e. they are scheme-shaped transforms of persisted state, not storage I/O. The file is pure (no `chrome.*`), unlike `lib/storage` which owns the actual persistence. Living next to the other scheme transforms is reasonable. (One could argue it is "per-site domain" rather than "scheme domain," but it has no better home and the coupling is to `Scheme`/`Palette`, so `scheme/` fits.) `SiteState` itself is correctly defined in `lib/storage` and imported here as a type — the persistence shape stays with storage, the logic over it stays here. Good separation.
- Imports only `types` and type-only `Palette`/`SiteState` — no DOM, no `chrome.*`, no popup/picker. Clean.
