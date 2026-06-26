# Review: src/lib/messaging/index.ts

**LOC**: 163 (non-comment). Under 200.

Typed popup → content-script message contract + router. `chrome.*` transport is expected here (messaging layer), so that's in-contract, not a leak. Imports only from `../../types` and `../palette` — no `src/popup`/`src/picker` import, boundary respected (verified). Strong discriminated-union typing and `ResponseFor` mapping.

## Findings

- **High** — `SHOW_PICKER` is declared in `ContentMessage` (line 93-96, via `ShowPickerMessage`) and routed (`routeControl` line 271), but the `needsReply` discriminator (lines 237-242) and `routeReply` only enumerate APPLY/RESET/QUERY — fine. However, `routeControl` (lines 267-278) handles SHOW/HIDE/APPLY_LIVE with an `if/else if` chain and **no exhaustive `default`/`never` guard**, unlike `routeReply` (line 256). If a new `ContentMessage` variant is added, it silently no-ops instead of failing the type-check. Fix: add an `else { const _x: never = message; }` exhaustiveness guard to match `routeReply`.

- **Medium** — `needsReply` (lines 237-242) hand-lists the three reply types as string literals, duplicating the `ContentReplyMessage` union (lines 104-107). These can drift: add a 4th reply type to the union and `needsReply` won't catch it, so it'd be mis-routed to `routeControl` and dropped. Fix: derive from a single source (e.g. a `const REPLY_TYPES` set typed against `ContentReplyMessage["type"]`, or assert exhaustiveness).

- **Low** — `installMessageRouter` listener returns `true` to keep the MV3 channel open for replies and `undefined` for fire-and-forget (lines 297-299). Correct, but `sendResponse` for the reply path is synchronous here, so the `return true` is technically unnecessary (handlers are sync `ApplySchemeResponse`, not Promises). Harmless; note in case handlers later go async (then `true` becomes load-bearing and the sync `sendResponse` call must move into the async resolution).

- **Low** — `degraded` cast `as ResponseFor[M["type"]]` (line 182) asserts a `{ok:false, applied:false}` shape satisfies every response type; it does, but the cast bypasses the checker. Acceptable.

No security issues (`lastError` swallowed deliberately, documented). The missing exhaustiveness guard on `routeControl` is the one worth fixing.
