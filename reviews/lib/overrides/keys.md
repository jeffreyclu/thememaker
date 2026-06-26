# Review: src/lib/overrides/keys.ts

**LOC**: 55

Pure string grammar for `<tag>|<prop>` override keys. No DOM / `chrome.*` — good domain fit. Well-documented and cohesive.

## Findings

**Low** (keys.ts:76): The label formatter collapses any non-`background` prop to `"text"` (`prop === "background" ? "background" : "text"`). If a malformed key like `div|` or `div|foo` is parsed, it silently labels it "text". Minor, since keys are produced internally via `makeOverrideKey` (typed to `background|color`), but the leniency is a latent foot-gun if key sources widen. Consider asserting prop ∈ {background,color} or labeling unknown props explicitly.

**Low** (keys.ts:80-85 / parse `role` field): The `ParsedOverrideKey.role` / `OverrideRow.role` naming overloads "role" to mean "the whole key" even for `<tag>|<prop>` keys (per the comment "named `role` for the panel's data attrs"). Reusing `role` for non-role keys is mildly confusing; a name like `key` would read truer, but it is documented.

Otherwise no findings — `makeOverrideKey`/`parseOverrideKey` round-trip cleanly and the `validateColor` toggle is sensible.
