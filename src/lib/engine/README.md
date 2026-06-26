# The theming engine

The in-page adaptive theming engine — the part of Thememaker that actually
recolors a live website. It runs in the content script's isolated world, is pure
**DOM-in / styles-out** (no `chrome.*`), and is driven entirely through the single
`Engine` instance exported from `index.ts`.

## The core idea

Every themed surface is recolored as a **blend of its frozen original and a fixed
theme color**:

```
displayed = mix(frozenOriginal, fixedTheme, factor)      factor = intensity / 100
```

- **`fixedTheme`** is a pure function of the element's _role / structure_ (is it a
  card? a button? body text?), never of its current color. A recycled SPA node
  always resolves to the same theme color — no drift across re-renders.
- **`frozenOriginal`** is each surface's original background, captured **once** into
  a `WeakMap` and frozen. It only ever feeds the blend; the engine never re-reads
  its own (already-themed) output.

`intensity` (0–100) slides between the site's original look and the full theme.

## Structure

The `Engine` class (`index.ts`) is a thin **orchestrator**: it owns the page state
and the lifecycle, and delegates the heavy work to three sub-domains.

```
engine/
  index.ts              the Engine class — lifecycle, the observer, apply orchestration
  apply-resolution.ts   one apply: palette + options → base CSS + the surface paint context
  value-types.ts        shared value types (EngineState, OriginalStyle, …)
  roles/                "what color does each thing get"
    index.ts              resolve a Palette + ApplyOptions → the concrete ResolvedRoles
    element-classifier.ts an element → its semantic role (surface / button / text / …)
    role-stylesheet.ts    role → the root-scoped text-color CSS
    css-variable-remap.ts detect the page's :root color vars + remap them toward the roles
  paint/                "put the color on the DOM"
    index.ts              the per-element surface painter
    surface-walk.ts       the time-sliced surface walk (one slice's worth of work)
    viewport-geometry.ts  viewport math + scheduling helpers (in-view first, yield, observe opts)
    paint-scheduler.ts    the paint pump: work queue, time-sliced drain, debounced off-screen flush
    mutation-parser.ts    the MutationObserver — pre-paint in-view nodes, defer the rest
    override-layer.ts     the per-tag custom-override <style> layer (emitted after the main sheet)
  dom/                  the engine's DOM footprint
    style-element.ts      create-or-reuse the <style id="themeMaker"> in place
    owned-attributes.ts   the ids / attrs the engine owns on a themed page
    early-paint.ts        flash elimination: the early-paint <style> + the localStorage base cache
```

Dependencies point one way: `roles/` and `paint/` use `color` / `palette` /
`overrides`; nothing under `engine/` imports a UI surface (`popup` / `picker`).

## The flow

**`apply(palette, options)`** — theme the page now:

1. `apply-resolution` resolves the palette + options into the **base CSS** (the
   html/body base, the role-text rules, the `:root` variable remap) and the
   **surface paint context** the per-element painter uses.
2. The single `<style id="themeMaker">` is reused in place, emptied, and the base
   rules written — there's never a themeless gap, so no flash.
3. The body is handed to the **`PaintScheduler`**, which walks surfaces in
   time-sliced slices (above-the-fold first, yielding via `requestIdleCallback`
   between slices) and streams the per-element rules onto the sheet.
4. The per-tag **override layer** is emitted as a sibling `<style>` after the main
   one, so exact user picks win.
5. The **MutationObserver** is installed: it pre-paints in-viewport SPA / lazy
   nodes synchronously before paint and hands the off-screen remainder to the
   scheduler's debounced flush. The observer is paused around each paint slice so
   the engine's own writes never re-enter its queue.

**Flash elimination** (`dom/early-paint.ts` + the `preventReloadFlash` /
`applyWhenReady` API): `chrome.storage` is async, so at `document_start` the
content script can't know the theme before the browser paints. The engine caches
the base background it painted (in the page's own synchronous `localStorage`), and
on the next load repaints that exact hex onto `<html>` _before_ any async read — so
the very first frame is already the themed base. The full `apply()` later
overwrites it with the precise, body-aware base.

## Public API

One long-lived `Engine` instance (the `engine` singleton) owns all page state and
is the sole theming entry point. Both the content script and the picker drive it,
so the engine state and the one `<style>` stay unified.

| method                             | what it does                                                    |
| ---------------------------------- | --------------------------------------------------------------- |
| `apply(palette, options)`          | theme the page right now                                        |
| `applyWhenReady(palette, options)` | theme as soon as `<body>` exists (defers to `DOMContentLoaded`) |
| `reset()`                          | remove the theme entirely (and the base cache)                  |
| `isApplied()`                      | is the page currently themed?                                   |
| `preventReloadFlash()`             | repaint the last themed base synchronously at `document_start`  |
| `cancelReloadFlash()`              | undo that placeholder (the page won't be themed after all)      |
| `dispose()`                        | stop background work without un-theming                         |

## Key invariants

- **Idempotent re-apply.** Re-applies (slider drags, invert) blend from the frozen
  originals, never from the engine's own themed output, so colors never drift.
- **One `<style>`, reused in place.** Never removed-then-re-appended, so there's no
  un-themed frame between applies.
- **The engine never reads back its own output.** `frozenOriginal` is captured once;
  the `doneSet` guarantees a surface is walked + frozen at most once per apply.
- **Bounded work.** A per-apply cap (in `EngineState`) keeps a pathological page
  from locking the main thread; the time-sliced walk yields between slices.
