# Review: `src/lib/engine/role-classify.ts`

**Purpose:** Engine-internal semantic surface classification: maps an element's tag/class/text to a surface role (button/code/card/banner/comp/generic) and its fixed-theme fill, builds the document-order button index, and the skip/editable/image predicates the walk consumes.

**LOC:** 133 non-comment, non-blank lines. Within the ≤200 limit.

## Findings

### NOTE — `classifyButton` reads `el.textContent` on every button in the hot path (`role-classify.ts:63-82`)
`(el.textContent || "").toLowerCase().trim()` materializes and lowercases the *entire* subtree text of every button-like element during the walk. For a button wrapping a large subtree (rare but possible — e.g. a card-as-button), this is a full text serialization per element.
**Why it's only a NOTE:** Only runs for button-like elements (a small fraction of nodes), and only after the cheaper class regex misses. Bounded. Acceptable.
**Fix (optional):** Cap with `.slice(0, 64)` before the regex tests, since the keyword set only matches short labels anyway.

### NOTE — Space-padded substring tag matching via `.indexOf(\` ${tag} \`)` (`role-classify.ts:29-32, 118-141`)
Tag membership is tested as `CODE_TAGS.indexOf(\` ${tag} \`) >= 0` against space-padded strings (`" pre code kbd samp "`). This works and is fast, but it's an idiosyncratic idiom; a `Set<string>` lookup (`CODE_TAGS.has(tag)`) is clearer and equally fast, and removes the padding-correctness footgun (a missing leading/trailing space would silently break matching).
**Why it's only a NOTE:** Correct as written and genuinely cheap. Readability/robustness nit.

## Correctness — verified clean
- `buildButtonOrder` wraps `querySelectorAll` in try/catch and returns an empty map on failure — `classifyButton` then falls back to "not index 0 ⇒ secondary" via `?? 0`. Best-effort, no throw into the walk. ✔
- The class/text/document-order precedence (secondary-class → primary-class → secondary-text → primary-text → order) is deterministic and documented. The `buttonOrder` snapshot (vs a mutating counter) keeps "first button = CTA" stable across observer increments — the comment's claim holds. ✔
- `isSkippable`/`isEditableRoot`/`hasImageBackground` are pure tag/attr/string predicates, no DOM mutation. `hasImageBackground` correctly treats gradients (no `url(`) as replaceable and `url(...)` as preserve. ✔
- `makeSurfaceFillFor` is **total** (never null) — generic surface is a first-class role; no undefined-fill path into the painter. ✔

## Naming / duplication / architecture
- Names clear and role-centric. The `PRIMARY_TEXT`/`SECONDARY_TEXT`/`PRIMARY_CLASS`/`SECONDARY_CLASS` regexes are heuristic-heavy but each is documented by its role.
- No color math (this module decides *which* role; colors come from `ResolvedRoles`). ✔
- Defers `isButtonLike` to the shared `../overrides` so the picker/popup/engine agree on "what's a button" — correct centralization (comment lines 12-13 confirm intent). ✔
- No `popup`/`picker` import.

## Comment quality
- Logic-only, accurate, explains the role-decoupling invariant (theme color is a pure function of role) well. No stale paths. The module header's note that `getComputedStyle` reads "stay in the walk, not here" documents a real layering boundary the code honors.
