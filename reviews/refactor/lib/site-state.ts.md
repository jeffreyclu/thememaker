# Refactor plan — `src/lib/site-state.ts`

**Non-comment LOC: 42.** Verdict vs ≤200: **PASS.**

Pure per-site state reducer (`siteStateReducer`) + the content-script `loadDecision`. No DOM/`chrome.*`, fully testable (`site-state.test.ts`, `content.test.ts`, `site-persistence.test.ts`). Tiny and cohesive. No split needed.

## Duplication found
- The "overrides present?" guard (`overrides && Object.keys(overrides).length > 0 ? {intensity,overrides} : {intensity}`, lines 81–84) is the same "empty → drop the key" convention implemented in `engine-bridge.ts` (`resolveOverrides`) and `content/index.ts` (`optionsFor`). Minor; if consolidated, a `lib/apply-options.ts` `withOverrides(intensity, overrides)` helper would own it. Low priority — three ~3-line call sites; not a blocker. Note in the de-dup backlog, not Phase 0.

## Long functions
None. `loadDecision` (62–86, ~22 LOC) is appropriately compact.

## Ordered steps
No action required. Optionally fold the apply-options guard into a shared helper alongside the override-grammar work (very low priority).
