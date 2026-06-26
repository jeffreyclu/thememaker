# Review: src/types.ts

**LOC**: 38

Genuinely shared, cross-layer domain types (popup + engine + storage all consume them) — appropriate for the shared root. Verified usage by grep: `Scheme` (12), `RoleOverrides` (11), `ApplyOptions` (10), `Intensity` (8), `ColorMode` (7) are all widely referenced. No `lib`-vs-app layering concern (this is the root, imported downward).

- **Medium — `TagPropKey` is dead (line 63)**: zero references outside this file. Its own sibling `RoleOverrides` doc (line 72-75) explicitly explains why the strict template literal is *deliberately* widened to `Record<string, string>` and not used as the key type — so `TagPropKey` documents a grammar nothing consumes. Fix: either delete it, or if it is kept purely as living documentation of the `<tag>|<prop>` grammar, demote it to a doc comment / co-locate it with the engine override parser rather than exporting an unused type from the shared root.
- **Low — `Intensity = number` alias (line 34)**: a bare `number` alias buys documentation but no type safety (any `number` is assignable). Fine as an intent marker, but note it does not prevent passing an out-of-range value; the real guard is `clampIntensity`. No change required.

Comments are accurate and explain non-obvious invariants (intensity floor rationale, the deliberate key-type widening, the `colors`/`schemeDetails` split). No stale paths, history, or CAPS jargon. `import("./lib/palette").Palette` inline type import (line 100) is fine and avoids a top-level cycle.
