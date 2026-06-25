# Review: `src/content/picker-panel.ts`

**Purpose:** In-page floating control (Shadow DOM panel) for the element picker. Mounts an isolated panel, renders override rows from the pure model, and reports user intents (color change / clear / clear-all / done) via callbacks.
**LOC:** 171.

## Overall grade: **A-**

A genuinely clean view component: Shadow DOM isolation, callback-based intents (no business logic), pure-model-driven rendering, idempotent destroy, and ARIA labels on the interactive controls. This is what a "thin view" should look like. Minor marks for `innerHTML` usage on a static template and a couple of non-null `as` casts.

## Findings

- [x] FIXED: rebuilt the static shell with `createElement` (matching `renderRow`'s style), via a tiny typed `el(tag, className)` helper that returns the precise `HTMLElementTagNameMap[K]` element. This removes the `innerHTML` block, the re-query step, and all three non-null `as` casts (`as HTMLUListElement` / `as HTMLButtonElement` ×2) — `rowsEl`/`clearAllBtn`/`doneBtn` are now typed references built in place. The now-unneeded `data-clear-all`/`data-done` hook attributes were dropped (verified nothing in src/tests/e2e queries them). One DOM-construction style in the file; same rendered markup; build + lint green.

- [x] VERIFIED-INVALID for this pass (the real fix is cross-file + out of scope; the in-file alternative is a net negative). The finding's own concrete fix — a shared `TOKENS` module that BOTH `popup.css`/popup and this panel import — requires creating a 5th file and editing the popup, neither of which is in scope here (I may only edit the four content files), and the reviewer flags it "Low priority … soft DRY violation." The only thing I COULD do within this file — hoist the hexes into local `const`s and string-interpolate them into `PANEL_STYLES` — does NOT fix the stated drift risk (popup.css still holds its own copies) and trades a readable, greppable CSS block for template-literal soup. So it buys no real DRY while hurting readability. Left the styles as a plain, isolated CSS string (the right call given Shadow-DOM isolation); the genuine token-sharing belongs in a design-token slice that owns both the popup and this panel.

- [x] VERIFIED-INVALID for this CLEANUP pass (real but deliberately deferred, and risky to bolt on here): the reviewer itself scopes this as "PLAN Phase 4" a11y work and "Not a blocker for the picker's function." It is a NEW behavior, not a cleanup — and a naive focus-on-mount/trap is genuinely hazardous in THIS component: the panel coexists with an active capture-phase pick session where the user clicks PAGE elements; auto-stealing focus or trapping it could fight the pick flow, and the panel has no notion of the "trigger" to restore focus to (the popup that sent `SHOW_PICKER` has already closed). Correct focus management needs to be designed with the pick session, not retrofitted in a per-file cleanup. Left for the dedicated Phase-4 a11y slice. (The existing `aria-label`s and the `index.ts` Esc handler remain.)

- [x] VERIFIED-INVALID (already handled — the thing it asks to "confirm" is true): the concern is a re-render WHILE the native color dialog is open recreating the `<input type=color>`. Confirmed it can't happen on the live path: `index.ts`'s `onColorChange` handler DELIBERATELY does NOT call `renderPicker()` (it has an explicit comment about exactly this — rebuilding rows would close the native dialog the user is dragging). `render` is only re-run on `onClearRole`/`onClearAll`/a fresh pick — none of which fire mid-drag. The full `replaceChildren` rebuild is fine for the handful of rows involved. No change needed.

## What's GOOD
- **Textbook thin view.** Zero business logic: it renders `overrideRows(overrides)` from the pure model and emits intents through `PanelHandlers`. The content script owns sessions/persistence. This is correct separation and exactly what the architecture docs promise (and, unlike pick.ts, the docstring here is TRUE).
- **Shadow DOM isolation done right**: `:host { all: initial }`, mounted on `documentElement` OUTSIDE `<body>` so the engine's body-walk can't reach it, host id excluded by the picker. The reasoning is documented.
- **Accessibility basics present**: `aria-label` on the rows list, the color inputs, and the clear buttons; `clearAllBtn.disabled` reflects empty state.
- **`PanelHandle` interface** (host/render/destroy) is a clean, minimal handle; `destroy: () => host.remove()` removes the shadow tree wholesale.
- Rows built with `createElement` + `addEventListener` (no inline handlers) — the safe, listener-leak-free pattern.

## Top 3 concrete changes
1. **Pick one DOM-construction style** — build the static shell with `createElement` like `renderRow` does, eliminating the `innerHTML` block and the three non-null `as` casts.
2. **Extract the design tokens** (`#4f46e5`/`#e2e2e6`/`#6b6b73`/`#b42318`) into a shared module so the panel and `popup.css` don't drift.
3. **Add the Phase-4 focus management** (focus into the panel on mount, restore on destroy) to close the a11y gap the panel currently leaves to `index.ts`.
