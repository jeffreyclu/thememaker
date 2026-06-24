/**
 * Custom-theme OVERRIDES — now PER-TAG, applied as a SEPARATE CSS layer.
 *
 * Customize records overrides keyed by `"<tag>|<prop>"` (prop = "background" |
 * "color") with EXACT `#rrggbb` values (no AA floor — a deliberate manual
 * choice). The engine emits a sibling `<style id="themeMakerOverrides">` AFTER
 * the main `<style id="themeMaker">` so it wins:
 *   - a real tag → `tag[data-thememaker]{ background-color|color: hex !important }`
 *     (specificity 0,1,1 — beats the engine's per-element `[data-thememaker="N"]`);
 *   - `html`/`body` → a BARE selector (later source order wins at equal spec);
 *   - the sentinel tag `page` → `html, body`.
 * The layer is cleared on reset (`removeSchemeStyle` drops it).
 *
 * This file also covers the picker's PURE per-tag model
 * (`picker-panel-model.ts`): row derivation, label formatting (incl. the `page`
 * sentinel), and the immutable add/edit/remove transitions.
 */
import { afterEach, describe, expect, it } from "vitest";

import {
  STYLE_ELEMENT_ID,
  applyAdaptiveScheme,
  removeSchemeStyle,
} from "../src/lib/inject";
import { generatePalette } from "../src/lib/palette";
import {
  FALLBACK_COLOR,
  overrideRows,
  roleLabel,
  withPickedRole,
  withRoleColor,
  withoutRole,
} from "../src/content/picker-panel-model";

const OVERRIDES_ID = "themeMakerOverrides";
const palette = generatePalette("#3a7bd5", "triad");

/** The CSS text of the override layer (empty string when absent). */
const overrideCss = (): string =>
  document.getElementById(OVERRIDES_ID)?.textContent ?? "";

