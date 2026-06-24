# Review: `src/manifest.config.ts`

**Purpose:** The MV3 manifest, defined in TS via CRXJS `defineManifest` (source of truth, no hand-edited `manifest.json`). Declares permissions, the `<all_urls>` content script, the popup action, and the service worker.
**LOC:** 58.

## Overall grade: **B+**

A clean, well-documented manifest with the version/description pulled from `package.json` (single source of truth) and an honest docstring about the `<all_urls>` permission trade-off. The grade is held back not by code quality but by the SUBSTANCE of what it declares: `<all_urls>` at `document_start` is the single biggest scrutiny target for a public extension, and while the trade-off is documented, it deserves the reviewer's spotlight.

## Findings

### [high] `<all_urls>` content script at `document_start` — the defining scrutiny point for this extension
Lines 36–43. The content script matches `<all_urls>` and runs at `document_start` on EVERY page. This re-introduces the "read and change all your data on all websites" install warning. The docstring (and PLAN.md) explicitly accept this as the cost of per-site auto-reapply. That's a legitimate, RECORDED decision — but for a "withstand public scrutiny" audit it must be called out as THE thing reviewers/users will react to.

**Why it matters:** Public-repo defensibility + privacy. An always-on all-sites content script that reads `chrome.storage` and writes `localStorage` on every origin is the maximal-trust posture. The PLAN frames it as "the user chose always-on over optional per-site permissions" — but the manifest grants it unconditionally; the user doesn't actually get the per-site-permission alternative.

**Concrete fix:** This is a product decision, not a bug — but make it MORE defensible: (a) ensure PRIVACY.md explicitly covers the `<all_urls>` script + the per-origin `localStorage` cache (`__thememaker_base__`); (b) consider whether `optional_host_permissions` + per-site grants could deliver most of the value with far less install friction (the PLAN says this was weighed — link that reasoning from here); (c) confirm `all_frames: false` is the right call (it is, for perf/safety — good). At minimum, this file should be the place a reader is pointed to the recorded decision.

### [medium] The content script runs the FULL adaptive engine on every themed page load — the manifest grants the surface, the engine spends it
Tie-in: because the script is `<all_urls>` + `document_start`, the heavy `applyAdaptiveScheme` (MutationObserver, DOM walk) can attach to ANY site the user themed. The manifest is correct; the cost lives in `inject.ts`. Noting here because the manifest is what authorizes that always-on footprint.

**Concrete fix:** None at the manifest layer; the `MAX_THEMED`/time-slicing budgets in inject.ts are the mitigation. Just be aware the manifest is the authorization for that.

### [low] `permissions` correctly minimal (`activeTab`, `scripting`, `storage`) — host access comes only from `matches`
Lines 35. Good: no broad `host_permissions` entry; the host access is implicit in the content-script `matches`. This is actually the more honest place for it. The docstring explains this precisely.

### [nit] No `minimum_chrome_version` / no CSP override
For a public store listing, pinning a `minimum_chrome_version` (the engine uses `requestIdleCallback`, `crypto.randomUUID`, modern APIs) would prevent installs on browsers that can't run it. Minor store-readiness item (PLAN Phase 4).

## What's GOOD
- **Single source of truth**: `name`/`description`/`version` pulled from `package.json` (`pkg.description`, `pkg.version`) so the manifest can't drift from the package. Exactly right.
- **TS-defined manifest via CRXJS** with entry points referencing `src/*.ts` (rewritten to hashed dist outputs) — no hand-edited `manifest.json` to rot, as the README enforces.
- **Minimal permissions** with host access deliberately sourced from `matches`, not a blanket `host_permissions` — and the trade-off is documented in-file AND in PLAN.md (a recorded decision, not a silent one).
- **`all_frames: false`** is the correct, safer/faster default for a theming engine.
- The docstring is honest about the permission cost rather than hiding it — good faith for a public repo.

## Top 3 concrete changes
1. **Cross-link the recorded `<all_urls>` decision** (PLAN.md) and ensure PRIVACY.md covers both the all-sites script and the per-origin `localStorage` cache — make the maximal-trust posture maximally transparent.
2. **Re-evaluate (or link the prior evaluation of) `optional_host_permissions` + per-site grants** as a lower-friction alternative, since the PLAN claims the user "chose" always-on but the manifest grants it unconditionally.
3. **Add `minimum_chrome_version`** for store readiness given the modern APIs the engine relies on.
