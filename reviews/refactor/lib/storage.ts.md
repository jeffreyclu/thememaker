# Refactor plan — `src/lib/storage.ts`

**Non-comment LOC: 148.** Verdict vs ≤200: **PASS.**

Typed storage facade over `chrome.storage` (local + sync), the `StorageArea` seam, keys, `Settings`/`Favorite`/`SiteState` types, `originFromUrl`, and the `ThememakerStorage` class. Cohesive and under budget. No split needed.

## Duplication found
- **D9 (canonical here):** `originFromUrl` (121–130) is the single URL→origin helper. `router.ts`'s `activeTab` and the popup's `activeOrigin` both resolve tabs but reuse THIS `originFromUrl` — keep it the canonical home. Nothing to change.
- `content/index.ts`'s `readSiteState`/`writeSiteState` wrap `chrome.storage.local` directly (for a tiny `document_start` read) rather than going through this facade. Acceptable divergence (the content script wants minimal startup cost); not flagged as a must-fix dup. If desired, the content script could import `getSiteState`/`setSiteState`, but the direct wrap is a deliberate startup-path choice.

## Long functions
None over ~30 LOC. The `ThememakerStorage` methods are all small and single-purpose.

## Ordered steps
No action required. Leave as-is.
