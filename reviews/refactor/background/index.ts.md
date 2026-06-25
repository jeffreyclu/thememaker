# Refactor plan — `src/background/index.ts`

**Non-comment LOC: 17.** Verdict vs ≤200: **PASS.**

The MV3 service worker: registers `onMessage` → `routeMessage(message, injector)`. Tiny. No split needed.

## Migration impact (PLAN §2)
This file's reason to exist is the executeScript apply path through the router. Once apply/reset/query move to the content script (PLAN Phase 1):
- the `routeMessage`/`createChromeInjector` import + the `onMessage` apply wiring are no longer needed;
- the worker reduces to `export {}` (a harmless MV3 SW stub) OR is removed from the manifest's `background` entry if nothing else needs a worker.
Decide during Phase 1 — keeping a no-op SW is the lower-risk choice (some MV3 setups expect one; CRXJS wires it). No duplication, no long functions.

## Ordered steps (part of PLAN Phase 1)
1. After the router is deleted, reduce this to a stub or remove it from the manifest's `background`. `tsc` + e2e (the extension still loads + applies via the content channel).
