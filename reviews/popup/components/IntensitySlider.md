# Review: src/popup/components/IntensitySlider.tsx

**LOC**: 39 (under 200)

## Findings

- **Low** — `IntensitySlider.tsx:37` — `onChange(Number(e.target.value))` casts the raw `number` to `Intensity`. With `min`/`max`/`step` set this is range-safe in practice, but the value isn't validated/clamped before being passed as the branded `Intensity` type. If `Intensity` is a constrained brand, route through its constructor/guard so a programmatic or out-of-range value can't slip past the type. Non-blocking given native input bounds.

- **Low** — `IntensitySlider.tsx:34-36` — `aria-valuemin/max/now` are redundant on a native `type="range"` input; the browser derives these from `min`/`max`/`value`. Harmless but dead-weight; safe to drop.

## React discipline
Correctly pure/presentational and memoized — value + onChange via props, no business logic (debounce correctly lives in the action, per the comment). Controlled input is handled properly (`value` + `onChange`). Label correctly associated via `htmlFor`/`id`. Clean.
