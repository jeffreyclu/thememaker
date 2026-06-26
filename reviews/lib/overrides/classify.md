# Review: src/lib/overrides/classify.ts

**LOC**: 17

Single `isButtonLike(el)` predicate. Reads only tag/attributes, no `chrome.*`/computed styles as documented. Good domain fit and de-duplication rationale.

## Findings

**Low** (classify.ts:27): The class-token regex `/(^|[-_ ])(btn|button)([-_ ]|$)/` matches on `-`/`_`/space boundaries but not other delimiters real-world class systems use (e.g. BEM `__`/`--` is covered by single chars, but Tailwind-style `:` or `/` are not). Likely fine for the heuristic's intent; flagging only that "button-like" via class is inherently best-effort. No fix required.

**Low** (classify.ts:26-27): `getAttribute("class")` rather than `el.className` — correct choice for SVG elements (where `className` is an `SVGAnimatedString`), worth a one-line comment noting that intent so it isn't "simplified" later into a bug.

Otherwise no findings — logic is correct and order of checks is sensible.
