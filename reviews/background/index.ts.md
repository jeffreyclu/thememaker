# Review: `src/background/index.ts`

**Purpose:** MV3 service worker — the message-passing hub. Wires `chrome.runtime.onMessage` to `routeMessage` with a `chrome.scripting`-backed injector, plus an install log.
**LOC:** 34.

## Overall grade: **A-**

A correctly-thin service worker. All real logic is delegated to the (tested) `router.ts`; this file is just the wiring + the MV3 async-response protocol, done right. Essentially the minimal correct shape.

## Findings

- [x] FIXED: removed the no-op `onInstalled` breadcrumb (`console.log("[Thememaker] service worker installed")`) entirely. There's no migration to run, so an empty install listener is pure noise; dropped the whole listener rather than keep a hollow handler. Build/test/lint green.

### [low] The install `console.log` is a leftover dev breadcrumb
Lines 15–17: `onInstalled` logs "service worker installed". Harmless, but it's a noise log that ships to users' service-worker console with no diagnostic value (no version, no migration). Either make it useful (log version / run a migration hook) or drop it.

**Why it matters:** Minor — production log hygiene for a public extension.

**Concrete fix:** Remove it, or upgrade to a real install/upgrade handler (e.g. log `chrome.runtime.getManifest().version` and run any storage migration). Right now it's a no-op breadcrumb.

- [x] VERIFIED-INVALID (left as-is): the review itself says "None strictly required given the threat model… Don't inflate this — it's low-risk here." The routed actions (apply/reset/query a style on the active tab) are not sensitive and `routeMessage` is total/safe. Adding a `sender.id` check would be speculative hardening; left unchanged per the reviewer's own guidance.

### [low] `onMessage` listener has no `sender` validation
Lines 19–32. Any context that can `chrome.runtime.sendMessage` to this extension reaches `routeMessage`. For an extension with `activeTab`+`scripting`, the messages are gesture-bound and low-risk, and `routeMessage` is total/safe — but a defensible public extension typically checks `sender` for sensitive actions.

**Why it matters:** Marginal security/defensibility. The actions here (apply/reset/query a style on the active tab) are not sensitive, so this is informational, not a real hole.

**Concrete fix:** None strictly required given the threat model; if you want belt-and-suspenders, ignore messages whose `sender.id !== chrome.runtime.id`. Don't inflate this — it's low-risk here.

### [nit] `export {}` to mark the file as a module
Line 34. Standard MV3/TS idiom; fine.

## What's GOOD
- **Correctly thin.** No business logic — `createChromeInjector()` + `routeMessage` do the work, and both are unit-tested. The worker is just composition + protocol. This is exactly how an MV3 hub should look.
- **The MV3 async-response protocol is correct**: `return true` keeps the channel open, `routeMessage(...).then(sendResponse).catch(...)` guarantees a response is always sent (even on throw), so the popup's `sendMessage` promise never hangs. This is a common MV3 footgun handled properly.
- **Error path is total**: a rejected route still calls `sendResponse({ok:false,error})`, so the caller always gets a typed response.
- Single injector instance created once at module load — correct (the worker may be torn down/restarted, and `createChromeInjector` resolves the tab fresh per call).

## Top 3 concrete changes
1. **Drop or upgrade the install `console.log`** to something diagnostic (version/migration) — don't ship a no-op breadcrumb.
2. Optionally add a lightweight `sender.id` check if the threat model later grows (not needed today).
3. Otherwise leave it — this is the right minimal service worker.
