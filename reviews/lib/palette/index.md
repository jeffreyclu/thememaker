# Review: src/lib/palette/index.ts

**LOC**: 73 (fine)

## Findings

- **Low** (52-117) `PaletteGenerator` singleton is almost entirely pass-through bloat.
  9 of 11 methods are one-line delegations to the already-exported free functions
  (e.g. `generate`→`generatePalette`, `invert`→`invertPalette`, `randomSeed`→`randomHexColor`).
  The free functions are exported here too, so the class adds an indirection layer
  with no added state/behavior. Fix: prefer the free functions directly and drop the
  wrapper, OR record an explicit decision (ADR) if the singleton is wanted as a stable
  facade for callers — otherwise it is duplication.
- **Low** (39-49) Wide re-export surface: source-internal primitives (`apiSchemeUrl`,
  `paletteCacheKey`, `paletteFromApiResponse`) are exported "for unit tests." Tests can
  import from the source module directly; exporting them through the barrel widens the
  public API. Fix: import these from `./palette-source` in tests, narrow the barrel.

No import-boundary violations (no `src/popup` / `src/picker` imports). Comments are
accurate and the DTO/serializability note (7-9) is genuinely useful.
