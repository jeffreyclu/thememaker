# Refactor plan — `src/content/picker-panel.ts`

**Non-comment LOC: 133.** Verdict vs ≤200: **PASS.**

The in-page Shadow DOM floating-control view (`mountPickerPanel`). A thin view that renders rows from the pure model (`picker-panel-model.ts`) and reports intents via callbacks. Under budget. No split needed.

Note: ~37 of its lines are the inline `PANEL_STYLES` CSS template (44–80) — not code complexity, just an embedded stylesheet. It does not warrant extraction (keeping the styles next to the markup they style is correct for a self-contained shadow-root component), but if a hard line-cap forced it, `PANEL_STYLES` could move to a `picker-panel-styles.ts` string export.

## Duplication found
None. It consumes `overrideRows`/`OverrideRow` from `picker-panel-model.ts` (which itself participates in the override-grammar de-dup, D4/D5/D6 — see that file's plan). No change to this file from the de-dup.

## Long functions
- `mountPickerPanel` (86–190, ~85 LOC) — a component factory: builds the shadow host + shell, defines `renderRow`/`render`, wires button handlers, returns the handle. The length is co-located DOM construction (the `el()` helper keeps it typed), not branching complexity. Acceptable for a self-contained component. If trimmed, extract `buildShell(shadow)` (host/style/header/actions construction, ~40 LOC) from the render/handler logic.

## Ordered steps
No action required.
