# Review: `src/lib/engine/role-rules.ts`

**Purpose:** The root-scoped role-text CSS emitter. Builds the page-level + per-tinted-surface text-color rules (scoped under `[data-thememaker]` so they beat site single-class colors), each floored against a deterministic reference surface. Pure string building over `ResolvedRoles`.

**LOC:** 55 non-comment, non-blank lines. Within the ≤200 limit.

## Findings

No blocking/high findings. Clean module.

### NOTE — `harderRef` recomputes `contrastRatio` per seed, ignoring `large` (`role-rules.ts:65-72, 38-39`)
`harderRef(seed)` picks the lower-contrast of `{themedBase, roleSurface}` using `contrastRatio(seed, a/b)`. It's passed as `refFor` and called as `refFor(seed, large)` (line 39), but `harderRef` ignores the `large` arg. That's fine — the *reference bg choice* is intensity/size-independent, and `large` is still threaded into the final `roleText(seed, ref, large)` floor. Just noting the deliberately-unused parameter (signature parity with the scoped `() => ref` variant). Not a bug.

### NOTE — Seven role rules built as a fixed array literal (`role-rules.ts:40-48`)
The seven `${sel(...)} { color: ... }` rules are a hardcoded mapping (tags → role seed). Adding a new text role means editing this literal. That's appropriate for a small fixed taxonomy; no action.

## Correctness — verified clean
- Specificity engineering is sound and matches the comment: bare tag (0,0,1) loses to a site single-class `!important`; scoping under `[data-thememaker]` lifts page rules to (0,1,1); `[data-tm-surf="…"]` variants to (0,2,1). The `sel()` helper builds the descendant selectors so new/typed nodes match instantly (no observer round-trip). ✔
- `harderRef` correctly floors page-level seeds against whichever endpoint of `{themedBase, roleSurface}` is the *harder* (lower-contrast) case, so text is AA on the base and on a generic surface and every blend between — the stated invariant holds. The `a === b` short-circuit avoids a redundant compare. ✔
- Per-surface variants floor against that fixed surface bg (`() => ref`) — text inside a card/code/banner/comp surface is AA against *that* surface. ✔

## Naming / duplication / architecture
- Names clear (`roleRulesFor`, `buildRoleRules`, `harderRef`, `sel`, `c`). The terse `c`/`sel` locals are fine given the tight scope and adjacent docs.
- **No color-math duplication** — only `contrastRatio` from `../color`; the AA floor is delegated to `roles.roleText` (which wraps `nudgeToAA`). ✔
- `roleRulesFor` is correctly private (not exported); only `buildRoleRules` is the public seam. No over-wide export.
- No `popup`/`picker` import.

## Comment quality
- Logic-only, accurate, and the specificity rationale is exactly the kind of non-obvious "why" that earns a comment. No stale paths, no history.
