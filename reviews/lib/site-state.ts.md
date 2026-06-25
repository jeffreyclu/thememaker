# Review: `src/lib/site-state.ts`

**Purpose:** Pure per-site state reducer (`siteStateReducer`) and the content-script load decision (`loadDecision`) — the unit-tested core of the per-site auto-reapply path.
**LOC:** 101.

## Overall grade: **A**

A small, pure, well-tested reducer with a clean discriminated-union action type and a thoughtfully-designed `loadDecision` verdict. Immutable transitions, sensible "disable keeps savedScheme" semantics, legacy-scheme handling, and a clear pure/IO split. Nearly nothing to fault.

## Findings

- [x] FIXED: grep confirmed the ONLY production dispatch is `{ type: "enable" }` (popup `persistTheme`); `disable`/`toggle`/`rememberScheme`/`forgetScheme` had no production caller (only tests dispatched them — the false-coverage pattern). Collapsed `SiteAction` to the single `enable` variant and removed the dead reducer branches + default-passthrough recursion. Updated `tests/site-state.test.ts` and `tests/site-persistence.test.ts` to exercise the REAL transitions (`enable`, and the popup's raw `setSiteState` reset) instead of the dead actions. Build/test/lint green.

### [low] `SiteAction` has five variants but only `enable`/`disable` appear used; `toggle`/`rememberScheme`/`forgetScheme` may be speculative
The reducer handles `enable`, `disable`, `toggle`, `rememberScheme`, `forgetScheme`. The popup uses `enable` (via `persistTheme`) and writes `{enabled:false, savedScheme:undefined}` directly on reset (NOT via the `disable` action). Worth confirming `toggle`/`rememberScheme`/`forgetScheme` have real callers — if not, they're speculative generality (open/closed over-design).

**Why it matters:** Over-engineering. A reducer action with no dispatcher is dead surface that still must be maintained/tested.

**Concrete fix:** Grep for each action's dispatch; delete any with no production caller. `toggle` recursing into `enable`/`disable` is elegant but pointless if nothing dispatches `toggle`. (Tests may dispatch them — but tests covering unused actions is exactly the false-coverage pattern seen in theme-engine.ts.)

- [x] VERIFIED-INVALID (resolved by the removal above): "route reset through the reducer" would mean re-adding the `disable`/`forgetScheme` actions I just deleted as dead surface — contradictory. The popup OWNS the full-reset (off + forget) as a recorded behavior and writes it directly; with only `enable` left, the reducer is no longer the place for it. Documented the popup's ownership in a code comment on `SiteAction`.

### [low] `onReset` in popup bypasses the `disable`/`forgetScheme` actions and writes raw state
Observed in popup/index.ts (222–225): reset writes `{ enabled:false, savedScheme:undefined }` directly via `storage.setSiteState`, NOT through `siteStateReducer`. So the reducer's careful "disable keeps savedScheme" semantics are deliberately circumvented by the one place that wants a full forget. That's correct behavior, but it means the reducer and the popup disagree on what "off" means, and the reducer's `disable` action is arguably unused.

**Why it matters:** The reducer exists to centralize site-state transitions, but a key transition (reset = disable + forget) is done outside it. Either route reset through `siteStateReducer(state, {type:'disable'})` + `{type:'forgetScheme'}`, or acknowledge the popup owns the "full reset" case.

**Concrete fix:** Express reset as a reducer action (`{type:'reset'}` or compose `disable`+`forgetScheme`) so ALL site-state transitions go through the pure reducer — single source of truth.

- [x] VERIFIED-INVALID (out of leaf scope): the shared `applyOptions(intensity, overrides)` builder is a cross-file nit spanning content/index.ts + engine-bridge.ts (not in this per-file agent's edit set); extracting it here would only touch one of the four sites. A nit, deferred to whoever owns the cross-cutting options seam. No defect in site-state.ts itself.

### [nit] `loadDecision` and the popup's `optionsFor`/engine-bridge build `options` with the same "empty overrides → omit" logic
Lines 96–99 repeat the `overrides && Object.keys(overrides).length > 0 ? {intensity, overrides} : {intensity}` shape seen in content/index.ts and engine-bridge.ts. Same absence-representation logic in a fourth place.

**Concrete fix:** A shared `applyOptions(intensity, overrides)` builder used everywhere options are assembled.

## What's GOOD
- **Pure and exhaustively tested** — `siteStateReducer` and `loadDecision` take plain data and return plain data, no DOM/chrome, exactly as the docstring promises. The auto-reapply path's brain is unit-testable.
- **"Disable keeps savedScheme"** is a genuinely good product decision (re-enabling restores the last look without re-saving), correctly implemented and clearly explained.
- **`loadDecision` refuses to guess** — legacy schemes without a concrete `palette` return `{apply:false}` rather than regenerating in the page, with a comment explaining the popup re-saves a full palette next apply. Conservative and correct.
- **`LoadDecision` as a discriminated union** (`{apply:false}` | `{apply:true; palette; options}`) makes the consumer's branch type-safe — the content script can't read `palette` without first checking `apply`.
- `toggle` recursing into `enable`/`disable` is a clean way to avoid duplicating their logic (IF it's actually used).

## Top 3 concrete changes
1. **Verify and prune unused actions** (`toggle`/`rememberScheme`/`forgetScheme`) — delete any with no production dispatcher rather than carrying speculative reducer surface.
2. **Route the popup's reset through the reducer** so "off = disable + forget" is expressed as pure transitions, not a raw storage write that bypasses the reducer's semantics.
3. **Share the `applyOptions(intensity, overrides)` builder** to stop re-deriving the "empty overrides → omit" shape in a fourth location.
