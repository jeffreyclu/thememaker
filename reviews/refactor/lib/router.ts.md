# Refactor plan — `src/lib/router.ts`

**Non-comment LOC: 94.** Verdict vs ≤200: **PASS.**

The background message router + `chrome.scripting`-backed `Injector`. Under budget today, but it is the **primary casualty of the executeScript→content-message migration (PLAN §2)** — most of it gets DELETED, not split.

## Migration impact (PLAN §2)
- `createChromeInjector` / the `Injector` interface / `activeTab` / `run<T>` / `chrome.scripting.executeScript` (lines 19–128, ~85 LOC) **are deleted.** Apply/reset/query move to the content script via `chrome.tabs.sendMessage`. The serialized-function boundary — the entire reason the inject port exists — disappears with this code.
- `routeMessage` (38–72) either disappears (if the background is removed from the apply path) or shrinks to nothing useful. The exhaustive-switch shape moves into the content script's `handleContentMessage`.
- `originFromUrl` is already in `storage.ts`; `activeTab` resolution moves to the popup (`activeOrigin`) / an optional `lib/active-tab.ts` (D9).

After Phase 1, `router.ts` is likely **deleted entirely** (or reduced to a stub). `background/index.ts` no longer imports it for the apply path.

## Duplication found
- **D9:** `activeTab` (81–90) duplicates the popup's `activeOrigin` tab resolution. Resolved by deletion.

## Long functions
None over budget. `createChromeInjector` (79–128) is ~45 LOC but is being deleted.

## Ordered steps (part of PLAN Phase 1)
1. After the content script handles APPLY/RESET/QUERY and the popup sends via `sendToContentWithReply`, delete `createChromeInjector`/`Injector`/`run`/`routeMessage`.
2. Delete or stub `router.ts`; remove its import from `background/index.ts`.
3. Relocate `router.test.ts`/`messages.test.ts` coverage onto the content script's branches (`tests/content.test.ts`).
4. `tsc` + `vitest` + e2e (`apply`/`reset`).
