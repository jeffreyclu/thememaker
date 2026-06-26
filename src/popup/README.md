# The popup

The toolbar popup — Thememaker's main control surface. A React app: **all state in
context/providers, all logic in verb-named hooks**, presentational + connected
components, and a plain I/O service (`client/`) for talking to the page. The popup
never touches the target page's DOM; it sends typed messages to the content
script, which runs the engine.

## Structure

```
popup/
  main.tsx · App.tsx · index.html · popup.css   entry, composition root, markup, styles
  state/                two providers, each owning a reducer + its contexts + reader hooks
    PopupProvider.tsx     popup UI state (loading, error, which disclosures are open, saved-highlight)
    popup-reducer.ts
    SchemeProvider.tsx    the scheme domain (current scheme, intensity, invert, history, favorites,
    scheme-reducer.ts     active tab + origin) — self-hydrates from storage + the active tab on mount
  client/
    scheme-client.ts      the apply/persist service the hooks call (sends content messages, writes storage)
  hooks/                action hooks — all the logic, verb-named
    usePopup.ts           popup UI actions (setLoading/setError, toggle panels)
    useGenerate.ts        Generate + mode selection
    useApplyScheme.ts     the applied-theme lifecycle (intensity debounce, invert, reset, Customize handoff)
    useFavorites.ts       save / select / delete favorites
    useHistory.ts         re-apply a scheme from history
    usePersist.ts         per-site persistence
  components/           presentational + connected views, no business logic
    Controls · Actions · Status · Details · History · Favorites · ApplyButton · Disclosure
    IntensitySlider · ModeSelect · InvertToggle · Swatch
```

## State — two providers

State is split by domain into two nested providers, so a scheme action can flip a
UI flag without coupling the two:

- **`PopupProvider` / `usePopup`** — the popup's own UI state (loading, error,
  which disclosures are open, the just-saved highlight).
- **`SchemeProvider` / `useSchemeState` + `useSchemeStore`** — the scheme domain
  (the current scheme, intensity, invert, history, favorites, the active tab +
  origin). It self-hydrates on mount.

Each provider owns its reducer plus two contexts — a fast-changing **state**
context and a stable **store** context (`getState` / `dispatch` / `activeTabId`) —
and the reader hooks. Action hooks read the store and compose
`schemeClient(store, popup)`, the plain I/O service, to drive the page + persist.

## Driving the page

`scheme-client` is the single place that talks to the content script
(`lib/messaging`) and writes `storage`: `APPLY_SCHEME` / `RESET_SCHEME` /
`QUERY_STATE` (request → reply) and `SHOW_PICKER` / `APPLY_LIVE` / `HIDE_PICKER`
(fire-and-forget, for the in-page picker). React's `dispatch` is deferred, so the
apply-after-dispatch flows pass an explicit live-scheme snapshot rather than
re-reading state after dispatching — that rule lives in `scheme-client` and the
hooks that call it.
