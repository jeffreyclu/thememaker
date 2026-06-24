# Review: `src/content/picker-panel.ts`

**Purpose:** In-page floating control (Shadow DOM panel) for the element picker. Mounts an isolated panel, renders override rows from the pure model, and reports user intents (color change / clear / clear-all / done) via callbacks.
**LOC:** 171.

## Overall grade: **A-**

A genuinely clean view component: Shadow DOM isolation, callback-based intents (no business logic), pure-model-driven rendering, idempotent destroy, and ARIA labels on the interactive controls. This is what a "thin view" should look like. Minor marks for `innerHTML` usage on a static template and a couple of non-null `as` casts.

## Findings

### [medium] `panel.innerHTML = \`...\`` for the static shell, then `querySelector(...) as HTMLButtonElement` casts
Lines 96–116. The shell is built with `innerHTML` (static, no interpolation — safe from injection) but then re-queried and cast (`as HTMLUListElement`, `as HTMLButtonElement` x2). The rows themselves are correctly built with `createElement` (line 118+). So the file mixes two construction styles, and the `innerHTML` half forces non-null `as` casts that silently assume the markup matches.

**Why it matters:** Readability/consistency + the casts are unchecked assumptions (if a `data-done` button is renamed, the cast yields a runtime null with no type error). Low-stakes here (static template) but it's the kind of thing a ruthless reviewer flags: two ways to do the same thing in one file.

**Concrete fix:** Either build the whole shell with `createElement` like `renderRow` already does (uniform, no casts, no `innerHTML`), or keep `innerHTML` but assert the queries with a tiny `mustQuery(sel)` helper that throws a clear error instead of casting away null. Given `renderRow` already demonstrates the `createElement` style, extending it to the shell is the consistent choice.

### [low] Inline `PANEL_STYLES` string (44–80) duplicates design tokens that also live in `popup.css`
Colors like `#4f46e5` (primary), `#e2e2e6` (border), `#6b6b73` (muted), `#b42318` (danger) are hardcoded here and almost certainly repeated in `popup.css`. Shadow isolation MEANS this panel can't share the popup stylesheet, so SOME duplication is unavoidable — but the token VALUES could be defined once and injected.

**Why it matters:** DRY of design tokens. If the brand indigo changes, it must change in two places.

**Concrete fix:** Define the token hexes as a shared `const TOKENS = {...}` (a tiny TS module both the popup and this panel import) and template them into `PANEL_STYLES`. Low priority — the isolation constraint makes this a soft DRY violation.

### [low] No focus management / keyboard trap on mount
The panel mounts and wires `onDone` to a Done button, but `index.ts` (per the docstring) owns Esc. On mount, focus is not moved into the panel, and there's no focus trap. For an accessibility pass (PLAN Phase 4 explicitly lists "focus, ARIA"), this is the gap. Not a blocker for the picker's function.

**Concrete fix:** On mount, focus the first control or the panel; restore focus to the trigger on destroy. Note it as Phase-4 a11y work.

### [nit] `render` rebuilds ALL rows via `replaceChildren` on every override change
Line 148. Every color-input event triggers a full row rebuild (the content script calls `render` after each change). For a handful of override rows this is fine, but it means the `<input type=color>` is recreated, which can interrupt an open native color picker. Worth confirming the live-apply path doesn't re-render mid-pick. Minor.

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
