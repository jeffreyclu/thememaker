# Review: `src/lib/messages.ts`

**Purpose:** Typed message contract for popup ⇄ background and popup → content-script. Defines the message interfaces, the `ThememakerMessage`/`ContentMessage` unions, the `MessageResponse` envelope, the `ResponseFor` request→response map, and the `sendMessage`/`sendToContent` promise wrappers.
**LOC:** 157.

## Overall grade: **A**

A clean, well-typed contract layer. Discriminated unions, a request→response type map that keeps `sendMessage` end-to-end typed, and `chrome.*` confined to the two thin promise wrappers. This is the kind of typed seam that prevents cross-layer drift. Findings are minor.

## Findings

### [low] `MessageResponse` is one loose envelope with many optional fields, not per-response-type shapes
Lines 102–118: every response (apply/reset/query) shares `{ ok; origin?; applied?; scheme?; error? }`, and `ResponseFor` maps ALL three request types to the SAME `MessageResponse`. So `RESET_SCHEME` can carry a `scheme?` it never sets, and `QUERY_STATE` an `error?`/`applied?` mix. The map exists but doesn't actually differentiate responses.

**Why it matters:** Honest types / interface segregation. The `ResponseFor` indirection promises per-type responses but delivers one bag — a caller of `QUERY_STATE` gets `scheme?` in its type even though it's never populated.

**Concrete fix:** Either make `ResponseFor` map to genuinely distinct response shapes (e.g. `QUERY_STATE: { ok: boolean; applied: boolean; error?: string }`), or drop the `ResponseFor` indirection if one envelope is the intentional design (then it's just `Promise<MessageResponse>` and the map is ceremony). Pick one; right now it's the appearance of per-type typing without the substance.

### [low] `RESET_SCHEME` returns `applied: !removed && false` — a confusing constant expression
This is in router.ts (line 53), surfaced through this contract: `!removed && false` always evaluates to `false` regardless of `removed`. It's a convoluted way to write `applied: false`. (Flagging here because it's the response this contract describes; the fix is in router.ts.)

**Why it matters:** Readability — `!removed && false` looks like it means something (depends on `removed`?) but is unconditionally `false`. A reader wastes time decoding it.

**Concrete fix:** In router.ts, write `applied: false` with a comment ("a reset leaves nothing applied"). Noted here because it's the `MessageResponse.applied` semantics.

### [nit] Two send functions with different error policies (reject vs swallow) — documented but worth a glance
`sendMessage` REJECTS on `lastError` (124–136); `sendToContent` SWALLOWS it (144–157). The asymmetry is intentional and documented (the popup must know if a background action failed, but pick-mode is fire-and-forget). Correct — just noting the two policies coexist.

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
