# Thememaker — Chrome Web Store submission kit

Everything needed for the listing + the review form. (Permission set below
reflects the post-refactor manifest, where `scripting` is removed — see
"Permissions".)

---

## Name
**Thememaker — recolor any website**

## Summary (≤132 chars)
Recolor any website to a generated color scheme, live. Pick a vibe, tune the intensity, customize any element. Private, no account.

## Category
Productivity (alt: Accessibility)

## Single purpose (required by Chrome)
Thememaker applies a user-chosen color theme to the websites the user enables, recoloring the page in place and remembering the choice per site.

## Detailed description (listing body)
Make the web look the way you want. Thememaker generates a color scheme and applies it live to any site you choose — backgrounds, surfaces, and text all recolored, with readable contrast guaranteed.

**Why it's different**
- **Adaptive, not a blunt filter.** It reads each page and recolors by the *role* of each element (page, card, button, heading, link, body), so sites stay legible instead of being inverted into mush.
- **Readable by design.** Every text color is automatically nudged to meet WCAG AA contrast against what it sits on — no invisible text.
- **Intensity dial.** A single slider crossfades between the original site and your theme, from a subtle tint to a full repaint.
- **Customize anything.** Click any element on the page and set its exact color — applies to every element of that kind.
- **Invert.** Flip any theme light↔dark in one click.
- **Remembers per site.** Enable a site once; it re-themes automatically on every visit.

**Private by design**
- Works on-device. No account, no analytics, no tracking, no ads.
- The only thing ever sent off your device is a single color value + a harmony mode, to a public color API for palette suggestions — never the pages you visit or any personal data. Works offline with on-device generation.

Open source. See the privacy policy for exactly what's stored and sent.

---

## Permissions — justifications (for the review form)
Final permission set after the engine refactor: `activeTab`, `storage`, and host access `<all_urls>`.

- **`storage`** — to save your themes, favorites, per-site enable state, and settings (`chrome.storage.local`/`sync`). Nothing leaves the device except via sync, which is the browser's own account sync.
- **Host access `<all_urls>`** — Thememaker's purpose is to recolor *any* site the user chooses, so it needs the ability to run its color-only CSS on any origin the user enables. It reads a page's *computed colors on-device* to decide what to recolor; no page content is collected or transmitted. Theming only activates on sites the user explicitly enables.
- **`activeTab`** — to act on the tab the user is currently viewing when they open the popup.
- **`scripting`** — REMOVED. (The earlier build injected the engine via `chrome.scripting.executeScript`; the engine now runs as the bundled content script, so this permission is dropped. Smaller footprint, easier review.)

## Data-use disclosure (review form answers)
- Does the item collect or use personal/sensitive user data? **No.**
- Web history / activity / page content collected? **No.**
- Data sold to third parties? **No.**
- Data used for anything other than the single purpose? **No.**
- Remote code executed? **No** (all code ships in the package; no eval/remote scripts).
- Network: a color hex + harmony mode is sent to `thecolorapi.com` for palette generation only; disclosed in the privacy policy.
- Privacy policy URL: **(host `PRIVACY.md` — e.g. GitHub Pages or the repo's raw URL — and paste the link here).**

---

## Screenshots to capture (1280×800 or 640×400; need ≥1, ideally 4–5)
1. **The popup** over a recognizable site (e.g. Wikipedia/GitHub), a theme applied — show the mode select, intensity slider, Invert, Generate/Customize.
2. **Before/after** of a content-heavy page (split or two shots) — same page original vs themed.
3. **Customize in action** — the on-page picker panel open, mid-pick on an element.
4. **Intensity crossfade** — same page at low vs high intensity (shows the dial).
5. **A dark-inverted theme** of a normally-light site (shows Invert).

Optional promo tile: 440×280 (small) — logo + tagline on a themed gradient.

---

## Pre-submission checklist
- [ ] Bump version to **1.0.0** (currently 0.2.0) for launch.
- [ ] Refactor merged (engine modularized, `scripting` permission dropped) and manifest reflects the final permission set.
- [ ] `npm run build` clean; load `dist/` unpacked and smoke-test on 3–4 sites (incl. a heavy SPA).
- [ ] Privacy policy hosted; URL pasted into the listing + the form above.
- [ ] Screenshots captured (above).
- [ ] Icons present (16/32/48/128 ✓).
- [ ] Package: `npm run build` → zip the **contents of `dist/`** (not the folder) → upload.
- [ ] Description + permission justifications + data-use answers pasted from this file.

## Packaging
```
npm run build
cd dist && zip -r ../thememaker-1.0.0.zip . && cd ..
# upload thememaker-1.0.0.zip to the Web Store developer dashboard
```
(Consider adding an `npm run package` script that does this.)
