# Review: `src/picker/index.ts`

**Purpose:** The eager, React-free shim for the in-page floating picker. Owns the
single live-app handle (`app` + `generation` token), exposes `showPicker` /
`hidePicker` / `applyLive` for the content message router, and lazily
`import("./main")`s the React app only when the picker is shown — keeping React
out of the always-on content entry chunk. Defines `PANEL_HOST_ID`.

**LOC:** 33 non-comment / non-blank — within the ≤200 limit.

## Findings

- **LOW — `PANEL_HOST_ID` could centralize with the engine's id constants.**
  `index.ts:25`. The engine keeps all of its owned DOM ids in
  `lib/engine/theme-dom-constants.ts` (`STYLE_ELEMENT_ID`, `PICK_OVERLAY_ID`, …),
  but the picker host id lives here as its own literal. That is *defensible* (the
  comment correctly explains it must live in the eager chunk so the pick session
  can exclude the host without loading React), but the engine's body-walk skip
  for the host depends on the host living on `documentElement` (outside `<body>`),
  not on a shared constant — so the two never cross-check. Concrete fix: leave as
  is, but add a one-line note in `theme-dom-constants.ts` pointing at this id so a
  future reader knows the picker host id exists and why it is not co-located. No
  functional impact.

- **LOW — `applyLive` blind-updates a possibly-not-yet-mounted app.**
  `index.ts:75-78`. `applyLive` calls `app?.update(...)`, but during the window
  between `showPicker` firing the lazy `import("./main")` and its `.then`
  resolving, `app` is still `null`, so an `APPLY_LIVE` that arrives in that window
  is silently dropped from the panel (the engine still repaints via
  `engine.applyWhenReady`, so the page is correct; only the open panel's rows miss
  the re-seed). This is a narrow race — `APPLY_LIVE` only follows a `SHOW_PICKER`
  the user just triggered — and the page stays correct, so it is genuinely low.
  If you want to close it, stash the latest `props` in a module variable and
  apply it in the mount `.then` when `app` becomes available. Worth a NOTE, not a
  fix.

## What is good
- **React really is kept out of the eager chunk.** Static imports are
  `engine` (value) + three `import type`s only; the React tree is reached solely
  through `void import("./main")`. The eager content entry never statically pulls
  this file's lazy dependency, so Vite code-splits React correctly.
- **The `generation` token is the right guard** for a lazy mount that resolves
  after a teardown/replacement — `hidePicker` bumps it, and the `.then` discards a
  stale resolution (`generation !== mine`). Idempotent `hidePicker`.
- Comments are logic-only and accurate; the file does exactly the three jobs the
  docstring claims and nothing more (true glue).
