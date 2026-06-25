# Refactor plan — `src/popup/index.ts`

**Non-comment LOC: 275.** Verdict vs ≤200: **FAIL.**

The popup controller / composition root — the ONLY popup module touching `chrome.*`. Wires reducer + view + storage + engine bridge + messaging. The bulk is the 12-method `handlers` object (219–387, ~165 LOC) plus the commit/persist/intensity helpers.

## Decomposition plan (3 files, each ≤200)

| File | Responsibility | Moves | Target LOC |
|---|---|---|---:|
| `src/popup/index.ts` (kept) | Composition root: `storage`/`refs`/`state`/`dispatch` setup, `hydrate`, `activeOrigin`/`activeTabId`, `bindEvents(refs, handlers)`, boot. | — | ~110 |
| `src/popup/controller.ts` | The shared commit machinery: `applyCurrentScheme`, `persistTheme`, `commitCurrent`, `scheduleIntensityCommit`, `newFavoriteId`. Pure-ish over an injected `{ state, dispatch, storage, send }` context so it's testable. | lines 108–217 | ~110 |
| `src/popup/handlers.ts` | The `handlers` object factory `makeHandlers(ctx)` returning `onGenerate`/`onReset`/`onSelectMode`/…/`onDeleteFavorite`. | lines 219–387 | ~120 |

`index.ts` builds a `ctx` (state accessor, dispatch, storage, the active-tab sender) and passes it to `makeHandlers` + the controller, keeping the chrome wiring in one tiny root.

## Migration coupling (PLAN §2)
This file is a primary site of the executeScript→content-message change: `applyCurrentScheme`/`onGenerate`/`onReset`/`onSelectIntensity` currently `sendMessage({type:"APPLY_SCHEME"…})` to the BACKGROUND. They switch to `sendToContentWithReply(activeTabId, …)`. `activeTabId` is already resolved here (for pick mode), so the change is localized to the send calls. Do the split AFTER Phase 1 so the new send signature is already in place; or split first and swap the transport in `controller.ts` only.

## Duplication found
- **D9:** `activeOrigin` (62–66) resolves the active tab + origin; `router.ts`'s `activeTab` did the same. After the router dies, this stays the single active-tab resolver (optionally `lib/active-tab.ts`). `originFromUrl` already imported from `storage.ts` — no dup there.
- The `try { … } catch → dispatch generateError` shape repeats in `commitCurrent`, `scheduleIntensityCommit`, `onGenerate`. Factor a `guard(fn)` wrapper in `controller.ts`.

## Long functions
- `handlers.onGenerate` (220–265, ~40 LOC): the generate→apply→pushHistory→persist flow. Keep whole but move into `handlers.ts`; the inner `try` body can call a `controller.generateAndApply(result)`.
- `scheduleIntensityCommit` (187–211, ~25 LOC): fine; moves to `controller.ts`.

## Shared utils to extract
- `popup/controller.ts` (commit/persist/intensity), `popup/handlers.ts` (handler factory). Optional `lib/active-tab.ts`.

## Ordered steps
1. Extract `controller.ts` (commit/persist/intensity + `guard`). Repoint. Tests (`popup-*`) green — note these tests target `state.ts`/`view.ts`, not `index.ts` directly, so they don't pin the controller; rely on `tsc` + manual/e2e for the wiring.
2. Extract `handlers.ts` (`makeHandlers(ctx)`). Repoint `bindEvents`.
3. (After Phase 1) swap APPLY/RESET/QUERY sends to the content channel in `controller.ts`.
4. Re-measure; `tsc` + `vitest` + e2e (`apply`/`persistence`).
