# src/config.ts

**LOC:** 11 non-comment (≤200 ✓)

Static product config: the `modes` list (7 color modes, display order) + `MAX_HISTORY = 10`.

## Findings

**None.** A pure config module — two exported constants, no logic. `modes` is correctly typed `ColorMode[]`; comments are accurate and minimal. Clean.
