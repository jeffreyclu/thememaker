# Thememaker → v1.0 Plan

Goal: turn the current proof-of-concept into a **polished, Chrome-Web-Store-publishable**
extension, built around an **adaptive theming engine** (detect real backgrounds / CSS
variables instead of painting bare tags) and a **popup + Shadow DOM UI**.

## Decisions (locked)

- **TypeScript:** yes. New code is TS; existing logic migrated to TS.
- **Color source:** local-first generation (HSL harmony) for instant/offline/deterministic
  schemes; `thecolorapi.com` kept as an optional "surprise me" source with caching + fallback.
- **UI:** popup is the primary control surface; any in-page UI lives in an isolated Shadow DOM.
- **Permissions:** `activeTab` + `scripting` (inject on demand) instead of blanket `<all_urls>`,
  to drop the scary install warning and ease store review.

## How to test (every phase keeps this green)

1. **Unit tests** — Vitest + jsdom. `npm test`. Every new module ships with tests. Required
   coverage targets: color/harmony generation, WCAG contrast enforcement, element role
   classification, CSS-variable remap, storage adapter, message handlers.
2. **Manual smoke** — `npm run dev` (Vite/CRXJS HMR) → `chrome://extensions` → enable
   Developer Mode → **Load unpacked** → select `dist/`. Or `npm run build` for a production
   build, then load `dist/`. Step-by-step lives in the README "Development & Testing" section.
3. **E2E** — Playwright launches a real Chromium with the extension loaded, opens fixture
   pages, triggers generate, and asserts injected styles + contrast. Added in Phase 4 (earlier
   if useful).

---

## Phase 0 — Build foundation & tooling _(prerequisite for everything)_

- [x] Vite + CRXJS MV3 build (bundled content script, popup, service worker; HMR in dev).
- [x] Remove `content.js` dynamic `import()` and `web_accessible_resources: <all_urls>`.
- [x] TypeScript, ESLint, Prettier.
- [x] Migrate Thememaker logic into new structure (behavior unchanged for now).
- [x] Migrate existing tests Jest → Vitest; keep them green.
- [x] CI to Node 20/22 running `lint → test → build`; upload packaged `.zip` artifact.
- [x] README "Development & Testing" section.
- **Acceptance:** `npm run build` produces a loadable unpacked extension; `npm test` and
  `npm run lint` pass.

## Phase 1 — Architecture refactor (popup + chrome.storage + on-demand injection)

- [x] Popup is the entire control surface (generate, save, reset, mode, details,
      history, per-site on/off). No in-page buttons/panels remain.
- [x] All in-page UI deleted — which removes the hardcoded `#...Button { !important }`
      color hack entirely. (No Shadow DOM needed: there is no in-page UI at all.)
- [x] Replaced `localStorage` with a typed `chrome.storage` adapter (`local` for
      history/per-site state, `sync` for settings/favorites). History now persists.
- [x] Typed message passing (popup ⇄ background) + service worker as the
      injection hub (`chrome.scripting`).
- [x] Permissions → `activeTab` + `scripting` + `storage`; removed `<all_urls>`
      content-script matching and `web_accessible_resources`.
- [x] Per-site on/off toggle wired to `chrome.storage` (Phase 3 consumes it).
- **Tests:** storage adapter, message handlers/routing, per-site state reducer,
  popup pure state, view rendering, injected DOM apply. 72 tests passing.

## Phase 2 — Adaptive theming engine v2 _(core value)_

- [x] Role detection via `getComputedStyle` + luminance (surface vs text vs border) instead of
      tag-name assumptions. (In-page DOM-walk in `src/lib/inject.ts`.)
- [x] CSS-variable-aware: detect `:root` custom properties and remap where a site is
      variable-driven. (`isVariableDriven`/`remapVariables` in `src/lib/mapping.ts`.)
- [x] Luminance-bucket mapping: map existing dark/medium/light surfaces onto the palette,
      preserving hierarchy. (`luminanceBucket` in `color.ts`, `surfaceForBucket` in `mapping.ts`.)
- [x] MutationObserver for SPA / lazily-loaded content (throttled via `requestIdleCallback`,
      disconnected on reset).
- [x] WCAG AA contrast enforcement (≥4.5:1 text, 3:1 large) — `ensureContrast` adjusts lightness
      post-generation; every emitted text/bg pair is asserted to pass AA.
- [x] Local color generation (modes: monochrome[-dark/-light]/complement/analogic-complement/
      triad/quad) is now the DEFAULT; thecolorapi.com is an optional "surprise me" source with
      in-memory + chrome.storage caching and a real fallback to local generation (fixes the
      swallowed-error → `undefined` crash).
- [x] Conservative ↔ aggressive intensity toggle (persisted in `sync` settings) + per-site
      disable (from Phase 1).
- **Tests:** 151 total (was 72). New: `color`, `palette`, `color-source`, `mapping` suites +
  in-page structural-invariant tests; existing suites updated for the new APPLY payload.

### Phase 2 decisions (locked)

- **APPLY payload carries `{ palette, options, scheme }`, not a precomputed CSS string.** The
  popup can't see the target page's computed styles, so detection→mapping→contrast→CSS-build runs
  IN the page. The `<style id="themeMaker">` invariant is preserved (now also writing `:root`
  variable overrides into that same element).
- **Two implementations of the mapping/contrast algorithm, kept in lockstep:** the canonical,
  unit-tested pure modules (`color.ts` + `mapping.ts`), and a SELF-CONTAINED port inlined in
  `applyAdaptiveScheme` (`inject.ts`) — required because `chrome.scripting.executeScript`
  serializes the function and can't reach imports. Verified the adaptive logic bundles into the
  service-worker chunk self-contained.
- **Contrast is non-negotiable:** `ensureContrast` searches both lightness directions for the
  least-destructive hue-preserving fix, falling back to black/white only when neither reaches AA.

## Phase 3 — Product features

- [ ] Manual seed-color picker + mode selector.
- [ ] Named favorites (multiple) + persistent history with swatch previews.
- [ ] Per-site memory: auto-reapply theme on revisit.
- [ ] Keyboard shortcut (`commands` API).
- [ ] Options page for defaults.
- **Tests:** favorites CRUD, per-site reapply logic.

## Phase 4 — Polish & store readiness

- [ ] Loading/empty/error states; graceful offline.
- [ ] Accessibility pass on popup (focus, ARIA, contrast).
- [ ] Playwright E2E suite.
- [ ] Store assets: screenshots, promo tile, listing copy, privacy disclosure.
- [ ] Versioned release + zip; README rewrite (store install + dev setup).

---

## Sequencing

- Critical path: **0 → 1 → 2** (dependent, run in order). **3 and 4** parallelize once 2 lands.
- Every phase merges only when unit tests + build are green.
