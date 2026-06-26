# Review: `src/lib/scheme/transforms.ts`

**Reviewed:** 2026-06-26
**Purpose:** Pure scheme transforms: `schemeFromPalette`, `generateForSelection` (online→cached with local fallback / offline-local), `invertScheme`, `applyPayloadForScheme`, `schemeWithIntensity`. The generation + apply/persist payload layer the popup state machine builds on.

## LOC
113 non-comment / non-blank lines. Within ≤200.

## Findings

No blocking findings.

### Correctness
- `generateForSelection` (78-98) is `async` and the docstring promises "Never throws." This holds **only because `paletteGenerator.api(...)` is itself total** — it owns the try/catch + local fallback internally (per its own contract/tests). This file does not wrap the `await` in a try/catch, so the "never throws" guarantee is delegated, not enforced here. Verified `paletteGenerator.api` is the documented fallback boundary (palette source), so the claim is currently true. **[Low]** Consider a one-line comment noting the totality is delegated to `paletteGenerator.api` (and a guard if that contract ever loosens), so a future change to the palette source doesn't silently break the "never throws" promise this docstring makes. `file:src/lib/scheme/transforms.ts:84-86`.
- `schemeFromPalette` (35-52): pure, builds `schemeDetails` + a display `colors` map from `palette.themeColors`. Immutable (fresh objects). Correct. Matched by `tests/popup-state.test.ts:300-315` and reused across `tests/content.test.ts` / `tests/site-persistence.test.ts`.
- `invertScheme` (125-139): returns the input unchanged when there is no palette (127-129) — correct and total; otherwise inverts, **preserves overrides** (136) and **flips `invert`** (`!details.invert`, 137). Defaults intensity via `DEFAULT_INTENSITY` (133). Pure. Good.
- `resolvePalette` (104-106) and `resolveOverrides` (113-119): private helpers, correctly factor the "use stored, else regenerate locally from seed+mode" and "explicit wins, empty→undefined" rules shared by `applyPayloadForScheme` + `schemeWithIntensity`. Good internal DRY.
- `schemeWithIntensity` (166-178): immutable spread, always resolves a concrete palette so the persisted `savedScheme` can be reapplied faithfully — exactly what `loadDecision` (in `site-state.ts`) requires (it rejects schemes without a palette). The two files are contract-consistent. Verified.
- No reducer here; nothing mutates inputs. Purity criteria satisfied throughout.

### Notes (non-blocking)
- **[Low] `GeneratePaletteOptions` (54) and `GenerateResult` (67) are exported but have no external consumer.** Grep finds them used only as the param/return types of `generateForSelection` within this file (and not re-imported by name anywhere). Exporting a function's param/return types is a defensible convention (lets callers name them), and `generateForSelection` IS consumed externally (3 refs), so a caller could want `GeneratePaletteOptions`. Borderline — leave as-is, or drop the `export` if no caller ever names them. No functional impact. `file:src/lib/scheme/transforms.ts:54,67`.
- **[Low] Options-build duplication.** `applyPayloadForScheme:154-157` and `schemeWithIntensity:174-177` both build `resolved ? { intensity, overrides: resolved } : { intensity }`, the same shape as `site-state.ts:80-83` and the content/engine assembly. A shared `applyOptions(intensity, overrides)` helper would unify all four. Cross-file nit; the in-file repetition is already minimized via `resolveOverrides`.

## Naming / comments / architecture
- Names are domain-correct and free of React/Redux jargon (`generateForSelection`, `applyPayloadForScheme`, `schemeWithIntensity`, `invertScheme`). Good.
- Comments are logic-only and accurate. The header (1-16) correctly explains WHY generation only produces palette+options (the popup can't see the page's computed styles) and that the module is pure/total/DOM-free/`chrome.*`-free — all true. No stale paths.
- Domain fit: this is the core of the scheme domain; imports are `lib/color`, `lib/palette`, `types`, `./mode` — no DOM, no `chrome.*`, no popup/picker. Clean.
