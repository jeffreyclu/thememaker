# Review: `src/popup/client/scheme-client.ts`

**Purpose:** The popup's scheme client — the I/O service the action hooks call to drive the page + persistence. `schemeClient(store, popup)` binds `send`/`sendNoReply`/`resolveLive`/`applyCurrentScheme`/`persistTheme`/`commitCurrent` to the current scheme store + popup view actions.
**LOC:** 112 non-comment / non-blank — within ≤200.

## Overall grade: **B+**

A clean, well-documented I/O service: no React, no JSX, no hook calls — it takes the store + popup actions as plain arguments, exactly as the contract wants `client/` to be ("a plain I/O service"). The transport degradation is handled honestly. Two real issues: `commitCurrent` **persists a look that failed to apply**, and the deferred-dispatch snapshot rationale (in the header) is sound but the file relies on callers to honor it with no guard.

## Findings

### [Medium] `commitCurrent` persists even when the apply failed — `scheme-client.ts:125-132`
`commitCurrent` runs `await applyCurrentScheme(live)` then unconditionally `await persistTheme(live)`. But `applyCurrentScheme` (lines 96-99) handles a failed/degraded send by calling `popup.setError(...)` and **returning void** — it does not throw. So on a non-injectable tab (`chrome://`, web store) or a content-script error, the send degrades to `{ ok: false }`, `applyCurrentScheme` surfaces the error and returns, and then `persistTheme` still writes `site:<origin>` with `enabled: true` and flips `siteEnabled`. Result: the popup shows "apply failed" yet has silently armed auto-reapply for a look that never painted, and toggled the per-site state on.

**Why it matters:** Apply/persist atomicity. The whole point of `commitCurrent` is "the single apply-live + persist path"; persisting after a known apply failure is a state-divergence bug (page says one thing, storage says another). It's reachable through Invert, Select-Favorite, and Select-History (all route through `commitCurrent`).

**Concrete fix:** Make `applyCurrentScheme` signal failure to its caller — e.g. return the `resp.ok` boolean (or throw) — and have `commitCurrent` skip `persistTheme` when apply did not succeed:
```ts
const ok = await applyCurrentScheme(live); // return Boolean(resp.ok)
if (ok) await persistTheme(live);
```
Keep the single `try/catch` for genuinely thrown errors.

### [Low] `applyCurrentScheme` both surfaces the error AND swallows the failure signal — `scheme-client.ts:96-101`
On `!resp.ok` it calls `popup.setError` and returns `undefined`, identical to the success return. Callers cannot tell apply success from failure. This is the root cause of the Medium above; even independent of `persistTheme`, a `void` return that means both "applied" and "failed" is an unsound contract for an I/O method whose name is `applyCurrentScheme`.

**Concrete fix:** Return `boolean` (applied or not). Update the one caller that cares (`commitCurrent`); the intensity-debounce caller in `useApplyScheme` ignores the result, which is fine.

### [Low] `send`'s degraded fallback is cast `as never` — `scheme-client.ts:59`
`Promise.resolve({ ok: false, applied: false } as never)` returns a `Promise<never>`, which then satisfies the `Promise<ResponseFor[M["type"]]>` return type only because `never` is assignable to everything. It works, but `as never` discards the type check on the literal — a future field added to `BaseResponse` wouldn't be caught here. `sendToContentWithReply` itself already returns the correct degraded shape when `tabId` is null inside its own body (it accepts the message and resolves degraded). Consider letting the real `sendToContentWithReply` handle the no-tab case (it degrades to `{ ok:false, applied:false }` without rejecting) instead of re-implementing the degraded literal here with a `never` cast.

**Why it matters:** Honest types + DRY — the degraded-response shape is now authored in two places (`messaging.ts` and here).

**Concrete fix:** Either type the literal as `ResponseFor[M["type"]]` directly (no `never`), or drop the guard and call `sendToContentWithReply(tabId ?? -1, message)` only if you've confirmed it degrades on an invalid id; the cleanest is `as ResponseFor[M["type"]]` so the field set is checked.

### [Note] `resolveLive` and `persistTheme` each call `getState()` independently — `scheme-client.ts:72, 105-106`
`persistTheme` calls `getState()` for `origin`/`siteEnabled` AND `resolveLive(live)` which calls `getState()` again when `live` is undefined. Two reads of a ref-backed store in one async method; harmless (the ref is synchronous and the reads are adjacent), but if a dispatch interleaved between them the two reads could disagree. Not a real race today because nothing dispatches between these synchronous lines. Logged for traceability only.

### What's GOOD
- **The deferred-dispatch snapshot pattern is documented at the top and honored in the API.** `resolveLive(live?)` lets callers pass an explicit `LiveScheme` snapshot precisely because "reading `getState()` after `dispatch` would still see the pre-dispatch scheme." This is the single most error-prone seam in the popup and it's centralized + explained here. Good.
- **`applyCurrentScheme` reuses the on-page palette** (only intensity + overrides change) — the comment makes the cost model explicit (no new colors, no network).
- **No `chrome.*` and no React** — it's a pure factory over injected `store` + `popup`. Correctly a "plain I/O service," not a hook.
- `persistTheme` no-ops cleanly when there's no origin or no scheme, and only flips `siteEnabled` when it actually changed.

## Top changes
1. **Make `applyCurrentScheme` return its success, and gate `persistTheme` on it in `commitCurrent`** so a failed apply never persists / arms auto-reapply.
2. Drop the `as never` degraded literal in favor of the typed shape (or reuse `sendToContentWithReply`'s own no-tab degradation).
