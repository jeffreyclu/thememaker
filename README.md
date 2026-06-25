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

### End-to-end (Playwright)

The Vitest suite runs in jsdom; the **e2e suite proves the adaptive engine works
in a REAL Chromium** on live pages — applying a theme, enforcing WCAG AA contrast
against the actually-rendered background, remapping CSS variables, auto-reapplying
on reload via the content script, and resetting.

```bash
npx playwright install chromium   # one-time: download the browser
npm run test:e2e                  # builds dist/, then runs the suite (headless)
npm run test:e2e:only             # skip the build (reuse an existing dist/)
npm run test:e2e:headed           # builds, then runs in a REAL visible window
npm run test:e2e:headed:only      # headed, no rebuild
```

Headless is the default (no display needed, runs in CI). To WATCH the engine
theme the fixtures in a real window, use the `:headed` scripts — they set
`HEADED=1`, which the fixture reads to launch a visible Chromium. Both modes load
the extension the same way and assert identical computed styles.

How it works: `e2e/support/fixtures.ts` loads the BUILT extension from `dist/`
into a persistent Chromium context (`--load-extension`, `channel: "chromium"`,
new headless), resolves the extension id from the service worker, and serves
local HTML fixtures (`e2e/fixtures/`) over `http://127.0.0.1` (a real origin, so
the per-site content script runs). Specs live in `e2e/specs/`.

> The specs drive theming through the production **content-script auto-reapply**
> path (seed `chrome.storage.local`, load the page, assert the real engine's
> output) — the same path that powers per-site persistence — rather than
> scripting a popup in a headless browser.

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
   the auto-reapply on the next load).

### Architecture

Two React UI surfaces — the toolbar **popup** and the in-page **picker** — drive a
single in-page theming **engine**. A content script runs at `document_start` and
hosts the engine; the popup sends messages straight to the active tab's content
script. Declared permissions are `activeTab` and `storage`.

```
src/
  manifest.config.ts        # MV3 manifest (source of truth, consumed by CRXJS)
  config.ts, types.ts       # modes/bounds + shared domain types
  background/index.ts        # no-op service worker (MV3 requires one; no logic)
  popup/                     # the toolbar popup (React)
    main.tsx, App.tsx, index.html, popup.css
    state/                  # PopupProvider + SchemeProvider (context + reducers)
    hooks/                  # action hooks (generate / apply / favorites / history / persist)
    components/             # presentational + connected components
    client/                # scheme-client: apply/persist I/O to the content script
  picker/                    # the in-page Customize panel (React, lazy-loaded)
    session.ts              # eager shim: dynamic-imports + mounts the React app
    main.tsx, App.tsx
    state/ hooks/ components/ client/   # same shape as popup
  content/                   # page-side glue (content script)
    index.ts                # entry: auto-reapply on load + install the message router
    message-router.ts       # routes popup → content messages
    apply-handlers.ts       # APPLY / RESET / QUERY → the engine
  lib/                       # framework-free domains, each with one entry
    engine/                 # the Engine class + internals (in-page adaptive theming)
    color/                  # pure color math (hex/hsl, WCAG contrast, AA)
    palette/                # palette generation (paletteGenerator)
    scheme/                 # scheme building (palette → scheme → apply payload)
    storage/                # the Storage class + singleton (history, settings, per-site, favorites)
    messaging.ts            # typed popup ⇄ content message contract
    override-keys.ts        # the <tag>|<prop> override grammar
    classify.ts             # shared element classifiers
public/                      # static icons copied into dist/
tests/                       # Vitest specs (+ chrome-mock.ts, setup.ts)
e2e/                         # Playwright specs (real Chromium)
```

Message contract (popup → the active tab's content script):

- `APPLY_SCHEME { palette, options, scheme }` → the engine maps the palette onto
  the page via a `<style id="themeMaker">`.
- `RESET_SCHEME` → removes that `<style>`.
- `QUERY_STATE` → reports whether a theme is applied.
- `SHOW_PICKER` / `HIDE_PICKER` / `APPLY_LIVE` → the in-page Customize picker.

Storage schema:

- `chrome.storage.local`: `history` (bounded scheme queue),
  `site:<origin>` (per-site `{ enabled, savedScheme? }`).
- `chrome.storage.sync`: `settings` (`{ mode, intensity, invert }`), `favorites`.
