# Thememaker — Privacy Policy

_Last updated: 2026-06-24_

Thememaker is a browser extension that applies a custom color scheme to websites
you choose. We designed it to keep your data on your own device. This policy
explains exactly what it does and does not do.

## What we store

Thememaker stores only your **theming preferences**:

- The color schemes you generate or save as favorites
- Which sites you have enabled theming for, and the theme applied to each
- Your settings (intensity, color mode, invert) and per-element customizations

This data is stored using the browser's own storage:

- **`chrome.storage.local`** — kept on this device only.
- **`chrome.storage.sync`** — synced across your own signed-in browsers by the
  browser vendor (e.g. your Google account). It is **never** sent to us; we do
  not operate any server that receives it.

You can clear all of it at any time by removing the extension or using your
browser's "clear data" controls.

## What we send over the network

To generate a color palette, Thememaker may send **only a single color value (a
hex code) and a harmony mode** (e.g. "triad") to a third-party color service,
**thecolorapi.com**, which returns a matching palette. 

- We do **not** send the pages you visit, their URLs, their content, your
  identity, or any personal information.
- If you are offline or the service is unavailable, Thememaker falls back to
  generating the palette entirely on your device.

We are not affiliated with thecolorapi.com; see their site for their own terms.

## What we do NOT do

- We do **not** collect, transmit, or sell personal or browsing data.
- We do **not** use analytics, tracking, advertising, or fingerprinting.
- We do **not** load or run any remote code; the extension runs entirely from
  the code reviewed and shipped in the package.

## Permissions and why they are needed

- **`storage`** — to save your themes and settings (above).
- **`scripting`** + host access (`<all_urls>`) — to inject the color-only CSS
  that themes a page. The content script reads a page's computed colors **on
  your device** to decide what to recolor; nothing about the page leaves the
  device.
- **`activeTab`** — to act on the tab you are currently using.

Theming applies only on sites you enable; broad host access exists so the
extension *can* work on any site you choose, not so it can monitor them.

## Contact

Questions or requests: hi@jeffreyclu.com
