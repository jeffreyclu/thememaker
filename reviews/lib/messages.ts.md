# Review: `src/lib/messages.ts`

**Purpose:** Typed message contract for popup ⇄ background and popup → content-script. Defines the message interfaces, the `ThememakerMessage`/`ContentMessage` unions, the `MessageResponse` envelope, the `ResponseFor` request→response map, and the `sendMessage`/`sendToContent` promise wrappers.
**LOC:** 157.

## Overall grade: **A**

A clean, well-typed contract layer. Discriminated unions, a request→response type map that keeps `sendMessage` end-to-end typed, and `chrome.*` confined to the two thin promise wrappers. This is the kind of typed seam that prevents cross-layer drift. Findings are minor.

## Findings

- [x] FIXED: `MessageResponse` was one loose envelope; `ResponseFor` mapped all three request types to it (the appearance of per-type typing without the substance). Replaced with a `BaseResponse` (`ok`/`origin?`/`error?` — errors can come back for any type) plus three per-type shapes: `ApplySchemeResponse` (`applied?` + `scheme?`), `ResetSchemeResponse` (`applied?: false` — the literal, documenting that a reset leaves nothing applied), `QueryStateResponse` (`applied?`). `ResponseFor` now maps each request to its specific shape, so a `QUERY_STATE` caller no longer sees a `scheme?` it can never get. `MessageResponse` is the union the router returns. VERIFIED router.ts + popup callers still type-check and `messages.test.ts`/`router.test.ts` pass — no router behavior change required.

- [x] VERIFIED-INVALID for THIS file (left for router.ts's owner): `RESET_SCHEME` returns `applied: !removed && false`. CONFIRMED real but the FIX is in `router.ts` (another track's file) and is NOT forced by my contract change (it still compiles). I made `ResetSchemeResponse.applied` the literal `false`, which now documents the intent at the type level; the cosmetic `!removed && false → false` simplification is left for the router.ts/local-items agent.

- [x] VERIFIED-INVALID (correct as-is): two send functions with different error policies (reject vs swallow). The asymmetry is intentional and documented (popup must know background failures; pick-mode is fire-and-forget). Left unchanged.

## What's GOOD
- **`sendMessage<M>` ties request type to response type** via `ResponseFor[M["type"]]` — callers get the right response shape with no manual annotation. This is the right pattern for a typed message bus (even if `ResponseFor`'s payoff is currently thin, see above).
- **Discriminated unions** (`ThememakerMessage`, `ContentMessage`) with a clean split between background-hub messages and direct-to-content messages — and the docstrings explain WHY pick messages bypass the hub (in-page interaction). That routing decision is well-justified.
- **`chrome.*` confined to the two wrappers**, each swallowing/raising `lastError` per a documented policy — the right boundary discipline.
- **The contract is the single source of truth** both the popup and background import — exactly how you prevent producer/consumer drift on the message shapes.
- Every message interface is documented with its flow and payload rationale (the APPLY payload carrying palette-not-CSS is explained, matching the PLAN decision).

## Top 3 concrete changes
1. **Make `ResponseFor` deliver real per-type response shapes** or drop it — don't keep the indirection that maps every request to one loose envelope.
2. **Fix the `applied: !removed && false`** dead expression (in router.ts) to a plain `false`.
3. Otherwise leave it — this is a solid contract layer.
