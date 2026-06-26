# Review: `src/popup/hooks/usePopup.ts`

**Purpose:** The popup's view-actions hook. Builds the `PopupActions` (toggle the three disclosures, set loading/error, surface + auto-clear the just-saved confirmation, set pick mode) once over the stable view dispatch. No `chrome.*`, no async I/O.
**LOC:** 35 non-comment / non-blank — within ≤200.

## Overall grade: **A-**

Exactly what a verb-named view-actions hook should be: pure UI intents over the reducer, built once via `useMemo([dispatch])`, referentially stable so consumers don't churn. One real defect: the auto-clear `setTimeout` is never cancelled, so it can fire after unmount or stack across rapid saves.

## Findings

### [Medium] `setSavedFavoriteId`'s auto-clear timer is never tracked or cancelled — `usePopup.ts:43-49`
`setSavedFavoriteId` schedules `setTimeout(() => dispatch({ type: "clearSaveFeedback" }), 2200)` but never stores or clears the handle. Two consequences:
1. **Unmount:** if the popup closes within 2.2s of a save (very common — save, then close), the timer fires `dispatch` after teardown. In a popup this is benign (the whole context is gone), but it's a dispatch-after-unmount that React warns about and that would be a real leak in a longer-lived surface.
2. **Stacked saves:** saving twice within 2.2s schedules two timers; the first fires and clears the highlight while the second save is still "fresh," so the confirmation can blink off early.

**Why it matters:** Timer hygiene / dispatch-after-unmount. The action hook owns a side effect (a timer) with no cleanup path — and because the actions are built in `useMemo`, there's no natural cleanup hook here.

**Concrete fix:** Move the auto-clear into the provider/component as a `useEffect` keyed on `savedFavoriteId` (set timer when it becomes non-null, `clearTimeout` in the effect cleanup) — that gives both unmount cleanup and replace-on-new-save for free. Alternatively, keep a module/ref timer handle and `clearTimeout(prev)` before scheduling, plus clear on unmount. The `useEffect`-in-a-component approach is the idiomatic React fix and removes the imperative timer from the actions object entirely.

### [Note] `clearSaveFeedback` is exported but only used internally by the timer — `usePopup.ts:29, 50`
`clearSaveFeedback` is part of the public `PopupActions` but no component calls it (grep: only the internal `setTimeout` dispatches `clearSaveFeedback`). It's a small over-wide surface. If you adopt the `useEffect` fix above it becomes genuinely unused on the actions object and can be dropped from `PopupActions`. Low value otherwise — leave if you keep the timer here.

### What's GOOD
- **Pure view intents, zero I/O** — the header's claim ("No `chrome.*`, no async IO — those live in the scheme actions") holds. Correct separation: scheme actions call *these* to drive the view, not vice versa.
- **Built once over stable dispatch** (`useMemo([dispatch])`) — referentially stable actions, which is what lets the scheme hooks list `popup` in their dep arrays without rebuilding.
- `SAVE_FEEDBACK_MS` is a named constant with a doc comment, not a magic literal.

## Top changes
1. **Fix the un-cancelled auto-clear timer** — lift it to a `useEffect` keyed on `savedFavoriteId` (cleanup on unmount + replace on re-save).
