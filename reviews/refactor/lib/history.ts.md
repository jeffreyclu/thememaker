# Refactor plan — `src/lib/history.ts`

**Non-comment LOC: 22.** Verdict vs ≤200: **PASS.**

Pure bounded-queue helpers (`enqueueScheme`/`dequeueScheme`). Tiny, immutable, used by `storage.ts` + `state.ts`. No split, no duplication, no long functions.

## Ordered steps
No action required.
