# Review: src/lib/engine/engine-walk-geom.ts

**LOC**: 68

Mostly clean; well-factored pure helpers for the time-sliced walk. Imports stay in `lib` (`role-classify`); no `src/popup`/`src/picker`.

- **Low — `inViewport` margin asymmetry (line 68-70)**: `r.right >= 0` and `r.left <= w2` omit the `margin` band that `r.bottom`/`r.top` apply (`>= -margin`, `<= h + margin`). Horizontal overscan is therefore narrower than vertical. Likely intentional (overscan is vertical-scroll-oriented, and `syncViewportMargin` is `vh()*2`), but the comment doesn't say so. Fix: either apply `margin` symmetrically to `right`/`left`, or add a one-line note that horizontal margin is deliberately omitted.
- **Low — `vw`/`w2` naming (line 45, 64)**: local `w2` is an opaque name (chosen to avoid shadowing the `vw` import-less helper). Minor; rename to `viewW`/`vpW` for readability. `vh`/`vw`/`now`/`expand` are otherwise fine.

Comments are accurate (the jsdom 0x0 rect rationale at line 51-54 and 64-67 is genuinely useful), no stale paths or history noise. Exports all appear consumed by the walk/observer; none over-wide.
