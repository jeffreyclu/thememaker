# src/background/index.ts

**LOC:** 1 non-comment (≤200 ✓) — `export {};`

MV3 service-worker stub. No-op: all apply/reset/query/pick flow popup → content script directly (`chrome.tabs.sendMessage`); the worker routes nothing.

## Findings

**None.** Correct and intentional. The doc comment accurately explains why the stub exists (CRXJS wires `background.service_worker`; some MV3 setups expect one) and where future background work would grow. No dead code beyond the required stub.
