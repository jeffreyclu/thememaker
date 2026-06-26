# src/manifest.config.ts

**LOC:** 37 non-comment (≤200 ✓)

MV3 manifest via CRXJS. Permissions `activeTab` + `storage` (no `scripting`). One `<all_urls>` content script @ `document_start`; popup action; no-op background worker. `version`/`description` sourced from `package.json`.

## Findings

**Low — `all_frames: false`.** The content script runs only in the top frame, so themed pages' sub-frames (iframes) won't be recolored. Likely a deliberate choice (perf + avoids theming embedded third-party frames), but worth confirming it's intentional, not an oversight.

**Note (not a defect).** The `<all_urls>` match drives the "read/change all your data on all websites" install warning — correctly documented in-file as the accepted trade-off for per-site auto-reapply. Permissions are appropriately minimal (no `scripting`, no `web_accessible_resources`); the manifest is correct.
