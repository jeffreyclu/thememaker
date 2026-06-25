# Refactor plan — `src/manifest.config.ts`

**Non-comment LOC: 37.** Verdict vs ≤200: **PASS.**

The CRXJS MV3 manifest definition (content script @ `<all_urls>`/`document_start`, popup action, background worker, `activeTab`+`scripting`+`storage` perms). Config, not logic. No split needed.

## Migration impact (PLAN §2)
- The always-on content-script registration (36–43) is the LOAD-BEARING fact that makes the executeScript→content-message migration possible — it's why the engine is already bundled in the page. Do NOT remove it.
- After the migration, the `scripting` permission MAY be droppable IF nothing else uses `chrome.scripting` (the popup's apply no longer does). Verify no remaining `executeScript`/`insertCSS` callers before dropping it — `activeTab` is still needed for tab resolution. Treat permission narrowing as an optional Phase 1 follow-up, not a requirement; dropping a permission changes the install prompt and should be a deliberate, recorded decision.
- The `background.service_worker` entry (54–57) depends on `background/index.ts`'s fate (see that file's plan).

## Duplication found
None.

## Long functions
None (declarative config).

## Ordered steps
1. (Optional, Phase 1 follow-up) After confirming no `chrome.scripting` callers remain, consider dropping `scripting` from `permissions` — recorded as an ADR (it narrows the install warning).
