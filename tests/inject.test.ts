import { afterEach, describe, expect, it } from "vitest";

import {
  STYLE_ELEMENT_ID,
  applyAdaptiveScheme,
  applySchemeStyle,
  isSchemeApplied,
  removeSchemeStyle,
} from "../src/lib/inject";
import { generatePalette } from "../src/lib/palette";
import { contrastRatio, hexToHsl } from "../src/lib/color";
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

  it("spends the WHOLE palette in-page: ≥4 distinct role colors (anti-monochrome)", () => {
    // A representative page with heading/body/link/muted/buttons. The in-page
    // port must mirror the pure core: distinct roles → distinct colors.
    document.body.innerHTML =
      '<h1 style="color: rgb(0,0,0)">Title</h1>' +
      '<p style="color: rgb(0,0,0)">Body text here</p>' +
      '<a href="#" style="color: rgb(0,0,255)">A link</a>' +
      '<small style="color: rgb(90,90,90)">muted note</small>' +
      '<button style="background-color: rgb(220,220,220); color: rgb(0,0,0)">Submit</button>' +
      '<button class="btn-secondary" style="background-color: rgb(220,220,220); color: rgb(0,0,0)">Cancel</button>';
    applyAdaptiveScheme(palette, { intensity: 100 });
    const css = document.getElementById(STYLE_ELEMENT_ID)?.textContent ?? "";
    const all = [
      ...css.matchAll(/(?:background-)?color:\s*(#[0-9a-f]{6})/gi),
    ].map((m) => m[1].toLowerCase());
    // The old single-seed engine produced ~2 colors; the role engine many more.
    expect(new Set(all).size).toBeGreaterThanOrEqual(4);
  });

  it("a multi-hue page is NOT monochrome AND a quad shows more hues than a complement", () => {
    // The page must spend the palette (not collapse to grayscale), and the
    // number of hue families it paints scales HONESTLY with the mode's harmony:
    // a quad paints more distinct hue families than a complement. (We no longer
    // invent extra hues to pad a 2-color complement up to six.)
    const richPage =
      '<header style="background-color: rgb(245,245,245)"><nav>' +
      '<a href="#" style="color: rgb(0,0,238)">Home</a></nav></header>' +
      '<article style="background-color: rgb(250,250,250)">' +
      '<h1 style="color: rgb(0,0,0)">Title</h1>' +
      '<h3 style="color: rgb(0,0,0)">Section</h3>' +
      '<p style="color: rgb(30,30,30)">Body with ' +
      '<strong style="color: rgb(30,30,30)">emphasis</strong> and a ' +
      '<a href="#" style="color: rgb(0,0,238)">link</a>.</p>' +
      '<blockquote style="color: rgb(80,80,80)">Quoted</blockquote>' +
      '<small style="color: rgb(120,120,120)">muted</small>' +
      '<pre style="background-color: rgb(240,240,240)">' +
      '<code style="color: rgb(0,0,0)">code()</code></pre>' +
      '<button style="background-color: rgb(220,220,220); color: rgb(0,0,0)">Submit</button>' +
      "</article>" +
      '<aside style="background-color: rgb(248,248,248)">' +
      '<p style="color: rgb(50,50,50)">sidebar</p></aside>';

    const familiesFor = (mode: string): number => {
      document.body.innerHTML = richPage;
      document.body.style.backgroundColor = "rgb(255,255,255)";
      document.body.style.color = "rgb(20,20,20)";
      applyAdaptiveScheme(generatePalette("#3a7bd5", mode), { intensity: 100 });
      const css = document.getElementById(STYLE_ELEMENT_ID)?.textContent ?? "";
      const colors = [
        ...css.matchAll(/(?:background-)?color:\s*(#[0-9a-f]{6})/gi),
      ].map((m) => m[1].toLowerCase());
      const families = new Set(
        [...new Set(colors)]
          .map((c) => hexToHsl(c))
          .filter((hsl) => hsl.s >= 12)
          .map((hsl) => Math.round(hsl.h / 30)),
      );
      removeSchemeStyle();
      document.body.innerHTML = "";
      document.head.innerHTML = "";
      return families.size;
    };

    const complementFamilies = familiesFor("complement");
    const quadFamilies = familiesFor("quad");
    // Not monochrome: a complement still paints at least its two hue families.
    expect(complementFamilies).toBeGreaterThanOrEqual(2);
    // Honest harmony: a quad paints strictly more hue families than a complement.
    expect(quadFamilies).toBeGreaterThan(complementFamilies);
  });

  it("in-page: the two buttons get DIFFERENT backgrounds (primary ≠ secondary)", () => {
    document.body.innerHTML =
      '<button class="btn-primary" style="background-color: rgb(200,200,200); color: rgb(0,0,0)">Save</button>' +
      '<button class="btn-secondary" style="background-color: rgb(200,200,200); color: rgb(0,0,0)">Cancel</button>';
    applyAdaptiveScheme(palette, { intensity: 100 });
    const css = document.getElementById(STYLE_ELEMENT_ID)?.textContent ?? "";
    const btns = document.querySelectorAll("button");
    const bgFor = (el: Element): string => {
      const id = el.getAttribute("data-thememaker");
      const m = new RegExp(
        `\\[data-thememaker="${id}"\\] \\{[^}]*background-color:\\s*(#[0-9a-f]{6})`,
        "i",
      ).exec(css);
      return (m?.[1] ?? "").toLowerCase();
    };
    const a = bgFor(btns[0]);
    const b = bgFor(btns[1]);
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(a).not.toBe(b);
  });

  it("applies a role OVERRIDE in-page (heading recolored, others unchanged)", () => {
    // The in-page port must honor options.overrides exactly like the pure core.
    document.body.innerHTML =
      '<h1 style="color: rgb(0,0,0)">Title</h1>' +
      '<a href="#" style="color: rgb(0,0,238)">Link</a>';
    document.body.style.backgroundColor = "rgb(255,255,255)";

    const cssWith = (overrides?: Record<string, string>): string => {
      applyAdaptiveScheme(palette, { intensity: 100, overrides });
      const out = document.getElementById(STYLE_ELEMENT_ID)?.textContent ?? "";
      return out;
    };

    const h1 = document.querySelector("h1") as HTMLElement;
    const a = document.querySelector("a") as HTMLElement;
    const colorFor = (css: string, el: HTMLElement): string => {
      const id = el.getAttribute("data-thememaker");
      const m = new RegExp(
        `\\[data-thememaker="${id}"\\] \\{[^}]*[^-]color:\\s*(#[0-9a-f]{6})`,
        "i",
      ).exec(css);
      return (m?.[1] ?? "").toLowerCase();
    };

    // The default palette heading role is a RED/pink (#a8…); overriding it to a
    // blue must flip the heading into the blue family while leaving the link
    // role (also blue, untouched) unchanged. Comparing hue families is robust to
    // the AA floor (which only shifts lightness, preserving hue).
    const themed = cssWith({ heading: "#1565c0" });
    const headingHue = hexToHsl(colorFor(themed, h1)).h;
    expect(headingHue).toBeGreaterThan(180);
    expect(headingHue).toBeLessThan(260); // blue family — override hue survived
    // Generated heading role hue is NOT in the blue family (it's the palette's
    // pink/red heading at ~335°), so the override genuinely changed it.
    const genHue = hexToHsl(palette.roles.heading).h;
    expect(genHue < 180 || genHue > 260).toBe(true);

    // The link (untouched role) is identical with and without the override.
    const linkWithOverride = colorFor(themed, a);
    removeSchemeStyle();
    const plain = cssWith(undefined);
    expect(colorFor(plain, a)).toBe(linkWithOverride);
  });

  it("in-page: an UNREADABLE override is relit (AA floor holds, not collapsed)", () => {
    document.body.innerHTML = '<h1 style="color: rgb(0,0,0)">Title</h1>';
    document.body.style.backgroundColor = "rgb(255,255,255)";
    applyAdaptiveScheme(palette, {
      intensity: 100,
      overrides: { heading: "#fffbe0" }, // pale → unreadable on white
    });
    const css = document.getElementById(STYLE_ELEMENT_ID)?.textContent ?? "";
    const h1 = document.querySelector("h1") as HTMLElement;
    const id = h1.getAttribute("data-thememaker");
    const m = new RegExp(
      `\\[data-thememaker="${id}"\\] \\{[^}]*[^-]color:\\s*(#[0-9a-f]{6})`,
      "i",
    ).exec(css);
    const color = (m?.[1] ?? "").toLowerCase();
    expect(color).not.toBe("#fffbe0"); // was relit
    // AA-large against a near-white base.
    expect(contrastRatio(color, "#ffffff")).toBeGreaterThanOrEqual(3);
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
