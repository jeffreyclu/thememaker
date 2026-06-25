# ADR 0001 — Route apply/reset/query through the content script, not `executeScript`

- **Status:** Accepted
- **Date:** 2026-06-24
- **Phase:** Decomposition refactor, Phase 1 (the architectural unblocker)
- **Supersedes:** the popup→background→`chrome.scripting.executeScript` apply path

## Context

The popup drove on-demand theming through the service worker:

```
popup → sendMessage(APPLY_SCHEME) → background → routeMessage
      → createChromeInjector().apply() → chrome.scripting.executeScript({ func: applyAdaptiveScheme })
```

`executeScript({ func })` SERIALIZES the function (`func.toString()`) and
reconstructs it in the page, so the injected function CANNOT `import`. That
single constraint forced `src/lib/inject.ts` (1057 LOC) to inline its own copy
of `lib/color` (parse/hex/hsl/contrast/`relightToAA`/mix) plus its classifiers —
~210 LOC of duplication whose only reason to exist was the serialization
boundary. The engine could not share code with the rest of the codebase.

An always-on content script already existed: `src/content/index.ts` is
registered for `<all_urls>` at `document_start`, already `import`s
`applyAdaptiveScheme`, already runs it in the page for auto-reapply, and already
handles `APPLY_LIVE` content messages — all in the SAME isolated world
`executeScript` injected into, sharing `window.__themeMaker*` and the single
`<style id="themeMaker">`.

## Decision

Deliver `APPLY_SCHEME` / `RESET_SCHEME` / `QUERY_STATE` DIRECTLY to the active
tab's content script via `chrome.tabs.sendMessage` (a reply-carrying channel),
exactly like the existing `SHOW_PICKER` / `APPLY_LIVE` messages — instead of
through the background's `executeScript` injector.

Concretely:

- **`src/lib/messages.ts`** — `APPLY_SCHEME`/`RESET_SCHEME`/`QUERY_STATE` move
  into a new `ContentReplyMessage` union; added `sendToContentWithReply(tabId,
msg)` (the request/response sibling of `sendToContent`). The popup→background
  `ThememakerMessage` union and `sendMessage` are removed.
- **`src/content/`** — the content script's `onMessage` listener now replies to
  the three messages (`sendResponse` + `return true`). The page-side handlers
  live in `content/message-apply.ts` (`runApply`/`runReset`/`runQuery`),
  dispatched by `handleContentReplyMessage` in `content/index.ts`. The engine
  runner (`applyWhenReady`) + early-paint helpers moved to
  `content/early-paint.ts`; the floating picker moved to
  `content/picker-session.ts`; the per-site read/write to
  `content/site-storage.ts` — splitting the oversized file.
- **`src/popup/`** — `index.ts` is now just the composition root; the commit
  machinery is in `popup/controller.ts` and the handler factory in
  `popup/handlers.ts`, both over a chrome-free `PopupContext` (`popup/context.ts`)
  whose `send` is `sendToContentWithReply(activeTabId, …)`.
- **`src/lib/router.ts`** — DELETED (`createChromeInjector` / `Injector` / `run`
  / `routeMessage` are gone).
- **`src/background/index.ts`** — reduced to a no-op `export {}` MV3 stub (CRXJS
  still wires the `service_worker` manifest entry; nothing routes through it).
- **`src/manifest.config.ts`** — dropped the `scripting` permission (no
  `chrome.scripting` caller remains). `activeTab` + `storage` + host `<all_urls>`
  are kept.

### Retired contract

`inject.ts`'s file-level "MUST be self-contained, NO imports" contract for
`applyAdaptiveScheme` (and the "safe to serialize" caveats on `removeSchemeStyle`
/ `isSchemeApplied` / `applySchemeStyle`) is **retired**. The engine is now
ordinary bundled code that MAY `import` shared modules. (Actually deleting the
inlined color/classifier port and switching to imports is Phase 2 — this ADR only
removes the constraint; `inject.ts` is byte-for-byte UNCHANGED in Phase 1.)

## Consequences

- **Unblocks Phase 2** — the ~210 LOC duplicated port in `inject.ts` can now be
  deleted in favor of `import`s, the goal this whole refactor turns on.
- **Fewer install warnings** — dropping `scripting` narrows the permission set.
  This changes the install prompt, so it is a deliberate, recorded decision.
- **One apply transport** — popup-driven apply now travels the SAME channel as
  auto-reapply; both write the single `<style id="themeMaker">` in place, so they
  never double-apply or conflict.
- **No new dead surface** — the content script is absent on the same pages
  `executeScript` could not touch (`chrome://`, the Web Store, `view-source:`,
  `file://` without access). `sendToContentWithReply` degrades to
  `{ ok: false, applied: false }` (never rejects) there, so the popup behaves as
  before on non-injectable tabs.
- **No new timing race** — the listener is registered at `document_start`, live
  before the user can click Generate; the engine's `applyWhenReady` already
  defers to `DOMContentLoaded` when `document.body` is missing.

## Alternatives considered

- **Keep `executeScript`, bundle the engine into a self-contained IIFE string at
  build time.** Rejected: it adds a custom build step, a second artifact to keep
  in sync, and source-map/debugging friction — to solve a problem the always-on
  content script already solves for free.

## Verification

- `npm test` — 257 unit tests pass (the deleted `router`/`messages`-injector
  coverage relocated onto the content-script branches in `tests/content.test.ts`
  - the `sendToContentWithReply` tests in `tests/messages.test.ts`).
- `npm run build` — green (`tsc --noEmit` + `vite build`).
- `npm run lint` — eslint + prettier clean.
- `npm run test:e2e` — 31/31 pass in real Chromium (apply, reset, persistence,
  css-vars, contrast, dynamic-spa). `reset.spec.ts` was updated to drive the new
  content-message channel (active-tab `chrome.tabs.sendMessage(RESET_SCHEME)`),
  asserting the SAME outcomes; the apply specs were already on the content-script
  auto-reapply path and needed no transport change.
- `git diff HEAD -- src/lib/inject.ts` is empty (engine internals untouched).
