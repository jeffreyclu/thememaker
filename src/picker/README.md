# The picker

The in-page **Customize** panel — a floating control the user opens from the popup
to recolor individual elements by clicking them. A React app mounted into a Shadow
DOM host on the page, **lazy-loaded** so React never ships in the always-on content
bundle.

## Structure

```
picker/
  index.ts              the eager shim — the ONLY non-React file. The content script imports
                        this; on SHOW_PICKER it dynamic-import()s + mounts the React app, on
                        HIDE / APPLY_LIVE it unmounts / re-renders. Keeps React (and panel.css)
                        out of the content chunk; defines the Shadow-host id.
  main.tsx              the React entry — createRoot into a fresh Shadow DOM host on <html>
  App.tsx               the composition root (PickerProvider → Panel)
  panel.css             the panel's stylesheet, injected into the shadow root (imported ?inline)
  state/
    PickerProvider.tsx    context — the live overrides map + palette/intensity + the writers
    picker-reducer.ts     the overrides reducer (pick / clear-role / clear-all / re-seed), immutable
  hooks/
    usePickSession.ts     the element-pick session: capture-phase listeners + the hover overlay
    useApplyOverrides.ts  the single apply + persist path (each pick/edit applies live + persists)
    usePickerKeys.ts      Esc-to-close
  components/
    Panel.tsx             the panel chrome + the rows list
    OverrideRow.tsx       one override row: label + an UNCONTROLLED color input + a clear button
```

## How it works

1. The popup sends `SHOW_PICKER` (carrying the live theme). The content script's
   shim (`index.ts`) lazily loads `main.tsx` and mounts the React app into a Shadow
   DOM host on `<html>` — outside `<body>`, so the engine never themes the control.
2. `usePickSession` arms capture-phase `click` / `mousemove` listeners (so the page
   can't act first) plus a hover overlay. Each click resolves the element to a
   `<tag>|<prop>` override key + its current color (the `lib/overrides` resolvers)
   and commits a pick.
3. `useApplyOverrides` owns the one apply + persist path: it advances the overrides
   reducer, re-applies the theme live through the engine, and persists the live
   theme onto the per-site saved scheme (serialized, via `lib/scheme`).

The row color input stays **uncontrolled** (`defaultValue`, no `value`): a
controlled value would remount the live `<input type="color">` mid-drag and close
the native color dialog. The new color reaches the next apply/persist through a
ref, not React state.

The picker is React-only — state in context (`PickerProvider` + `picker-reducer`),
logic in hooks, presentational components. The pure pick-resolution and the
persistence IO live in `lib/` (the `overrides` + `scheme` domains), not here.