describe("per-tag override CSS layer (live path in inject.ts)", () => {
  afterEach(() => {
    removeSchemeStyle();
    document.head.innerHTML = "";
    document.body.innerHTML = "";
  });

  it("emits `tag[data-thememaker]{ prop: hex !important }` for a real tag", () => {
    document.body.innerHTML = "<div>x</div><h3>y</h3>";
    applyAdaptiveScheme(palette, {
      intensity: 80,
      overrides: { "div|background": "#112233", "h3|color": "#445566" },
    });
    const css = overrideCss();
    expect(css).toContain(
      "div[data-thememaker]{background-color:#112233 !important}",
    );
    expect(css).toContain("h3[data-thememaker]{color:#445566 !important}");
  });

  it("uses the EXACT hex (no AA floor — overrides are a manual choice)", () => {
    document.body.innerHTML = "<p>x</p>";
    // A pale-yellow text override on a light page would be relit by the engine's
    // AA floor — but per-tag overrides are exact, so it's emitted verbatim.
    applyAdaptiveScheme(palette, {
      intensity: 100,
      overrides: { "p|color": "#fffbe0" },
    });
    expect(overrideCss()).toContain(
      "p[data-thememaker]{color:#fffbe0 !important}",
    );
  });

  it("maps the `page` sentinel to a bare `html, body` rule", () => {
    document.body.innerHTML = "<div>x</div>";
    applyAdaptiveScheme(palette, {
      intensity: 80,
      overrides: { "page|background": "#abcdef" },
    });
    expect(overrideCss()).toContain(
      "html, body{background-color:#abcdef !important}",
    );
    // NOT scoped by [data-thememaker] — it recolors the page base directly.
    expect(overrideCss()).not.toContain("page[data-thememaker]");
  });

  it("uses bare `html`/`body` selectors for the html/body tags", () => {
    document.body.innerHTML = "<div>x</div>";
    applyAdaptiveScheme(palette, {
      intensity: 80,
      overrides: { "html|background": "#0a0b0c", "body|background": "#0d0e0f" },
    });
    const css = overrideCss();
    expect(css).toContain("html{background-color:#0a0b0c !important}");
    expect(css).toContain("body{background-color:#0d0e0f !important}");
  });

  it("places the override layer AFTER the main #themeMaker style (so it wins)", () => {
    document.body.innerHTML = "<div>x</div>";
    applyAdaptiveScheme(palette, {
      intensity: 80,
      overrides: { "div|background": "#112233" },
    });
    const main = document.getElementById(STYLE_ELEMENT_ID)!;
    const ovr = document.getElementById(OVERRIDES_ID)!;
    expect(main).toBeTruthy();
    expect(ovr).toBeTruthy();
    // ovr follows main in document order.
    expect(
      main.compareDocumentPosition(ovr) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
  });

  it("emits NO override style when there are no overrides", () => {
    document.body.innerHTML = "<div>x</div>";
    applyAdaptiveScheme(palette, { intensity: 80, overrides: {} });
    expect(document.getElementById(OVERRIDES_ID)).toBeNull();
  });

  it("skips invalid hex values and unsafe tag names", () => {
    document.body.innerHTML = "<div>x</div><span>y</span>";
    applyAdaptiveScheme(palette, {
      intensity: 80,
      overrides: {
        "div|background": "not-a-color", // invalid hex → skipped
        "sc ript|background": "#123456", // unsafe tag name → skipped
        "span|color": "#abcdef", // valid → kept
      },
    });
    const css = overrideCss();
    expect(css).not.toContain("not-a-color");
    expect(css).not.toContain("#123456");
    expect(css).toContain("span[data-thememaker]{color:#abcdef !important}");
  });

  it("is cleared on reset (removeSchemeStyle drops the override layer)", () => {
    document.body.innerHTML = "<div>x</div>";
    applyAdaptiveScheme(palette, {
      intensity: 80,
      overrides: { "div|background": "#112233" },
    });
    expect(document.getElementById(OVERRIDES_ID)).toBeTruthy();
    removeSchemeStyle();
    expect(document.getElementById(OVERRIDES_ID)).toBeNull();
    expect(document.getElementById(STYLE_ELEMENT_ID)).toBeNull();
  });

  it("removes a stale override layer when re-applied with no overrides", () => {
    document.body.innerHTML = "<div>x</div>";
    applyAdaptiveScheme(palette, {
      intensity: 80,
      overrides: { "div|background": "#112233" },
    });
    expect(document.getElementById(OVERRIDES_ID)).toBeTruthy();
    // Re-apply the same theme with the overrides cleared → layer goes away.
    applyAdaptiveScheme(palette, { intensity: 80, overrides: {} });
    expect(document.getElementById(OVERRIDES_ID)).toBeNull();
  });
});

describe("picker-panel-model — per-tag rows", () => {
  it("roleLabel formats `<tag>|<prop>` (text vs background) and the page sentinel", () => {
    expect(roleLabel("div|background")).toBe("div · background");
    expect(roleLabel("h3|color")).toBe("h3 · text");
    expect(roleLabel("a|color")).toBe("a · text");
    // The page sentinel is special-cased.
    expect(roleLabel("page|background")).toBe("Page · background");
    // A bare key with no separator is returned as-is.
    expect(roleLabel("weird")).toBe("weird");
  });

  it("overrideRows renders one row per override, normalizing the hex", () => {
    const rows = overrideRows({
      "div|background": "#ABCDEF",
      "h3|color": "#123456",
    });
    expect(rows).toStrictEqual([
      { role: "div|background", label: "div · background", color: "#abcdef" },
      { role: "h3|color", label: "h3 · text", color: "#123456" },
    ]);
  });

  it("overrideRows falls back to a neutral color for an invalid stored value", () => {
    const rows = overrideRows({ "div|background": "garbage" });
    expect(rows[0].color).toBe(FALLBACK_COLOR);
  });
});

describe("picker-panel-model — immutable transitions", () => {
  it("withPickedRole seeds a NEW key with the element's current color", () => {
    const base = {};
    const next = withPickedRole(base, "div|background", "#ABCDEF");
    expect(next).toStrictEqual({ "div|background": "#abcdef" });
    // pure — the input is untouched.
    expect(base).toStrictEqual({});
    expect(next).not.toBe(base);
  });

  it("withPickedRole keeps an existing key's value (re-pick is a no-op)", () => {
    const base = { "div|background": "#111111" };
    const next = withPickedRole(base, "div|background", "#999999");
    // Same reference (nothing changed) and the original value is preserved.
    expect(next).toBe(base);
    expect(next["div|background"]).toBe("#111111");
  });

  it("withPickedRole seeds the FALLBACK color when the current color is invalid", () => {
    const next = withPickedRole({}, "div|background", "nope");
    expect(next["div|background"]).toBe(FALLBACK_COLOR);
  });

  it("withRoleColor sets an explicit (normalized) color; ignores invalid hex", () => {
    const base = { "div|background": "#111111" };
    expect(withRoleColor(base, "div|background", "#ABC")).toStrictEqual({
      "div|background": "#aabbcc",
    });
    // Invalid hex → unchanged reference.
    expect(withRoleColor(base, "div|background", "not-a-color")).toBe(base);
  });

  it("withoutRole removes a key immutably; missing key is a no-op", () => {
    const base = { "div|background": "#111111", "h3|color": "#222222" };
    const next = withoutRole(base, "div|background");
    expect(next).toStrictEqual({ "h3|color": "#222222" });
    expect(base).toHaveProperty("div|background"); // input untouched
    // Removing an absent key returns the same reference.
    expect(withoutRole(base, "nope|background")).toBe(base);
  });
});
