import { defineManifest } from "@crxjs/vite-plugin";

import pkg from "../package.json";

/**
 * MV3 manifest, driven through CRXJS so entry points reference the bundled
 * `src/*.ts` files. CRXJS rewrites these to the hashed `dist/` outputs at
 * build time.
 *
 * Architecture:
 *  - Always-on content script (Phase 3 persistence): an `<all_urls>` content
 *    script runs at `document_start` on EVERY page, reads the saved per-site
 *    theme from `chrome.storage.local`, and AUTO-REAPPLIES it so a reload or
 *    revisit restores the user's look (see `src/content/index.ts`). This is the
 *    accepted trade-off for persistence: it RE-INTRODUCES the "read and change
 *    all your data on all websites" install warning (an explicit product
 *    decision — broad host access in exchange for per-site auto-reapply).
 *  - The popup ALSO injects on demand via `chrome.scripting` (granted by
 *    `activeTab` on the user gesture). Both paths share the same engine and the
 *    single `<style id="themeMaker">`, so they never double-apply.
 *  - Permissions: `activeTab` + `scripting` + `storage`.
 *  - No `web_accessible_resources`: neither path needs any.
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
  permissions: ["activeTab", "scripting", "storage"],
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
