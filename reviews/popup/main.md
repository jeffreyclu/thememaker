# Review: `src/popup/main.tsx`

**Purpose:** React entry point. Resolves `#root`, throws if absent, mounts `<App/>` in `StrictMode`, pulls in `popup.css`.
**LOC:** 13 non-comment / non-blank — well within the ≤200 limit.

## Overall grade: **A**

A textbook composition entry. No state, no logic, no `chrome.*` — exactly what the contract wants from `main.tsx`. The header comment is accurate ("all `chrome.*` access lives behind the provider's effects/actions; this file only wires React to the DOM").

## Findings

**No findings.**

### What's GOOD
- Hard-fails on a missing `#root` with a named error rather than letting `createRoot(null)` throw an opaque React error — honest fail-fast.
- `StrictMode` is on, which exercises the double-invoke of the hydration effect in dev (worth knowing the `SchemeProvider` effect is guarded with a `cancelled` flag — it is; see that review).
- CSS import colocated with the entry; no stray logic.

### Notes (non-blocking)
- **[Low]** `main.tsx:14` — `document.getElementById("root")` assumes the popup HTML ships a `#root`. That coupling is implicit; it's fine because `index.html` is in the same folder and under the same build, but a one-line comment ("matches `#root` in index.html") would close the loop. Trivial, optional.
