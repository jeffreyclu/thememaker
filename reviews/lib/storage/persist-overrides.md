# Review: src/lib/storage/persist-overrides.ts

**LOC**: 37

Serialized read-modify-write of the per-site `savedScheme` from the picker's live theme, chained through a module-level tail promise so overlapping color-drag edits can't lose an update. The serialization rationale is correct and well-documented; the `.catch(() => {})` keeps the chain alive after a failed persist.

## Findings

**High** (domain fit, whole file): This module **builds a `Scheme` / `schemeDetails` object** (lines 42-53) — that is domain-model construction, not storage IO. It also hard-depends on `location.origin` (line 29), making it content-script/DOM-only, unlike the rest of `src/lib/storage` which is DI-seamed and testable without a `window`. It sits awkwardly in `storage/`: it is really "picker persistence" / a scheme-assembly concern. Recommend relocating (e.g. `src/lib/overrides/persist.ts` or a picker-side module) and recording the decision; as-is it muddies the storage layer's "typed chrome.storage adapter" boundary.

**Medium** (persist-overrides.ts:65): `persistOverrides` swallows all errors via `.catch(() => {})` and returns a promise that always resolves — the caller (`useApplyOverrides`) gets no signal that the write failed (compounded by `storage.setSiteState` itself swallowing `chrome.runtime.lastError`, per the `index.ts` review). A failed persist on the final drag event means the saved scheme silently lags the on-screen theme until the next successful write. Consider surfacing failure (return a status, or at least `console.warn`) so the UI can detect a lost save.

**Medium** (persist-overrides.ts:33-38, 42-46): The fallback when `site.savedScheme` is absent builds a `schemeDetails` with only `{ rootColor, colorMode }` cast `as Scheme["schemeDetails"]` (line 38), and a separate fallback at 45 casts `{}` `as Scheme["schemeDetails"]`. Two different partial fallbacks for the same field, both via `as` casts that bypass the type checker — if `SchemeDetails` has other required fields, this writes a structurally-incomplete scheme that `loadDecision` must tolerate. Confirm `loadDecision` handles a `schemeDetails` missing everything but palette/intensity, and prefer a single typed default builder over the dual casts.

**Low** (persist-overrides.ts:29): `location.origin` read directly (not `Storage.originFromUrl`), so this can't be unit-tested without a DOM and bypasses the existing origin helper. Minor consistency note.

Imports only `.` (storage), `palette`, `types` — no `src/popup`/`src/picker`. Clean on the layering rule.
