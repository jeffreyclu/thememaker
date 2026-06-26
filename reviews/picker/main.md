# Review: `src/picker/main.tsx`

**Purpose:** The lazy-loaded React entry. Statically imports React +
`react-dom/client`, builds the Shadow DOM host (carrying `PANEL_HOST_ID`,
mounted on `document.documentElement` outside `<body>`), injects the inlined
`panel.css`, and returns the imperative `PickerAppHandle` (`host` / `update` /
`destroy`) the shim drives.

**LOC:** 50 non-comment / non-blank — within the ≤200 limit.

## Findings

- **LOW — `update` is exposed as `render`, re-rendering with no `<StrictMode>`-vs-prop
  guard.** `main.tsx:83`. `update(props)` just calls `render(props)`, which is fine.
  No defect — flagged only to confirm the handle is a thin pass-through (it is).

- **LOW — Shadow DOM `mode: "open"`.** `main.tsx:51`. An open shadow root is
  reachable from the page via `host.shadowRoot`, so a hostile page could read or
  mutate the panel's DOM. Given the picker is transient, user-initiated, and
  carries no secrets, this is an acceptable trade-off (open mode also eases
  testing/debugging). Worth a NOTE only; if you ever render anything
  sensitive here, switch to `mode: "closed"`.

## What is good
- **Correct isolation strategy.** Host on `document.documentElement` (outside
  `<body>`) means the engine's body-walk never reaches it; the inlined
  `<style>` is a sibling of the React container inside the shadow root, so the
  page's CSS can't cascade in and the panel rules can't leak out. The docstring's
  claims match the code exactly.
- **`panel.css?inline`** is the sanctioned non-React/-component file for this
  surface (per the contract: the eager `index.ts` shim + `panel.css` are the only
  allowed exceptions). Correct here.
- **`destroy` is total:** `root.unmount()` then `host.remove()` — no orphaned
  React root, no leaked host. Clean teardown.
- The imperative-handle shape (`host`/`update`/`destroy`) is the right seam
  between the React world and the plain-DOM shim; types are honest (no `any`,
  no casts).
