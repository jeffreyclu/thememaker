# Review: `src/picker/hooks/useApplyOverrides.ts`

**Purpose:** The picker's apply + persist intents. Each intent advances the live
overrides, applies the result live through the engine (reusing the palette), and
persists onto this origin's saved scheme (via the serialized
`persistOverrides`). `onColorChange` uses `patchColor` (live ref, no re-render, so
the uncontrolled color input is not remounted mid-drag); `onClearRole` /
`onClearAll` / `pick` go through `dispatch` so the rows repaint. Exposes the four
intents the panel + `usePickSession` bind.

**LOC:** 45 non-comment / non-blank — within the ≤200 limit.

## Findings

- **LOW — `optionsFor` re-implements the "omit overrides when empty" convention duplicated in two other modules.**
  `useApplyOverrides.ts:27-31` builds `{ intensity, overrides? }`, omitting
  `overrides` when the map is empty. The identical shape + omit rule appears in
  `lib/scheme/site-state.ts:81-82` (`overrides && Object.keys(overrides).length > 0
  ? { intensity, overrides } : { intensity }`) and the persist side enforces the
  same key-absence rule in `lib/storage/persist-overrides.ts:39`. Three copies of
  one convention ("absence of the key == no overrides") that must stay in lockstep
  or `loadDecision` / persist / live-apply quietly disagree. Concrete fix: lift a
  single `applyOptionsFor(intensity, overrides)` helper into a shared module
  (`lib/scheme` or `lib/overrides`) and call it from all three sites. Low impact
  today (the rule is simple and currently consistent), but it is exactly the kind
  of cross-layer convention drift the contract warns about. NOTE.

- **LOW — `apply` fires the engine and persist on every `onColorChange` (per drag tick).**
  `useApplyOverrides.ts:45-49, 59`. Each color-drag `input` event runs an engine
  repaint + enqueues a storage write. Persist is serialized downstream
  (`persistOverrides`) so no update is lost, and the engine apply is in-page/cheap,
  so this is not a bug — just churn. If profiling flags it, debounce the *persist*
  only (keep the live apply immediate). NOTE.

## What is good
- **Single source of truth for the next map.** `commit` recomputes the next
  overrides from `overridesReducer(getTheme().overrides, action)` and feeds the
  SAME action to `dispatch` — so apply/persist see exactly the state React commits,
  with no risk of the imperative apply and the reducer diverging. This is the
  correct way to bridge "apply now" with "render later" off one reducer.
- **The ref-vs-dispatch split is principled:** drags → `patchColor` (no render, so
  the uncontrolled input survives), discrete picks/clears → `dispatch` (render).
  Matches the provider's design and the uncontrolled-input contract.
- **Reuses the shared engine + shared persist** — no theming or color logic
  reimplemented in the hook; it is pure intent wiring. Memoized on the stable
  `[getTheme, dispatch, patchColor]`. Verb-named, logic-in-hook discipline is
  correct.
