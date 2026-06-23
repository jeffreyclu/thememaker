import { defineManifest } from "@crxjs/vite-plugin";

import pkg from "../package.json";

/**
 * MV3 manifest, driven through CRXJS so entry points reference the bundled
 * `src/*.ts` files. CRXJS rewrites these to the hashed `dist/` outputs at
 * build time.
 *
 * Phase 1 architecture:
 *  - No `content_scripts`: nothing auto-runs on every page. The popup injects
 *    on demand via `chrome.scripting` (granted by `activeTab` on the user
 *    gesture). This removes the "read and change all your data on all websites"
 *    install warning.
 *  - Permissions diet: `activeTab` + `scripting` + `storage` only.
 *  - No `web_accessible_resources`: the injection model needs none.
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
