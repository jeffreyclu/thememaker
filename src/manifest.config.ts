import { defineManifest } from "@crxjs/vite-plugin";

import pkg from "../package.json";

/**
 * MV3 manifest, driven through CRXJS so entry points reference the bundled
 * `src/*.ts` files. CRXJS rewrites these to the hashed `dist/` outputs at
 * build time.
 *
 * Architecture:
 *  - Always-on content script: an `<all_urls>` content script runs at
 *    `document_start` on every page, reads the saved per-site theme from
 *    `chrome.storage.local`, and auto-reapplies it so a reload or revisit
 *    restores the user's look (see `src/content/index.ts`). The `<all_urls>`
 *    match is the trade-off for this persistence: it triggers the "read and
 *    change all your data on all websites" install warning, accepted in exchange
 *    for per-site auto-reapply.
 *  - The popup drives on-demand apply/reset/query by sending messages directly
 *    to that same always-on content script (`chrome.tabs.sendMessage`), which
 *    runs the engine in the page. The popup-driven and auto-reapply paths share
 *    the single `<style id="themeMaker">` so there is no double-apply.
 *    `activeTab` is needed for active-tab resolution.
 *  - Permissions: `activeTab` + `storage`. No `scripting` is requested.
 *  - No `web_accessible_resources`: no path needs any.
 */
export default defineManifest({
  manifest_version: 3,
  name: "Thememaker",
  description: pkg.description,
  version: pkg.version,
  icons: {
    "16": "icon16.png",
    "32": "icon32.png",
    "48": "icon48.png",
    "128": "icon128.png",
  },
  permissions: ["activeTab", "storage"],
  content_scripts: [
    {
      matches: ["<all_urls>"],
      js: ["src/content/index.ts"],
      run_at: "document_start",
      all_frames: false,
    },
  ],
  action: {
    default_title: "Thememaker",
    default_popup: "src/popup/index.html",
    default_icon: {
      "16": "icon16.png",
      "32": "icon32.png",
      "48": "icon48.png",
      "128": "icon128.png",
    },
  },
  background: {
    service_worker: "src/background/index.ts",
    type: "module",
  },
});
