# src/popup/components/Favorites.tsx

**LOC:** 76 non-comment (≤200 ✓)

Favorites disclosure + list. Connected (reads its state/intents from context, no props). Leaf `FavoriteRow` is pure (one favorite + apply/delete callbacks); the just-saved row highlights via `--saved`.

## Findings

**Low — `<ul id="favorites">` (`:64`) reuses the `Disclosure` base id.** `Disclosure id="favorites"` already derives `favorites-toggle` / `favorites-panel`; the inner `<ul>` carrying the bare `favorites` id is redundant and risks confusion (or a literal id collision if anything keys off it). Prefer a class, a distinct id, or drop it. (Same pattern flagged in `History.tsx`.)

**Note (not a defect).** Good structure — `FavoriteRow` memoized + pure, the delete control has an `aria-label`, swatches via `schemeSwatches`. The connected component reads `useSchemeState`/`usePopupState` and composes `useFavorites`/`usePopup` — correct React discipline (no business logic in the component).
