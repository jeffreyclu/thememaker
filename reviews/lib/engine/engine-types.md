# Review: src/lib/engine/engine-types.ts

**LOC**: 11

No findings.

Pure type-contract module shared by Engine and painter — exactly where these interfaces belong (not the shared root `types.ts`, since they are engine-internal). `OriginalStyle` and `EngineState` are both clearly engine-scoped. No DOM / `chrome.*` imports, consistent with the header claim. Comments are accurate and explain non-obvious invariants (monotonic `nextId`, per-apply reset of `themedCount`/`capped`) without stale paths or history noise. No dead or over-wide exports.
