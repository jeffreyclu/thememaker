# Thememaker — per-file review summary

Per-file findings live alongside each source file under `reviews/<path>.md` (78 files reviewed). No **Blocking** issues. Every source file is within the ≤200 non-comment-line limit. No `lib → src/popup`/`src/picker` import violations. Highlights, by severity:

## High (real bugs / clear fixes)

| File | Finding | Fix |
|---|---|---|
| `popup/hooks/useGenerate.ts` | `setLoading(false)` missing on the `!resp.ok` early-return + `catch` → popup stuck "loading" on any apply failure | wrap in `try/finally` |
| `popup/hooks/useApplyScheme.ts` | debounced intensity `setTimeout` lives in the `useMemo` body with no cleanup → fires after unmount (`setError` on a dead component) | move to a `useEffect` with `clearTimeout` |
| `lib/palette/palette-source.ts` | `apiPalette` never checks `resp.ok` — a non-2xx body is read; falls back to local only by luck | `if (!resp.ok) throw` before `resp.json()` |
| `lib/color/css-var-remap.ts` | reads the DOM (`getComputedStyle`) **and** imports the engine's `ResolvedRoles` → `color → engine → color` cycle + breaks color's DOM-free contract | relocate back to `engine/` (one importer: `engine-apply`) |
| `lib/overrides/resolve.ts` | doc comment cites `color-runtime` (now `css-color`) | fix the path |
| `lib/storage/persist-overrides.ts` | builds a `Scheme` with two `as Scheme["schemeDetails"]` casts (bypass the checker) + reads `location.origin` — model/DOM coupling in the storage layer | type the seed properly; reconsider domain |
| `popup/components/History.tsx` | `key={index}` over a reversed list → reconciliation mismatch; duplicate `id="history"` (invalid HTML) | stable scheme-id key; drop the dup id |

## Medium

- `lib/storage/index.ts` — `set`/`remove` swallow `lastError` → writes silently "succeed" on quota-exceeded / torn-down context; callers return optimistic data. (Reads degrading is fine; surfacing write failure isn't.)
- `popup/hooks/useFavorites.ts` + `useHistory.ts` — await'd storage/`commitCurrent` calls have no try/catch → swallowed rejections, inconsistent with the wrapped pattern elsewhere.
- `lib/messaging/index.ts` — `routeControl` lacks the exhaustive `never` guard `routeReply` has; `needsReply` hand-duplicates the `ContentReplyMessage` union (silent drift when a type is added).
- `lib/color/css-color.ts` — rgba regex duplicated 3×; `cssColorToHex` can collapse to `parseCssColor` + `rgbTupleToHex`.
- `types.ts` — `TagPropKey` (`:63`) is dead (zero references).
- `lib/storage/base-cache.ts` — page `localStorage` inside the `chrome.storage` domain (contract tension with `index.ts`).

## Low (selection)

- `lib/palette/random.ts` — off-by-one (`* 16777215` → `#ffffff` unreachable).
- `content/index.ts` — dead `STYLE_ELEMENT_ID` import + re-export.
- `lib/palette/index.ts` — `PaletteGenerator` is 9/11 pure pass-through (indirection bloat).
- Cross-cutting: the `#808080` mid-gray sentinel is redefined 4× (keys/resolve/base-cache/index); the bounded-queue idiom is duplicated (history/index).
- Stale path comments referencing `color.ts`/`color-runtime.ts` in `color/index.ts` + `css-color.ts`.
- `usePersist.ts` — persist failure shows "apply failed" (should be "persist failed").
- `manifest.config.ts` — `all_frames: false` (iframes unthemed) — confirm intentional.
- `engine-walk-geom.ts` — `inViewport` margin applied vertically but not horizontally; opaque local `w2`.
- a11y nits: `Status` could use `role="alert"` for errors; `IntensitySlider`/`ModeSelect` unchecked casts to branded/union types.
