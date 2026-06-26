# Review: `src/popup/state/SchemeProvider.tsx`

**Purpose:** The scheme-state provider (inner of two). One `useReducer` over `schemeReducer`; refs keep `getState`/`activeTabId` fresh for the built-once action hooks. Runs a once-on-mount hydration effect (read storage + active tab → `QUERY_STATE` → dispatch one `hydrate` patch). Exposes `useSchemeState`/`useSchemeStore`.
**LOC:** 106 non-comment / non-blank — within ≤200.

## Overall grade: **A-**

The most subtle file in the popup, and it gets the hard parts right: the ref-backed `getState` (so async actions read live state after `await`s), the once-on-mount hydration, and the `cancelled` guard against a late dispatch. The store is memoized once over stable refs/dispatch. One real correctness gap: the hydration sequence is **not abortable mid-flight** beyond the final guard, and the `applied` query can run against state the user has already changed. Minor, given the popup's short life.

## Findings

### [Low] `cancelled` guards only the final dispatch, not the awaits in between — `SchemeProvider.tsx:77-126`
The effect awaits four things in sequence (`tabs.query` → `Promise.all(settings/history/favorites)` → `getSiteState` → `QUERY_STATE`) and checks `cancelled` only once, right before the final `dispatch`. The `activeTabIdRef.current = tab?.id` write (line 84) happens **before** any cancel check, so an unmount during hydration still mutates the ref. In a popup this is benign (unmount === popup closed === everything torn down), so there's no live bug. But the pattern reads as "this effect is cancel-safe" when only its tail is.

**Why it matters:** Robustness/clarity of the cancellation contract. If this provider were ever reused in a longer-lived surface (it mirrors the picker provider), the un-guarded ref write + four un-aborted awaits would matter.

**Concrete fix (optional):** Either add `if (cancelled) return;` after each await, or use an `AbortController` and pass its signal into `chrome.tabs.query`-adjacent async work. For the popup's lifecycle, leaving it is acceptable — log as a note if you prefer not to touch it.

### [Note] `applied` is queried during hydration and can be stale by the time it's dispatched — `SchemeProvider.tsx:96-104, 120`
`QUERY_STATE` is sent during the same async hydration that the user is waiting on; if the user somehow acted before hydration resolved, the dispatched `applied` could disagree with reality. In practice the popup is non-interactive until `current`/controls render from hydrated state, and StrictMode's double-mount is handled by the `cancelled` guard (the first run's dispatch is discarded). No fix needed; recorded because it's the kind of hydration-vs-interaction race worth being explicit about.

### [Note] Hydration effect contains real async/`chrome.*` logic in the provider body — `SchemeProvider.tsx:77-126`
The header claims "No business logic lives in this body; it only wires + renders." Strictly, the hydration effect *does* orchestrate storage reads + a content-script query + a `hydratePartial` call — that's I/O orchestration, not pure wiring. This is the right place for it (it's mount-scoped initialization that can't live in a verb-named action hook without an artificial "useHydrate"), and the pure computation is correctly delegated to `hydratePartial`. So the contract is honored in spirit (no *business* logic; the mapping is pure and external). Flagging only because the comment slightly overstates "only wires." Consider softening the comment to "the only side effect is once-on-mount hydration." No code change.

### What's GOOD
- **Ref-backed `getState` is the correct fix for the deferred-dispatch problem.** `stateRef.current = state` synced every render gives the built-once actions a `getState` that returns live state after `await`s — the header explains exactly this, and it's load-bearing for every async action in the hooks.
- **`store` memoized with `[]`** is correct: it closes over `stateRef`/`activeTabIdRef`/`dispatch`, all stable identities, so the actions built on top are stable too (which is what lets the hooks use `[store, popup]` deps).
- **Single `hydrate` dispatch** at the end — no flurry of partial dispatches mid-hydration, so the UI doesn't flash through intermediate states.
- **Pure mapping delegated to `hydratePartial`** — the effect does I/O, the reducer-adjacent pure function does the shaping. Correct layering.
- `Storage.originFromUrl(tab?.url)` + the `origin ? getSiteState : DEFAULT_SITE_STATE` branch correctly handles tabs with no usable origin (chrome://, etc.).

## Top changes
None blocking. Optionally tighten the cancellation guard (per-await checks or `AbortController`) and soften the "no logic" comment to "only side effect is hydration."
