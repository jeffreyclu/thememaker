# Review: `src/config.ts`

**Purpose:** Static config — the `modes` list, the `htmlElements` tag-role buckets, and `MAX_HISTORY`.
**LOC:** 34.

## Overall grade: **C**

`modes` and `MAX_HISTORY` are fine, live, and correct. But `htmlElements` (lines 13–31) — over half the file — is DEAD v1-engine config: I verified it is imported ONLY by the dead tag-bucket functions in `theme-engine.ts`, which no production path calls. So a tiny config file is 60% graveyard.

## Findings

### [high] `htmlElements` is dead v1-engine config (only the dead `theme-engine.ts` consumes it)
Lines 13–31. The `darkContainer`/`mediumContainer`/`lightContainer`/`clearContainer`/`darkText`/`mediumText`/`lightText` buckets are the v1 tag-name→role table. Grep confirms the only importer is `theme-engine.ts` (`isContainerElement`/`isTextElement`/`generateScheme`/`buildSchemeStyle`/`calculateTotalColors`), all of which are themselves production-dead (see theme-engine.ts review). `clearContainer` isn't referenced even by the dead code. The v2 engine classifies roles via `getComputedStyle`/tag sets INLINE in `inject.ts`/`mapping.ts` and never touches this table.

**Why it matters:** Dead config that LOOKS canonical. A reader sees a tag-role table in `config.ts` and reasonably assumes it drives theming — it drives nothing. This is the config arm of the `theme-engine.ts` graveyard.

**Concrete fix:** Delete `htmlElements` (and the `HtmlElements` type in types.ts, and `clearContainer` which is dead even within it) when you delete the v1 engine. `config.ts` then shrinks to `modes` + `MAX_HISTORY`.

### [low] `modes` is typed `ColorMode[]` where `ColorMode = string` — no compile-time check the strings are valid
Line 3. Since `ColorMode` is `string` (types.ts), `modes` could contain typos and nothing would catch it. The palette generator's `harmonyHues` switch has a `default` fallback, so a bad mode silently degrades to monochrome.

**Why it matters:** Honest types — the mode taxonomy is known and finite but typed as open `string`.

**Concrete fix:** Make `ColorMode` a union (`'monochrome' | 'monochrome-dark' | ... | 'quad'`) so `modes`, `harmonyHues`, and the popup select are all checked against one source of truth. (Flagged primarily in types.ts.)

### [nit] No module docstring
Every other file has a purpose comment; `config.ts` has none. Minor, but inconsistent with the codebase's otherwise-strong documentation norm.

## What's GOOD
- **`modes` and `MAX_HISTORY` are exactly the right kind of centralized config** — small, named, single source of truth, consumed by the live engine-bridge/storage/theme-engine.
- Keeping `MAX_HISTORY` here (not inline in storage) is the correct call — it's a product constant, not a storage detail.

## Top 3 concrete changes
1. **Delete `htmlElements`** (all seven buckets) and `clearContainer` with the v1-engine removal — it's dead config masquerading as the role table.
2. **Tighten `ColorMode` to a union** so `modes` is validated at compile time.
3. **Add a one-line module docstring** to match the codebase norm.
