# Review: `src/popup/App.tsx`

**Purpose:** Composition root. Nests `PopupProvider` → `SchemeProvider` and lays out the seven connected sections (`Controls`/`Actions`/`Status`/`Details`/`Favorites`/`History`, plus the static header).
**LOC:** 28 non-comment / non-blank — well within ≤200.

## Overall grade: **A**

This is the model the rest of the popup is judged against. Pure JSX composition: no state read here, no prop drilling, no business logic, no `chrome.*`. Each section is connected (reads its own slice from context), so `App` passes nothing down. Matches the README architecture contract exactly.

## Findings

**No findings.**

### What's GOOD
- **Provider nesting order is correct and load-bearing.** `PopupProvider` (view) wraps `SchemeProvider` (scheme) — the header comment explains the *why*: the scheme action hooks call `usePopup()` to drive the view, so the view store must exist above them. That ordering is a real dependency, documented honestly.
- **`PopupView` reads no state itself** — the comment claims "the root does no prop drilling and reads no state itself" and the code holds to it. Every child is self-connecting.
- Clean separation of the static chrome (`<header>`/title) from the connected sections.

### Notes (non-blocking)
- **[Low]** `App.tsx:17` — `PopupView` is a module-local arrow component rather than `memo`-wrapped, but it has zero props and renders once under two providers, so memoization buys nothing here. Correct call to leave it plain.
