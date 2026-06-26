# Review: `src/lib/engine/engine-observe.ts`

**Purpose:** Pure MutationObserver batch parsing (`parseMutations`) + the live observer factory (`createSurfaceObserver`) + `isOwnElement`. Decides which subtrees a batch touched, which recycled elements must drop their stale frozen original, and pre-paints in-viewport mutations synchronously.

**LOC:** 71 non-comment, non-blank lines. Within the ≤200 limit.

## Findings

### NOTE — `parseMutations` adds added-node roots without checking ancestry (`engine-observe.ts:47-53`)
For a `childList` mutation, every added `HTMLElement` is added to `roots`, even if its parent was *also* added in the same batch (so it's already covered by the parent's subtree flatten). The downstream `expand`/`doneSet` dedupes the actual painting, so this is correctness-safe, but a large insert can push N redundant roots that each get re-flattened.
**Why it's only a NOTE:** `doneSet` makes the overlap cheap no-ops, and over-collecting roots is safer than under-collecting (missing a node = unthemed). Defensible.
**Fix (optional):** Skip an added node whose `parentElement` is already in `roots`. Marginal.

### NOTE — `recaptured` elements are also added to `roots`, so they re-theme even if unchanged-color (`engine-observe.ts:55-62`)
An attribute (`class`/`style`) mutation on a non-done element drops its frozen original *and* re-themes it. If the swap didn't actually change the background, this re-captures + re-emits an identical rule. Bounded by `attributeFilter: ["class","style"]` and the not-`doneSet` guard (themed surfaces are frozen and skipped). Acceptable — re-capture is the whole point for virtualized-row recycling.

## Correctness — verified clean
- `isOwnElement` excludes all three engine `<style>` ids — the observer never re-themes its own output, preventing an infinite mutation loop. This is load-bearing and correct. ✔
- The observer **disconnects across its own pre-paint writes** (line 96) and reconnects after (line 102-104) — so the attribute/style writes from `paintViewport` don't re-enter the queue. ✔
- `[...roots].filter((el) => el.isConnected)` (line 97) drops nodes removed later in the same batch — no painting detached nodes. ✔
- `getCtx()` null-guard (line 99): before the first apply there's no context, so roots pass through to the deferred path untouched. ✔

## Naming / duplication / architecture
- Names clear (`MutationBatch`, `roots`/`recaptured`, `ObserverDeps`). 
- No color math. No `popup`/`picker` import — the `ObserverDeps` callback bundle keeps the Engine's state injected rather than imported, a clean seam. ✔
- `parseMutations` is `export`ed but used only inside this module + its own tests-via-public-entry (0 external importers, verified). Same class of "test-seam export" the REVIEW_LOG already flagged project-wide as LOW; carrying it forward as a NOTE, not re-grading.

## Comment quality
- Logic-only, accurate, and explains the *why* of the disconnect/reconnect dance and the recycled-original recapture. No stale paths.
