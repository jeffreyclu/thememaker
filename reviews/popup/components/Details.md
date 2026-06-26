# Review: src/popup/components/Details.tsx

**LOC**: 61 (under 200)

Connected disclosure wrapping a pure `DetailRow` leaf. Row/override derivation is delegated to `lib/scheme` (`overrideRows`, `schemeDetailRows`) and `describeColor` — business logic stays out of the component. Memoization appropriate. Header comment accurate.

## Findings

- **Low** — Seed string assembly inline (lines 40-42). The `rootColorName ?? describeColor(...)` + mode concatenation is light view-formatting, borderline acceptable in a connected component, but it is the one bit of logic not delegated to `lib/scheme`. Fix (optional): move to a `schemeSeedLabel(current)` helper alongside `schemeDetailRows` for consistency and unit-testability.
- **Low** — Key collision risk on detail rows (line 58). `key={\`${tags}-${color}\`}` is non-unique if two rows share the same tags+color (e.g. duplicate roles mapping to one hex). Unlikely given distinct roles, but `role`-based keys (as used for overrides on line 64) would be safer if `schemeDetailRows` exposes a stable id.
- **Note** — `overrides` computed every render (line 38) without memo; cheap array map, fine. `overrideRows`/`schemeDetailRows` purity assumed (out of scope).

No blocking/high findings. Correctly layered.
