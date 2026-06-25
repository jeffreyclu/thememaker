/**
 * MV3 service worker — a no-op stub.
 *
 * The worker routes nothing: apply/reset/query/pick all flow from the popup
 * directly to the active tab's always-on content script
 * (`chrome.tabs.sendMessage`), which owns all page-side effects.
 *
 * The stub exists because CRXJS wires the `background.service_worker` manifest
 * entry and some MV3 setups expect one. Background work (alarms, cross-tab
 * coordination) would grow here.
 */
export {};
