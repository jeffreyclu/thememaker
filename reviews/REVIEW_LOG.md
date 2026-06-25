# Review Log — Thememaker

## 2026-06-25 — Pre-publish quality gate (post-refactor full audit)

**Reviewer:** principal-code-reviewer
**Scope:** entire `src/` + `tests/` after the large refactor (engine→class/singleton,
storage/palette→singletons, popup + picker → React with context/hooks, folder reorgs,
comment cleanup). Audited against the project's stated standards (≤200 non-comment lines
per file, zero duplication, mirrored popup/picker structure, React discipline, React out
of the eager content chunk, logic-only comments).

**Verdict: APPROVE WITH FOLLOW-UPS** (all four gates green; only non-blocking doc-drift
notes). Safe to publish; clean up the stale comment/README references as housekeeping.

### Gates (run, real results)
- `npm run build` — PASS (tsc --noEmit + vite build, exit 0).
- `npm test` — PASS, 283/283 (18 files).
- `npm run lint` — PASS (ESLint clean + Prettier "All matched files use Prettier code style").
- `npm run test:e2e` — PASS, 31/31 (real Chromium, ~1.2m).

### Confirmed clean
- **≤200 non-comment lines:** every `src/**` file passes. Largest: `lib/engine/index.ts`
  (197), `lib/color/index.ts` (196), `lib/storage/index.ts` (152). Verified with two
  independent counters.
- **No copy-paste / duplication:** color math lives only in `lib/color/` (`color-runtime`
  wraps, never reimplements). The historical "two implementations in lockstep" (inlined
  engine port) is GONE — the engine imports all color/contrast math from `../color` and
  `../color/color-runtime`. Override-key grammar centralized in `lib/override-keys.ts`;
  message DTOs only in `lib/messaging.ts`; popup vs picker reducers are disjoint.
- **Structure:** popup/ and picker/ mirror (entry + state/ + hooks/ + components/ + client/),
  nothing loose at root beyond entries (+ picker's `session.ts` shim). `lib/` domains each
  expose a single index. `content/` is glue only (router, handlers, site-storage, engine
  wiring, early paint) — no UI/React/business logic.
- **React discipline:** all state in context (provider reducers), logic in verb-named hooks,
  Apps are pure composition roots, `scheme-client`/picker `client/` are plain I/O services.
  The lone `deps:` (`useGenerate.ts:48`) is a DI param on the pure `generateForSelection`
  lib fn, not a hook-coupling bundle — acceptable.
- **React out of the eager chunk:** content loader (`index.ts-loader`) has zero static
  imports; content body statically pulls only the engine chunk; the React chunk
  (`client-*.js`, 192KB) is referenced ONLY inside the `__vite__mapDeps` preload list for
  the dynamic `import("./main-*.js")` picker mount. React never loads on a normal page.

### Findings (all non-blocking)

- **MEDIUM — Stale file paths in doc comments (comment-standard drift).** Six comments
  reference pre-refactor filenames that no longer exist:
  - `src/types.ts:61,71,76` → `inject.ts` (now `lib/engine/*`)
  - `src/lib/color/index.ts:7` → `palette.ts`, `color-source.ts` (now `lib/palette/*`)
  - `src/lib/engine/engine-roles.ts:5` → `palette.ts` (now `lib/palette/palette-roles.ts`)
  - `src/lib/classify.ts:5` → `content/pick-resolve.ts` (now `picker/hooks/pick-resolve.ts`)
  Fix: update each to the current path (or drop the path and keep the concept). These
  actively mislead navigation.

- **MEDIUM — README "Architecture" tree is the old structure.** `README.md` ~L120-150 still
  documents `popup/view.ts`, `popup/state.ts`, `engine-bridge.ts`, `content/pick.ts`,
  `picker-panel.ts`, `lib/inject.ts`, `mapping.ts`, `color-source.ts`, `router.ts`,
  `messages.ts` — none exist post-refactor. Pre-publish: refresh the tree to the
  engine/storage/palette/color/scheme + popup/picker layout. (PLAN.md is historical and may
  stay as-is.)

- **LOW — Six value exports wider than needed.** `handleContentMessage`
  (`content/message-router.ts:18`), `classifyVarName` / `isVariableDriven`
  (`lib/engine/css-var-remap.ts:25,102`), `parseMutations` (`lib/engine/engine-observe.ts:41`),
  `classifyButton` (`lib/engine/role-classify.ts:63`), `overrideRoleLabel`
  (`lib/scheme/selectors.ts:42`) are `export`ed but only used inside their own module (tests
  reach them via the public entry, not by name). Not dead code — just over-exported. Drop the
  `export` keyword, or leave for test-seam clarity. No functional impact.

### Coordination notes
- No code changed in this review.
- Doc/comment cleanups (the two MEDIUM items) are the only items recommended before publish;
  hand to the authoring engineer. Everything functional is publish-ready.
