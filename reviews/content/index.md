# src/content/index.ts

**LOC:** 70 non-comment (≤200 ✓)

The always-on content script (`<all_urls>` @ `document_start`). Three jobs: (1) `runContentScript` — auto-reapply this origin's saved theme on load (early-paint → `loadDecision` → `engine.applyWhenReady`); (2) the page-side reply handlers `runApply`/`runReset`/`runQuery` (total: try/catch → typed response, never throw); (3) boot — runs auto-reapply + binds the DI message router `installMessageRouter({ apply, reset, query, showPicker, hidePicker, applyLive })`, skipped under unit tests.

## Findings

**Low — dead `STYLE_ELEMENT_ID` import + re-export (`:9` and final line).** It's imported from `lib/engine/theme-dom-constants` only to be re-exported; nothing imports it from `content` (tests import it from `theme-dom-constants` directly). Both lines are dead — remove them.

**Low — `runApply`/`runReset`/`runQuery` exported only as a test seam.** Used only by the local boot wiring; the `export` exists so `content.test.ts` can call them. Acceptable, but wider visibility than the code needs.

**Note (not a defect).** The DI split is clean — routing lives in `lib/messaging` (engine/picker-free); `content` injects the page-side handlers. Handlers are total; the `__THEMEMAKER_TEST__` boot guard prevents double-boot under tests. No business logic beyond thin handler wrappers — correct for content glue.
