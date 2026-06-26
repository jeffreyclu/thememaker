# Review: src/lib/palette/palette-source.ts

**LOC**: 90 (fine)

## Findings

- **High** (132-133) `resp.ok` is never checked. On a 4xx/5xx, `fetch` still resolves;
  the code calls `resp.json()` on the error body. If that body happens to be valid JSON
  with a `colors` array (or the API returns 200 with an error shape), a bad response can
  parse "successfully"; if it is not JSON, `.json()` throws and you fall back — correct,
  but by luck. Fix: `if (!resp.ok) throw new Error(...)` before reading the body, so all
  non-2xx deterministically route to the local fallback.
- **Low** (71) `hexes[0] ?? seed` is dead defensiveness: line 62 already returns `null`
  when `hexes.length === 0`, so `hexes[0]` is always a defined string here and the `??`
  branch is unreachable. Fix: `generatePalette(hexes[0], mode)` (or drop the `??`); the
  comment about "falling back to the requested seed" is then stale and should go too.
- **Note** (114-117) In-memory cache uses a truthiness check (`if (cached)`); fine since
  a `Palette` is always a truthy object. No issue, just noting the `undefined` contract
  from `PaletteCacheStore.get` (line 18) is what makes this safe.
- **Note** Caching policy is sound: fallback palettes are intentionally NOT cached
  (147-150 returns without `.set`), so a later online retry can reach the API. Cache
  read/write failures are correctly swallowed as non-fatal. Good resilience design.

DI of fetch + both cache tiers is clean and testable. No popup/picker imports. `apiPalette`
genuinely always resolves with a valid `Palette`.
