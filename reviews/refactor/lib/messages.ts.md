# Refactor plan — `src/lib/messages.ts`

**Non-comment LOC: 86.** Verdict vs ≤200: **PASS.**

The typed popup⇄background / popup→content message contracts + `sendMessage`/`sendToContent`. Under budget. It GROWS slightly under the migration (PLAN §2) but stays well within budget.

## Migration impact (PLAN §2)
- Add three reply-carrying `ContentMessage` variants (`APPLY_SCHEME`, `RESET_SCHEME`, `QUERY_STATE`) so the popup can drive apply through the content channel. These largely MOVE from the existing `ThememakerMessage` union rather than being net-new (the same payload shapes).
- Add `sendToContentWithReply<M extends ContentMessage>(tabId, message): Promise<ResponseFor[...]>` — the request/response sibling of the existing fire-and-forget `sendToContent`, wrapping `chrome.tabs.sendMessage` WITH a callback + `lastError` handling.
- The popup↔background `ThememakerMessage` union + `sendMessage` shrink or disappear (whatever still needs the worker; likely nothing for apply).
- Update the file docstring (lines 1–13) — it currently rationalizes "centralizing injection in the background"; after the migration injection is centralized in the CONTENT SCRIPT.

Estimated post-migration LOC: ~110 — still PASS. No split needed; if it ever crossed 200, split request types into `messages-content.ts` / response types into `messages-types.ts`, but that is not warranted now.

## Duplication found
None. This is the canonical message-contract home.

## Long functions
None.

## Ordered steps (part of PLAN Phase 1)
1. Add the reply-carrying content variants + `sendToContentWithReply`.
2. Trim the background union/`sendMessage` as the router is removed.
3. Refresh the docstring. `tsc` + `vitest` (`messages.test.ts` relocates with the router change).
