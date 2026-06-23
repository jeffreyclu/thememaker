import { afterEach, describe, expect, it } from "vitest";

import {
  STYLE_ELEMENT_ID,
  applyAdaptiveScheme,
  applySchemeStyle,
  isSchemeApplied,
  removeSchemeStyle,
} from "../src/lib/inject";
import { generatePalette } from "../src/lib/palette";
import { contrastRatio } from "../src/lib/color";
import type { ApplyOptions } from "../src/types";

// The injected functions run in the page world; jsdom provides document.
describe("inject (page-side DOM apply)", () => {
  afterEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = "";
  });

  it("applySchemeStyle adds a single <style> with the css", () => {
    expect(document.head.childElementCount).toBe(0);
    expect(applySchemeStyle("body { color: red; }")).toBe(true);
    const style = document.getElementById(STYLE_ELEMENT_ID) as HTMLStyleElement;
    expect(style).toBeTruthy();
    expect(style.tagName).toBe("STYLE");
    expect(style.textContent).toBe("body { color: red; }");
    expect(document.head.childElementCount).toBe(1);
  });

  it("applySchemeStyle reuses the existing style in place (no flash, no dupes)", () => {
    applySchemeStyle("body { color: red; }");
    const first = document.getElementById(STYLE_ELEMENT_ID);
    applySchemeStyle("body { color: blue; }");
    // SAME element instance — written in place, never removed-then-appended.
    expect(document.getElementById(STYLE_ELEMENT_ID)).toBe(first);
    expect(document.querySelectorAll(`#${STYLE_ELEMENT_ID}`)).toHaveLength(1);
    expect(
      (document.getElementById(STYLE_ELEMENT_ID) as HTMLStyleElement)
        .textContent,
    ).toBe("body { color: blue; }");
  });

  it("removeSchemeStyle removes the style and reports it", () => {
    applySchemeStyle("body { color: red; }");
    expect(removeSchemeStyle()).toBe(true);
    expect(document.getElementById(STYLE_ELEMENT_ID)).toBeNull();
    // removing again reports false
    expect(removeSchemeStyle()).toBe(false);
  });

  it("isSchemeApplied reflects whether the style is present", () => {
    expect(isSchemeApplied()).toBe(false);
    applySchemeStyle("body { color: red; }");
    expect(isSchemeApplied()).toBe(true);
    removeSchemeStyle();
    expect(isSchemeApplied()).toBe(false);
  });
});

