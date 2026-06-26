# Review: src/lib/color/css-color.ts

**LOC**: 78 (non-comment). Well under 200.

Tolerant (null-returning) string parsing/formatting over the throwing `index.ts` core, for computed `rgb()`/`rgba()`/`transparent` values. DOM-free, `chrome.*`-free as claimed — verified.

## Findings

- **Medium** — duplication: `cssColorToHex` (lines 68-84) re-implements the same `rgba?(...)` regex + transparent/alpha-0 handling that `parseCssColor` (lines 27-56) already does, then inlines its own hex emitter instead of going through `rgbTupleToHex`. `cssColorToHex` is reducible to `const c = parseCssColor(value); return c ? rgbTupleToHex(c) : null;`. Fix: collapse to that and delete the second regex. (Note `parseCssColor` also handles `#hex` input, which `cssColorToHex` silently drops — the collapse fixes that gap too.)
- **Medium** — `alphaOf` (line 98) uses a *third* copy of the rgba regex, and only matches `rgba(` (not `rgb(`/hex), so e.g. `rgb(0,0,0)` falls to the `? 1` branch by accident rather than by match — works, but fragile. Fix: reuse `parseCssColor`/a shared regex constant; the three near-identical regexes should be one.
- **Low** — header doc (lines 2, 13) calls the core `color.ts`; the actual file is `index.ts`. Stale path. Fix: update references.
- **Low** — `withAlpha` (line 104) defaults an unparseable hex to `[0,0,0]` (silent black). Acceptable for the documented use, but worth a one-line note that bad input → opaque-ish black rather than null.

No DOM/chrome leakage, no security issues. The regex duplication is the main thing to fix.
