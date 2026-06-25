/**
 * MV3 service worker — intentionally a no-op stub.
 *
 * Apply / reset / query / pick are no longer routed through the worker: the
 * popup sends them DIRECTLY to the active tab's always-on content script
 * (`chrome.tabs.sendMessage`), which owns all page-side effects. There is no
 * `chrome.scripting.executeScript` injector anymore, so the worker has nothing
 * to route.
 *
 * We keep a trivial worker because CRXJS wires the `background.service_worker`
 * manifest entry and some MV3 setups expect one to exist. If a future feature
 * needs background work (alarms, cross-tab coordination), it grows here.
 */
export {};
