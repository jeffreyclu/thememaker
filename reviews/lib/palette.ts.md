# Review: `src/lib/palette.ts`

**Purpose:** Pure, deterministic HSL-harmony palette generation — `generatePalette(seed, mode)` → structured `Palette` (surfaces, accents, roles, swatches). Plus `themeSwatches` (dedupe to distinct displayable colors) and `invertPalette`.
**LOC:** 423.

## Overall grade: **B+**

Pure, deterministic, DOM-free, well-tested (22 tests), and the doc comments do a great job explaining the *design intent* (anti-monochrome, "I want 6 colors"). The weak spot is `deriveRoles` (155–278): a 120-line function that is a dense thicket of hand-tuned magic numbers with no structure and no way to test that its intent ("perceptible step", "rising saturation") is actually met. The constants are the product's color taste encoded as bare literals.

## Findings

### [high] `deriveRoles` is a 120-line wall of magic numbers with no abstraction
Lines 155–278. Every role's `{h, s, l}` is computed with inline literals: `clampSat(34,56)`, `bgL+step*9`, `bgL+step*16`, `l: dark?86:20`, `accentSat = max(58, min(85, sat||65))`, `headingL = clampL(30+monoBias)`, `linkL = clampL(46+monoBias)`, `s: Math.min(Math.max(sat,30),45)`, etc. There are ~40 tuned numbers. They encode real taste, but as written they are unreviewable and untestable — you cannot tell whether `link` is supposed to be lighter than `heading`, only that `linkL` happens to be `46` vs `40`.

**Why it matters:** Readability/maintainability/testability. Changing the color feel means editing scattered literals with no named meaning; a regression (two roles collapsing to the same color) would not be caught by any assertion because the relationships aren't expressed as invariants.

**Concrete fix:** Two moves. (1) Hoist the lightness/saturation ladders into named tables, e.g. `const L = { bg: dark?16:86, surfaceStep: 9, altStep: 16, heading: ..., link: ... }`, so the *relationships* are visible. (2) Add property tests asserting the INVARIANTS the comments promise: surface ≠ surfaceAlt ≠ bg by a min lightness delta; on multi-hue modes heading/link/accent have distinct hues; every role is valid hex. Those tests would protect the taste the literals encode.

### [medium] `invertPalette` uses the same `as unknown as Record<string,string>` double-cast as `mapping.ts`
Lines 408–417. `const roles = { ...palette.roles } as unknown as Record<string, string>; ... roles as unknown as PaletteRoles`. Same honest-types escape, same root cause (iterating fixed-key struct by string key).

**Why it matters:** Honest types, and it's a repeated pattern across the codebase (mapping.ts, palette.ts) → a theme.

**Concrete fix:** `PaletteRoles` has a known fixed key set; map it explicitly with a typed helper `mapRoles(roles, fn)` that does `Object.fromEntries(Object.entries(roles).map(([k,v]) => [k, fn(v)])) as PaletteRoles` once, reused by both this and `mapping.ts`'s override application. One cast, one place, documented.

### [medium] `hueSlot` references slots up to index 5 but `harmonyHues` returns at most 4 entries — silent wraparound
Lines 173–180: `secondaryHue = hueSlot(5)`, `altHue = hueSlot(4)`, but `quad` returns 4 hues (indices 0–3), `triad` 3, `complement` 2, mono 1. `hueSlot(i) = palHues[i % palHues.length]` wraps, so `secondaryHue` on a `complement` mode (`[0,180]`) is `palHues[5%2]=palHues[1]=180` — i.e. it silently reuses the complement. The comment at 169–172 says this is intentional ("Roles beyond the harmony count REUSE harmony hues"), so it's correct, but the wrap means `secondary` and `heading` can land on the SAME hue depending on mode, defeating the "two buttons read as two colors" goal on low-hue modes.

**Why it matters:** Correctness-of-intent smell. The design promises distinct button colors; on `complement`/`monochrome` the math can't deliver it via hue and relies entirely on the lightness/saturation differences set later. That's fine BUT undocumented at the point it bites, and untested.

**Concrete fix:** Add a comment at `secondaryHue`/`altHue` noting they collapse onto earlier hues on low-harmony modes (and that lightness/sat is what separates them there), and a test asserting `surface`, `surfaceAlt`, `bg` stay visually distinct even on `complement`/`monochrome`.

### [low] `themeSwatches` thresholds (`s < 18` neutral, `hueDist < 22` fold) are unnamed magic numbers
Lines 320, 331. The dedupe heuristic ("near-neutral", "same hue family") hinges on `18` and `22` with no named constant. Lower severity because it's display-only (affects the swatch count, not the painted page).

**Concrete fix:** `const NEUTRAL_SAT = 18; const HUE_FOLD_DEG = 22;` with the one-line rationale.

### [low] `accents` array is built two different ways (mono ramp vs harmony hues) but is barely consumed downstream
Lines 370–376. `accents` is computed but the role-based engine reads `roles.*`, not `accents`, for almost everything. In the inject port `accents` is only a *fallback seed* (`fallbackInk = accents[0]`). So this branchy computation feeds a rarely-taken fallback path.

**Concrete fix:** Confirm via grep whether `accents` is load-bearing anywhere; if it's only a fallback, simplify its construction or document it as legacy/fallback-only.

## What's GOOD
- **Pure and deterministic** with an explicit guarantee ("same inputs → same palette"), DOM-free, fully unit-tested. `generatePalette` and `invertPalette` are clean composition roots.
- **`themeSwatches`** is a genuinely thoughtful solution to "show the user the REAL distinct colors" — folding near-duplicates instead of padding to six is the right product call and is well-explained.
- **The `roles`/`swatches`/`themeColors` source-of-truth design** (popup shows exactly what's painted) is clean and the comments make the contract explicit.
- **`harmonyHues` and the mono/multi-hue split** are readable and correctly factor the mode taxonomy.
- `invertPalette` being self-inverse (mod rounding) is a nice, stated property.

## Top 3 concrete changes
1. **Refactor `deriveRoles`**: hoist the ~40 magic literals into named lightness/saturation tables that make the inter-role *relationships* explicit, and add property tests for the invariants the comments promise (distinct surfaces, distinct hues on multi-hue modes).
2. **Kill the `as unknown as` double-cast** in `invertPalette` with a typed `mapRoles` helper shared with `mapping.ts`.
3. **Document + test the low-harmony hue collapse** (`secondaryHue`/`altHue` wrapping onto earlier hues on complement/mono) so the "distinct buttons/surfaces" promise is verified where hue can't provide it.
