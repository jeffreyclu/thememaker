# Review: `src/lib/engine/engine-walk.ts`

**Purpose:** The stateless body of the time-sliced surface walk: flatten+queue a subtree (`enqueueInto`), drain one budgeted slice (`drainSlice`), and the observer's synchronous in-viewport pre-paint pass (`paintViewport`). The Engine owns the queue/scheduling; this module takes it explicitly.

**LOC:** 124 non-comment, non-blank lines. Within the ≤200 limit.

## Findings

### NOTE — `enqueueInto` calls `expand()` then re-checks `els.length`, but `expand` already walked the subtree (`engine-walk.ts:49-67`)
The early skip on line 49 (`doneSet.has(rootEl) && querySelectorAll("*").length === 0`) does one `querySelectorAll("*")` (cost = subtree size), then `expand(rootEl)` on line 52 does a *second* full `querySelectorAll("*")`. For a fully-done leaf the first guard returns early (cheap), but for any non-leaf both walks run.
**Why it's only a NOTE:** `enqueueInto` runs per added-subtree (observer) or once for the body (initial), not per element, so the double-walk is amortized small. Still, it's a redundant DOM traversal in a path that handles SPA bursts.
**Fix (optional):** Drop the `querySelectorAll("*").length === 0` probe; let `expand` run and short-circuit on its result length, or have `expand` return early when the root is done+childless. Minor.

### NOTE — `paintViewport` re-enqueues the *whole* subtree on any deferral (`engine-walk.ts:156-161`)
When any element in a root's subtree is off-screen or hits the sync `budget`, the entire `root` is pushed to `deferred` (line 160), and `deferOffscreen`→`flush`→`enqueueInto` later re-flattens and re-walks it. The comment correctly notes `doneSet` makes already-themed nodes cheap no-ops — but they are still re-flattened by `expand` and re-iterated.
**Why it's only a NOTE:** Documented, bounded by `doneSet`, and the re-walk only re-processes the genuinely-deferred tail. Correct, just not minimal. Acceptable for the SPA-churn use case.

## Correctness — verified clean
- `drainSlice` time-slicing: `MAX_NODES_PER_SLICE` (400) OR (`processed >= 64 && elapsed >= SLICE_BUDGET_MS`) — the `>= 64` floor guarantees forward progress even if `now()` is coarse. ✔
- The `WorkItem` cursor (`i`) lets a slice pause mid-subtree and resume — `work.shift()` only when `item.i >= item.els.length`. The `outer:` label + the partial-shift on line 100 are correct. ✔
- Budget short-circuit: `themedCount >= MAX_THEMED` clears the queue (`work.length = 0`) at slice entry and after the budget bump — no unbounded growth. ✔
- `enqueueInto` splits large prioritized subtrees into visible-first + rest (lines 57-67); the `< 200` threshold skips the split cost for small subtrees. ✔

## Naming / duplication / architecture
- Names clear (`drainSlice`, `paintViewport`, `enqueueInto`, `WorkItem`). The magic numbers (`SLICE_BUDGET_MS=4`, `MAX_NODES_PER_SLICE=400`, `SYNC_CAP=600`, the `200`/`64` literals) are mostly named constants; the inline `200` (line 53) and `64` (line 98) are bare literals — minor, each has an adjacent explanatory comment.
- No color math here. No `popup`/`picker` import.
- `EDITABLE_SEL` re-exported (line 23) so the Engine has one import surface — legitimately used by `index.ts` (`flush`), not over-wide.

## Comment quality
- Logic-only, accurate, explains the slice/cursor/defer model well. No stale paths or history.
