# Review: `src/lib/scheme/mode.ts`

**Reviewed:** 2026-06-26
**Purpose:** The `ModeSelection` type plus seed/mode resolution for a generate request (`modesForSelection`, `resolveMode`, `resolveSeed`). Pure + total.

## LOC
11 non-comment / non-blank lines. Well within ≤200.

## Findings

No blocking/high findings. The module is small, pure, total, and correct.

### Correctness
- `resolveSeed` (28-29) correctly validates with `isHexColor` and normalizes with `normalizeHex`; an invalid/absent seed falls back to `paletteGenerator.randomSeed()`. Total — never throws. Tests (`tests/popup-state.test.ts:331-345`) confirm `"#abc"→"#aabbcc"`, `"FF8800"→"#ff8800"`, and random fallback for `"nope"`/`"#12"`.
- `resolveMode` (21-22) maps `"random"` to a random configured mode, else passes the concrete mode through. Correct.
- No async, no storage, no reducer here — the error-handling/purity criteria are N/A and trivially satisfied.

### Notes (non-blocking)

- **[Low] `modesForSelection` has no production consumer.** `file:src/lib/scheme/mode.ts:17`. Grep shows it is referenced only in `tests/popup-state.test.ts` (8,286-291); no `src/**` caller. The candidate-mode list it returns is not consumed by `resolveMode` (which calls `paletteGenerator.randomMode(modes)` directly), so this is a test-only export. Either wire it into `resolveMode` (so `resolveMode` picks from `modesForSelection(selection)` — DRYs the `"random" → modes` branch) or drop the standalone export. Low priority; harmless but it is test-validated dead surface (the false-coverage pattern called out elsewhere in this repo's review log).
- **[Low] `modesForSelection` return type is `string[]`, but the values are `ColorMode`.** `file:src/lib/scheme/mode.ts:17`. `modes` is `ColorMode[]` and `selection` (minus `"random"`) is a `ColorMode`, so the precise type is `ColorMode[]`. Widening to `string[]` loses the closed-taxonomy guarantee the `ColorMode` union is designed to preserve (see `types.ts:12` rationale). Fix: `(selection: ModeSelection): ColorMode[]`. Cosmetic; no runtime impact.

## Naming / comments / architecture
- Names are domain-appropriate (`resolveMode`, `resolveSeed`, `ModeSelection`) — no React/Redux jargon. Good.
- The docstring (1-7) is accurate: "Pure + total (never throws), DOM-free and `chrome.*`-free" matches the code. Comments are logic-only.
- Domain fit is correct: seed/mode resolution belongs in the scheme/generation domain. Imports only `config`, `lib/color`, `lib/palette`, `types` — no popup/picker, no DOM, no `chrome.*`.
