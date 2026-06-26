# Review: src/lib/overrides/resolve.ts

**LOC**: 83

Pure DOM pick-resolvers (`isPickable`, `propForElement`, `pickKeyFor`, `currentColorFor`). Good separation from React/`chrome.*`. `try/catch` around every `getComputedStyle` is the right defensive call for cross-origin/detached nodes.

## Findings

**High** (resolve.ts:9): Doc comment cites the rgb→hex parser as living in `../color/color-runtime`, but the actual import (line 13) is `../color/css-color`. Stale comment — misdirects the next reader to a non-existent module. Fix the comment to `../color/css-color`.

**Medium** (resolve.ts:77-78): `isPickable` checks only the tag denylist, but `propForElement`/`currentColorFor` call `getComputedStyle`, which throws for an element in a detached document or returns `null` in some torn-down/cross-realm contexts. `isPickable` itself is safe (pure tag check), but a caller that gates on `isPickable` then calls `currentColorFor` relies on the inner try/catch — confirm `usePickSession` doesn't assume `isPickable === true ⇒ getComputedStyle succeeds`. The try/catch covers it, so no crash, but the fallback color (`NEUTRAL_TEXT`) may surprise. Acceptable; note the coupling.

**Medium** (resolve.ts:90-93): `propForElement` ordering — an element that both `hasOwnBackground` AND `hasDirectText` resolves to `background`, so clicking text inside a colored box recolors the box, never the text. Likely intentional (matches the "toolbars/sections recolor" doc), but it means text on a styled element is unreachable via pick; worth confirming against product intent.

**Low** (resolve.ts:23-29 vs 117-137): `hasOwnBackground` and the `currentColorFor` background branch both call `cssColorToHex(getComputedStyle(node).backgroundColor)` with the same null-as-transparent semantics — mild duplication of the same idea, fine as-is.

**Low** (resolve.ts:69): `node.nodeType === 3` uses the magic number; `Node.TEXT_NODE` reads clearer.

**Low** (resolve.ts:109 / NEUTRAL_TEXT `#808080`): Duplicates `FALLBACK_COLOR` from `keys.ts`. Two mid-gray sentinels with the same value defined independently; consider sharing one constant.
