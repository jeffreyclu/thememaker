# Review: `src/lib/engine/index.ts`

**Purpose:** The `Engine` class — the long-lived, in-page scheduler that owns all page-theming state (frozen originals, done-set, work queue, observer, the single `<style>`) and wires the helper modules together. Plus the shared `engine` singleton.

**LOC:** 201 non-comment, non-blank lines. **OVER the ≤200 hard limit by 1** (two independent counters agree on 201; the REVIEW_LOG's prior "197" is now stale — the file grew). This is a contract breach, not a rounding artifact.

## Findings

### HIGH — File exceeds the ≤200 non-comment-line hard limit (`index.ts:1-335`, count = 201)
The project's stated standard is ≤200 non-comment lines per file, and this file is the single largest in `src/**`. It is now 201, i.e. just over.
**Why it matters:** It is the explicit, measured gate in the REVIEW_LOG; "just barely over" still fails it, and this file only grows as the engine gains methods.
**Fix:** Pull one cohesive method cluster out to a sibling. The cleanest extraction is the debounced off-screen scheduler — `deferOffscreen` + `flush` + the `pending`/`flushTimer` fields + `DEBOUNCE_MS` (≈ lines 280-304 plus 93-94) — into an `engine-defer.ts` helper that takes the queue/doneSet/drain callback, mirroring how `engine-walk`/`engine-observe` already externalize stateless bodies. That drops ~20 lines and restores headroom.

### NOTE — `draining` flag is a weak re-entrancy guard, not a lock (`index.ts:257-278`)
`drain()` sets `this.draining = true` at entry and `false` at exit of each *synchronous* slice, then reschedules the next slice via `yieldThen`. Between slices `draining` is `false`, so a `flush()` (or `deferOffscreen`→`drain`) firing in the idle gap can call `drain()` while a `yieldThen`-scheduled `drain()` is also pending.
**Why it's only a NOTE:** JS is single-threaded and the scheduled callback re-checks `this.queue.length > 0` (line 273) before recursing, and `processElement` is idempotent via `doneSet`, so the worst case is one redundant empty-queue check, not double-painting. Real but benign.
**Fix (optional):** If you want the guard to mean what its name implies, gate the *rescheduled* `drain` on a single `scheduled` flag instead of re-reading `draining`, or simply document that `draining` only guards synchronous re-entry. No action required for correctness.

### NOTE — `apply()` re-runs the first slice synchronously inside the call (`index.ts:137-142`)
`enqueueInto` + `drain()` run the first walk slice synchronously inside `apply()`. This is intentional (above-the-fold paints before returning) and documented, but on a very large initial `document.body` the synchronous slice is bounded only by `SLICE_BUDGET_MS`/`MAX_NODES_PER_SLICE` in `engine-walk` — fine, just noting the hot path enters here. No change needed.

## Naming / dead code / exports
- Clean. `engine` singleton and `Engine` class are the only exports; both are consumed externally (`content/index.ts`, `picker/index.ts`, `picker/hooks/useApplyOverrides.ts`). Verified.

## Architecture fit
- **Good.** No import of `src/popup` or `src/picker` (verified by grep). Imports only `./engine-*`, `../storage`, `../palette` (type), `../../types`. All color math is delegated downstream (this file does no color math). Boundary respected.

## Comment quality
- Comments are logic-only, accurate, and genuinely useful (the scheduler/observer interplay is non-obvious and the header earns its length). One stylistic nit: the class docstring + the `PUBLIC API` block + per-field comments are extensive; none are wrong, but they are a meaningful share of the file. Since the LOC gate counts only *code*, this doesn't help the 201 overage — only extracting code does.
- No stale paths, no history/analogies, no SCREAMING-CAPS misuse (the caps in prose like `ALL`/`ONE`/`SOLE` are emphasis, acceptable).
