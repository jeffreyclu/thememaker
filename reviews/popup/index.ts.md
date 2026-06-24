# Review: `src/popup/index.ts`

**Purpose:** Popup controller / composition root. The ONLY popup module touching `chrome.*`. Wires the pure reducer + view + storage adapter + engine bridge + messaging; owns the handler set, hydration, debounced intensity commit, and apply/persist flows.
**LOC:** 339.

## Overall grade: **B+**

A proper composition root: `chrome.*` isolated here, storage behind an injected adapter, `fetch`/cache passed as deps, online-ness computed once and passed down, intensity debounced. The architecture is right. Marks against: module-level mutable singletons (`state`, `activeTabId`), the `applyCurrentScheme → persistTheme` pair copy-pasted across five handlers, and several unguarded async sequences that can interleave.

## Findings

### [high] The `apply-live + persist` sequence is duplicated across five handlers with no shared "commit" path
`onSelectHistory` (294–299), `onSelectFavorite` (321–330), `onToggleInvert` (248–258), the intensity commit (166–175), and `onGenerate` (185–212) all run variations of: dispatch → `applyCurrentScheme()` → `persistTheme()`. The exact ordering and which steps are included varies subtly per handler, which is exactly where bugs hide (does invert persist? does history? — yes, but you must read each to know).

**Why it matters:** DRY + correctness. Five near-identical "apply the current scheme to the page and persist it for this origin" flows mean a fix to the commit semantics (e.g. error handling on persist) must be made five times, and the subtle per-handler differences are unverified invariants.

**Concrete fix:** Extract one `commitCurrent({ regenerate?, persist = true })` that does dispatch-already-done → `applyCurrentScheme()` → `persistTheme()` with consistent error handling, and call it from each handler. The handlers then express only their UNIQUE step (which action to dispatch).

### [medium] Module-level mutable `state` + `activeTabId` singletons with no encapsulation
Lines 46, 54: `let state = initialPopupState; let activeTabId: number | null = null;`. The entire controller mutates `state` via the `dispatch` closure and reads/writes `activeTabId` from `activeOrigin`/`onPickElement`/`onReset`. This is fine for a single popup instance, but it's global mutable state that any handler can read between awaits — and several handlers `await` then read `state.*` (e.g. `scheduleIntensityCommit` reads `state.intensity`/`state.current`/`state.applied` inside a `setTimeout` callback, well after the gesture).

**Why it matters:** Async-state hazards. Because handlers `await` and THEN read `state`, a second user action can mutate `state` mid-flight. E.g. `onGenerate` awaits the API, then awaits `sendMessage`, then `pushHistory`, then `persistTheme()` which reads `state.current`/`state.origin` — if the user clicked Reset in between, `persistTheme` reads post-reset state. The debounced intensity commit reads `state` at fire time, which is intended, but the pattern is broadly unguarded.

**Concrete fix:** For the most part this is acceptable for a tiny popup (gestures are slow, popup is small), so I'd grade the realistic risk as low — but it should be acknowledged. Minimum: capture the values a handler needs into locals BEFORE the first `await` (e.g. `const origin = state.origin; const scheme = state.current;`) so each async flow operates on a consistent snapshot, rather than re-reading mutable `state` after awaits.

### [medium] `onGenerate` has no try/catch around `sendMessage`/`pushHistory`/`persistTheme` despite the "never throws" generation
Lines 185–212. `generateForSelection` is documented as never-throwing, but `sendMessage` (197), `storage.pushHistory` (207), and `persistTheme` (211) CAN reject (messaging failure, storage error). Only the `resp.ok` path is handled; a thrown rejection from `pushHistory`/`persistTheme` leaves `loading:true` stuck (the reducer set `loading` true in `generateStart` and only `generateSuccess`/`generateError` clear it).

**Why it matters:** Error handling / stuck UI. An unhandled rejection after a successful apply could strand the popup in "Generating…" with the button disabled.

**Concrete fix:** Wrap the handler body in try/catch (or the shared `commitCurrent`) that dispatches `generateError` on any throw, guaranteeing `loading` is always cleared. The same applies to the other async handlers that can throw after a dispatch.

### [low] `onToggleInvert` reuses the `applyFavorite` action to set the inverted scheme
Line 254: `dispatch({ type: "applyFavorite", scheme: invertScheme(state.current) })`. Using the `applyFavorite` action to apply an inverted scheme is a semantic mismatch — it works because `applyFavorite` just sets `current`+`applied`+`overrides`, but the action name lies about intent.

**Concrete fix:** Add a dedicated `setCurrent`/`applyScheme` action (or rename `applyFavorite` to a neutral `selectScheme`) so the dispatch reads true.

### [low] `online: typeof navigator === "undefined" || navigator.onLine !== false` is a double-negative
Line 193. "online unless navigator says offline." Correct but the `!== false` reads awkwardly; `navigator?.onLine ?? true` expresses the same intent more directly.

### [nit] `setTimeout(() => window.close(), 50)` magic delay to flush SHOW_PICKER
Line 283. A 50ms race to let the message flush before closing the popup. Works, but it's a timing guess; a `.then(() => window.close())` on the `sendToContent` promise would be deterministic (it already awaits at 277 — so the close could just follow the await without the timer).

**Concrete fix:** `await sendToContent(...); window.close();` — the await already guarantees the message was sent; drop the timer.

## What's GOOD
- **Genuine composition root.** `chrome.*` is confined here; storage is an injected adapter (`createChromeStorage()`); `fetch` + palette cache are passed as `deps` to the engine; online-ness is computed and passed down. The pure modules stay pure because this file holds all the IO. Textbook layering.
- **`dispatch` closure** keeps the reducer pure while giving handlers a one-liner to update+render — clean.
- **Intensity is properly debounced** (120ms, latest-wins, clears the timer) so slider drags don't flood `executeScript`, and the dial updates immediately for responsiveness while the commit defers — exactly the right UX/perf split, well-commented.
- **`newFavoriteId`** uses `crypto.randomUUID` with a sensible fallback — collision-resistant ids without a dependency.
- **Hydration parallelizes** the independent storage reads (`Promise.all`) and degrades gracefully on non-injectable tabs (the `QUERY_STATE` try/catch).

## Top 3 concrete changes
1. **Extract a single `commitCurrent()`** for the apply-live + persist flow duplicated across five handlers, with consistent error handling that always clears `loading`.
2. **Snapshot `state` into locals before the first `await`** in each async handler so an interleaved gesture can't make a flow act on mutated state mid-flight.
3. **Add try/catch (or route through `commitCurrent`) so a post-dispatch throw can't strand the popup** in a disabled "Generating…" state, and replace the `setTimeout(window.close, 50)` with a deterministic close after the awaited `sendToContent`.
