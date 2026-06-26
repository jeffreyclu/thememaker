# Review: `src/popup/state/PopupProvider.tsx`

**Purpose:** The view-state provider (outer of two). One `useReducer` over `popupReducer`; publishes live state via `PopupStateContext` and a stable `{ dispatch }` store via `PopupStoreContext`. Exposes `usePopupStore`/`usePopupState` accessors that throw outside the provider.
**LOC:** 48 non-comment / non-blank — within ≤200.

## Overall grade: **A**

Clean provider. State and store are split into two contexts so action consumers (which read `dispatch`) don't re-render on state churn — a real, deliberate optimization explained in the header. No business logic in the body; it only wires `useReducer` to context. All popup view state lives here, exactly per the contract.

## Findings

**No findings.**

### What's GOOD
- **Two-context split (state vs. store) is the right pattern** and the header explains the *why* honestly: `usePopup` consumers read only `dispatch`, so keeping it in a separate, stable-memoized context means a disclosure toggle doesn't force every action-binding component to re-render.
- **`store = useMemo(() => ({ dispatch }), [])`** with the comment "dispatch is stable for the popup's life" — `useReducer`'s dispatch identity is in fact stable, so the empty dep array is correct, not a stale-closure trap.
- **Accessor hooks throw a named error outside the provider** (`usePopupStore`/`usePopupState`), turning a misuse into a clear message instead of a null-deref later.
- Context default is `null` with a runtime guard, rather than a fake default object that would silently no-op — the stricter, safer choice.

### Notes (non-blocking)
- **[Note]** `PopupStateContext` is `export`ed "so tests can read/seed the live view state" (line 29 comment). That's an intentional test seam, not over-exposure — accept as-is. Same justification as the prior review's accepted test-seam exports.
