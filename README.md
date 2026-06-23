# THEMEMAKER

## What is this?

THEMEMAKER is a chrome extension to instantly (sort of) apply a random (kinda) color theme to any website. Themes are provided courtesy of [The Color Api](https://www.thecolorapi.com/) ([source](https://gitlab.com/joshbeckman/thecolorapi)).

## Why does this exist?

Colors are awesome. Themes are awesome. Why don't websites provide custom themes?

## OK I'm sold, how do I use it?

- Clone this repo locally somewhere you won't forget about it
- Build it (see below): `npm install && npm run build`
- In Chrome, go your extensions page (`chrome://extensions/`) and toggle "Developer Mode" on the top right
- Click "Load Unpacked"
- Navigate to the generated `dist/` folder and select it
- Have fun

## Development & Testing

Thememaker is a Manifest V3 extension bundled with [Vite](https://vitejs.dev/)
and [CRXJS](https://crxjs.dev/vite-plugin), written in TypeScript. The manifest
is generated from `src/manifest.config.ts` — do not hand-edit a `manifest.json`.

### Install

```bash
npm install
```

### Develop with HMR

```bash
npm run dev
```

This starts Vite in dev mode and writes an unpacked extension to `dist/` with
hot-module reloading. To load it:

1. Open `chrome://extensions`.
2. Toggle **Developer Mode** (top-right).
3. Click **Load unpacked** and select the `dist/` folder.

Edits to the source reload the relevant parts of the extension automatically
while `npm run dev` is running.

### Production build

```bash
npm run build
```

Type-checks the project, then emits a clean, loadable unpacked extension into
`dist/` (bundled content script, popup, service worker, manifest, and icons).
Load `dist/` via **Load unpacked** exactly as above.

### Test

```bash
npm test          # run the Vitest suite once (jsdom environment)
npm run test:watch
```

### Lint & format

```bash
npm run lint      # ESLint + Prettier check
npm run format    # auto-format with Prettier
```

### Using the extension

Thememaker has no in-page controls. Everything lives in the toolbar **popup**:

1. Click the Thememaker toolbar icon to open the popup.
2. Pick a **mode** (or leave it on "Random"), then click **Generate**. The
   active tab is themed on demand — nothing runs on pages you don't act on.
3. **Save** remembers the current scheme for this site; **Reset** removes the
   theme from the tab. Open **Details** to inspect the palette, and click any
   **History** entry to re-apply it.
4. The **Apply on this site** toggle records a per-site preference (consumed by
   Phase 3's auto-reapply).

### Architecture (Phase 1)

The control surface is the popup; the page is touched only on demand via
`chrome.scripting` (granted by `activeTab` on a user gesture). There is **no
content script** and **no blanket host access** — permissions are just
`activeTab`, `scripting`, and `storage`.

```
src/
  manifest.config.ts     # MV3 manifest (source of truth, consumed by CRXJS)
  background/index.ts     # service worker: message hub + scripting injection
  popup/
    index.html            # popup markup (control surface)
    index.ts              # popup controller / composition root (only chrome.* here)
    view.ts               # pure popup renderer (DOM, no business logic)
    state.ts              # pure popup state model + reducer
    engine-bridge.ts      # glue from popup to the pure theming engine
    popup.css             # self-contained popup styling (design tokens)
  lib/
    theme-engine.ts       # PURE theming logic (seed, url, fetch, scheme, css, history)
    inject.ts             # self-contained functions injected into the page
    storage.ts            # typed chrome.storage adapter (behind an interface)
    site-state.ts         # pure per-site state reducer
    messages.ts           # typed popup ⇄ background message contract
    router.ts             # background message router + chrome.scripting injector
  config.ts               # modes, html element roles, history bound
  types.ts                # shared domain types
public/                   # static icons copied into dist/
tests/                    # Vitest specs (+ chrome-mock.ts, setup.ts)
```

Message contract (popup → background → active tab):

- `APPLY_SCHEME { css, scheme }` → injects a `<style id="themeMaker">`.
- `RESET_SCHEME` → removes that `<style>`.
- `QUERY_STATE` → reports whether a theme is applied.

Storage schema:

- `chrome.storage.local`: `history` (bounded scheme queue),
  `site:<origin>` (per-site `{ enabled, savedScheme? }`).
- `chrome.storage.sync`: `settings` (`{ mode }`), `favorites` (scaffolding).