// The adaptive engine's DOM-walk + getComputedStyle path is exercised manually
// in a real browser (jsdom does not lay out elements / report rects). These
// tests pin the structural invariants the engine MUST hold in any environment:
// the single <style id="themeMaker">, the :root variable remap, AA on the
// remapped pair, and observer install/teardown.
describe("applyAdaptiveScheme (in-page engine — structural invariants)", () => {
  const palette = generatePalette("#3a7bd5", "triad");
  const opts: ApplyOptions = { intensity: 50 };

  const win = (): {
    __themeMakerObserver?: MutationObserver;
    __themeMakerNextId?: number;
  } =>
    window as unknown as {
      __themeMakerObserver?: MutationObserver;
      __themeMakerNextId?: number;
    };

  afterEach(() => {
    removeSchemeStyle();
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    document.documentElement.removeAttribute("style");
  });

  /** Declares :root color variables the page would normally ship. */
  const seedVars = (css: string) => {
    const s = document.createElement("style");
    s.textContent = css;
    document.head.appendChild(s);
  };

  it("writes exactly one <style id='themeMaker'>", () => {
    seedVars(":root { --bg: #ffffff; --color-text: #111111; }");
    document.body.innerHTML = "<div>content</div>";
    expect(applyAdaptiveScheme(palette, opts)).toBe(true);
    expect(document.querySelectorAll(`#${STYLE_ELEMENT_ID}`)).toHaveLength(1);
    expect(isSchemeApplied()).toBe(true);
  });

  it("detects :root variables and emits a :root remap block", () => {
    seedVars(
      ":root { --bg: #ffffff; --color-text: #111111; --border: #cccccc; }",
    );
    applyAdaptiveScheme(palette, opts);
    const css = document.getElementById(STYLE_ELEMENT_ID)?.textContent ?? "";
    expect(css).toContain(":root {");
    expect(css).toContain("--bg:");
    expect(css).toContain("--color-text:");
  });

  it("the remapped text variable passes AA against the remapped bg", () => {
    seedVars(":root { --bg: #ffffff; --color-text: #111111; }");
    applyAdaptiveScheme(palette, opts);
    const css = document.getElementById(STYLE_ELEMENT_ID)?.textContent ?? "";
    const bg = /--bg:\s*(#[0-9a-f]{6})/i.exec(css)?.[1] as string;
    const text = /--color-text:\s*(#[0-9a-f]{6})/i.exec(css)?.[1] as string;
    expect(bg).toBeTruthy();
    expect(text).toBeTruthy();
    expect(contrastRatio(text, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it("re-applies IN PLACE on the same <style> (no flash, no duplicates)", () => {
    seedVars(":root { --bg: #ffffff; --color-text: #111111; }");
    applyAdaptiveScheme(palette, opts);
    const first = document.getElementById(STYLE_ELEMENT_ID);
    applyAdaptiveScheme(generatePalette("#aa3333", "complement"), opts);
    // SAME element instance — overwritten via textContent, never re-appended.
    expect(document.getElementById(STYLE_ELEMENT_ID)).toBe(first);
    expect(document.querySelectorAll(`#${STYLE_ELEMENT_ID}`)).toHaveLength(1);
  });

  it("ALWAYS themes html + body as a base surface (bug #1)", () => {
    document.body.innerHTML = "<div>content</div>";
    // Even at intensity 0 (only the base is painted).
    applyAdaptiveScheme(palette, { intensity: 0 });
    const css = document.getElementById(STYLE_ELEMENT_ID)?.textContent ?? "";
    expect(css).toMatch(/^html \{[^}]*background-color:/m);
    expect(css).toMatch(/^body \{[^}]*background-color:/m);
  });

  it("the base html/body text is AA against the base background (bug #3)", () => {
    document.body.innerHTML = "<p>plain</p>";
    applyAdaptiveScheme(palette, { intensity: 0 });
    const css = document.getElementById(STYLE_ELEMENT_ID)?.textContent ?? "";
    const htmlRule = /html \{([^}]*)\}/.exec(css)?.[1] ?? "";
    const bg = /background-color:\s*(#[0-9a-f]{6})/i.exec(htmlRule)?.[1];
    // anchor on a leading boundary so we don't match `background-color`.
    const text = /(?:^|[\s;])color:\s*(#[0-9a-f]{6})/i.exec(htmlRule)?.[1];
    expect(bg).toBeTruthy();
    expect(text).toBeTruthy();
    expect(contrastRatio(text as string, bg as string)).toBeGreaterThanOrEqual(
      4.5,
    );
  });

  it("keeps a MONOTONIC id counter on window (never resets to 0)", () => {
    document.body.innerHTML = "<div>a</div>";
    applyAdaptiveScheme(palette, opts);
    const afterFirst = win().__themeMakerNextId ?? 0;
    applyAdaptiveScheme(palette, opts);
    // Re-applying does not rewind the counter below where it was.
    expect(win().__themeMakerNextId ?? 0).toBeGreaterThanOrEqual(afterFirst);
  });

  it("installs a MutationObserver and tears it down on reset", () => {
    seedVars(":root { --bg: #ffffff; --color-text: #111111; }");
    applyAdaptiveScheme(palette, opts);
    expect(win().__themeMakerObserver).toBeInstanceOf(MutationObserver);
    expect(removeSchemeStyle()).toBe(true);
    expect(win().__themeMakerObserver).toBeUndefined();
    expect(document.getElementById(STYLE_ELEMENT_ID)).toBeNull();
  });

  it("is resilient when there are no :root color variables", () => {
    document.body.innerHTML = "<p>plain</p>";
    expect(applyAdaptiveScheme(palette, opts)).toBe(true);
    // still a single (possibly empty) style element, no crash
    expect(document.querySelectorAll(`#${STYLE_ELEMENT_ID}`)).toHaveLength(1);
  });

  it("slider re-apply is IDEMPOTENT: 100 → 0 → 100 yields identical CSS", () => {
    // A surface with a real background + readable text inside it. At intensity
    // 100 the area threshold is 0, so it always repaints in jsdom (no layout).
    document.body.innerHTML =
      '<div style="background-color: rgb(20, 20, 20)">' +
      '<span style="color: rgb(200, 200, 200)">hello</span></div>';

    const css = (): string =>
      document.getElementById(STYLE_ELEMENT_ID)?.textContent ?? "";

    applyAdaptiveScheme(palette, { intensity: 100 });
    const first = css();

    // Drag all the way left...
    applyAdaptiveScheme(palette, { intensity: 0 });
    // ...and all the way back right.
    applyAdaptiveScheme(palette, { intensity: 100 });
    const back = css();

    // Returning to the same intensity reproduces the exact same CSS — detection
    // reads each element's ORIGINAL color, so re-mapping never drifts.
    expect(back).toBe(first);
    // And no duplicate data-thememaker ids were stranded on the surface.
    const div = document.querySelector("div") as HTMLElement;
    const span = document.querySelector("span") as HTMLElement;
    expect(div.getAttribute("data-thememaker")).not.toBeNull();
    expect(span.getAttribute("data-thememaker")).not.toBeNull();
  });

  it("re-detects against ORIGINAL colors, not our themed output (no drift)", () => {
    document.body.innerHTML =
      '<div style="background-color: rgb(240, 240, 240)">x</div>';
    applyAdaptiveScheme(palette, { intensity: 100 });
    const div = document.querySelector("div") as HTMLElement;
    const id = div.getAttribute("data-thememaker");
    // Capture the surface rule emitted for this element.
    const ruleFor = (): string => {
      const css = document.getElementById(STYLE_ELEMENT_ID)?.textContent ?? "";
      const m = new RegExp(
        `\\[data-thememaker="${id}"\\] \\{[^}]*background-color:\\s*(#[0-9a-f]{6})`,
        "i",
      ).exec(css);
      return m?.[1] ?? "";
    };
    const firstBg = ruleFor();
    // Re-apply several times at the same intensity; the mapped bg must not move.
    applyAdaptiveScheme(palette, { intensity: 100 });
    applyAdaptiveScheme(palette, { intensity: 100 });
    expect(ruleFor()).toBe(firstBg);
    expect(firstBg).toBeTruthy();
  });
});
