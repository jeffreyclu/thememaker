# Refactor plan — `src/content/index.ts`

**Non-comment LOC: 228.** Verdict vs ≤200: **SPLIT.**

The always-on content script. Two concerns: (1) the AUTO-REAPPLY + early-paint flow (`runContentScript`, base-cache early paint, `applyWhenReady`), and (2) the IN-PAGE PICKER session (the `PickerSession`, persist queue, `showPicker`/`hidePicker`/`applyLive`, panel/pick wiring). It is also the pivot of the executeScript→content-message migration (PLAN §2): its `handleContentMessage` grows the APPLY/RESET/QUERY branches.

## Decomposition plan (3 files, each ≤200)

| File | Responsibility | Moves | Target LOC |
|---|---|---|---:|
| `src/content/index.ts` (kept) | Entry point + message dispatch: `runContentScript`, early-paint helpers (`paintEarlyBaseColor`/`clearEarlyBase`/`EARLY_STYLE_ID`), `applyWhenReady`, `readSiteState`, the `handleContentMessage` switch, the boot/`onMessage` listener. | — | ~130 (after picker moves out) |
| `src/content/picker-session.ts` | The floating-control session: `PickerSession`, `picker` singleton, `persistQueue`/`persistSession`/`writeSiteState`, `optionsFor`, `applyAndPersist`, `renderPicker`, `onPickerKey`, `showPicker`, `hidePicker`, `applyLive`. | lines 154–346 | ~150 |
| (grows) `src/content/message-apply.ts` *(new, Phase 1)* | The page-side APPLY/RESET/QUERY handlers that the new content messages call — `runApply(palette,options)→{applied}`, `runReset()→{applied:false}`, `runQuery()→{applied}` — delegating to `applyWhenReady`/`removeSchemeStyle`/`isSchemeApplied`. Keeps `handleContentMessage` thin. | new, replaces router's injector | ~50 |

`index.ts` keeps `handleContentMessage` as the dispatcher; it imports `showPicker`/`hidePicker`/`applyLive` from `picker-session.ts` and the apply handlers from `message-apply.ts`.

## Migration coupling (PLAN §2)
This is where the executeScript path lands. After Phase 1, `handleContentMessage` handles APPLY_SCHEME/RESET_SCHEME/QUERY_STATE and the `onMessage` listener returns `true` + `sendResponse(...)` for them (today it returns undefined for the fire-and-forget set). The content script already imports `applyAdaptiveScheme`; add `removeSchemeStyle`/`isSchemeApplied` imports (now plain functions). `tests/content.test.ts` already spies `inject.applyAdaptiveScheme` — extend it for the new branches; this is where the deleted `router.test.ts` coverage relocates.

## Duplication found
- **D8:** `EARLY_STYLE_ID = "themeMakerEarly"` and the `"themeMaker"` id concept duplicate inject's inlined literals. After Phase 2, source these from `lib/theme-dom-constants.ts`.
- `readSiteState`/`writeSiteState` (60–72, 175–185) wrap `chrome.storage.local` get/set with `lastError` swallowing — the same shape as `storage.ts`'s `chromeArea`. Acceptable (the content script wants a tiny direct read at `document_start` without the full facade), but could call `storage.getSiteState` if the facade is import-cheap. Low priority; keep unless it helps.

## Long functions
- `showPicker` (267–321, ~45 LOC): the chicken-and-egg session assembly (panel/pick handlers close over `session`). Moves whole to `picker-session.ts`; the three callback bodies are already one-liners delegating to model fns. Acceptable.
- `runContentScript` (118–152, ~30 LOC): the 4-step early-paint+decision flow. Fine as the documented entry point.

## Shared utils to extract
- `content/picker-session.ts`, `content/message-apply.ts` (Phase 1), and (Phase 2) reference `lib/theme-dom-constants.ts`.

## Ordered steps
1. Extract `picker-session.ts` (everything under "in-page floating picker control"). Repoint `handleContentMessage` + exports. `tests/content.test.ts`/`overrides.test.ts` green.
2. (Phase 1) add `message-apply.ts` + the three message branches; extend `content.test.ts`; relocate router coverage. e2e (`apply`/`reset`/`persistence`).
3. Re-measure (`index.ts` ≤200); `tsc` + `vitest` + e2e.
