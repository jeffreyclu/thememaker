# Review: `src/lib/router.ts`

**Purpose:** Background message router. `routeMessage(message, injector)` dispatches `APPLY_SCHEME`/`RESET_SCHEME`/`QUERY_STATE` to an injected `Injector` and shapes the `MessageResponse`; `createChromeInjector` is the production `chrome.scripting`-backed implementation.
**LOC:** 124.

## Overall grade: **A-**

Clean dependency inversion: routing logic depends only on the `Injector` interface, so it's unit-tested with a fake while the real `chrome.scripting` lives behind `createChromeInjector`. The router is total (every branch returns a response; throws become `{ok:false}`) with a proper exhaustiveness guard. Minor marks for one confusing expression and a couple of `as` casts in the injector.

## Findings

### [medium] `RESET_SCHEME` returns `applied: !removed && false` — always `false`, written obscurely
Line 53: `return { ok: true, origin, applied: !removed && false };`. `X && false` is `false` for all `X`, so this is unconditionally `applied: false` dressed up to look conditional. A reader will stop to work out whether it depends on `removed` — it doesn't.

**Why it matters:** Readability. Obfuscated constant — the kind of thing an interviewer circles and asks "what does this evaluate to?"

**Concrete fix:** `applied: false, // reset leaves nothing applied`. If the intent was ever "applied is false unless removal failed," that's a different expression (`!removed`) and should be written as such with a test — but as-is it's just `false`.

### [low] `createChromeInjector.run` casts `func as (...a: unknown[]) => T` and `result.result as T`
Lines 97, 100. The `executeScript` typing forces casts to bridge the serialized-function signature. Unavoidable at the `chrome.scripting` boundary (the API's types are weak), but they're unchecked assertions: if `applyAdaptiveScheme` returned something other than `boolean`, `result.result as T` wouldn't catch it.

**Why it matters:** Honest types at the boundary. Acceptable here (it's the irreducible `chrome.scripting` seam) but worth a one-line comment acknowledging the casts are the API's fault.

**Concrete fix:** Keep, but comment why the casts exist (executeScript's `result` is `any`-ish). The `Injector` interface already constrains the return types upstream, so the blast radius is contained.

### [low] `tab.id as number` after an `activeTab` that already guarantees `tab.id != null`
Lines 106, 115, 120. `activeTab` throws if `tab.id == null` (84), so by the call sites `tab.id` IS a number — but TS doesn't narrow across the function boundary, forcing `as number`. Minor.

**Concrete fix:** Have `activeTab` return a refined type (`chrome.tabs.Tab & { id: number }`) so the casts disappear.

## What's GOOD
- **Dependency inversion, textbook.** `routeMessage` depends on the `Injector` interface only; `createChromeInjector` is the single production wiring. Tests inject a fake and assert routing/responses without `chrome.*`. This is exactly the seam the docstring promises and it's clean.
- **Total + exhaustive.** Every branch returns a `MessageResponse`; the `default` uses `const _exhaustive: never = message` so adding a message type is a compile error until routed; the outer try/catch converts any throw to `{ok:false, error}`. Robust error handling — no unhandled rejection can escape.
- **`createChromeInjector` resolves the active tab FRESH per call** with a clear comment about the `activeTab` grant being gesture-scoped — correct MV3 behavior, and the reasoning is documented.
- Small, focused, and the `run<T>` helper neatly unifies the three `executeScript` calls.

## Top 3 concrete changes
1. **Replace `applied: !removed && false` with a plain `false`** (+ comment) — remove the obfuscated constant.
2. **Refine `activeTab`'s return type** to `Tab & { id: number }` so the three `tab.id as number` casts vanish.
3. **Comment the two `executeScript` boundary casts** as the irreducible `chrome.scripting` typing gap. Otherwise this file is solid.
