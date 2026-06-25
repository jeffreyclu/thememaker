import { afterEach, describe, expect, it } from "vitest";

import { Engine } from "../src/lib/engine";
import { STYLE_ELEMENT_ID } from "../src/lib/engine/theme-dom-constants";
import { generatePalette } from "../src/lib/palette/palette";
import { contrastRatio, hexToHsl } from "../src/lib/color/color";
import type { ApplyOptions } from "../src/types";

// The Engine runs in the page world; jsdom provides document.
describe("Engine — <style> management (apply / reset / isApplied)", () => {
  const palette = generatePalette("#3a7bd5", "triad");
  const opts: ApplyOptions = { intensity: 50 };

  afterEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    document.documentElement.removeAttribute("style");
    document.documentElement.removeAttribute("data-thememaker");
  });

  it("apply adds a single <style id='themeMaker'>", () => {
    expect(document.head.childElementCount).toBe(0);
    document.body.innerHTML = "<div>content</div>";
    expect(new Engine().apply(palette, opts)).toBe(true);
    const style = document.getElementById(STYLE_ELEMENT_ID) as HTMLStyleElement;
    expect(style).toBeTruthy();
    expect(style.tagName).toBe("STYLE");
    expect(document.querySelectorAll(`#${STYLE_ELEMENT_ID}`)).toHaveLength(1);
  });

  it("re-apply reuses the existing style in place (no flash, no dupes)", () => {
    document.body.innerHTML = "<div>content</div>";
    const engine = new Engine();
    engine.apply(palette, opts);
    const first = document.getElementById(STYLE_ELEMENT_ID);
    engine.apply(palette, opts);
    // SAME element instance — written in place, never removed-then-appended.
    expect(document.getElementById(STYLE_ELEMENT_ID)).toBe(first);
    expect(document.querySelectorAll(`#${STYLE_ELEMENT_ID}`)).toHaveLength(1);
  });

  it("reset removes the style and reports it", () => {
    document.body.innerHTML = "<div>content</div>";
    const engine = new Engine();
    engine.apply(palette, opts);
    expect(engine.reset()).toBe(true);
    expect(document.getElementById(STYLE_ELEMENT_ID)).toBeNull();
    // resetting again reports false
    expect(engine.reset()).toBe(false);
  });

  it("isApplied reflects whether the style is present", () => {
    document.body.innerHTML = "<div>content</div>";
    const engine = new Engine();
    expect(engine.isApplied()).toBe(false);
    engine.apply(palette, opts);
    expect(engine.isApplied()).toBe(true);
    engine.reset();
    expect(engine.isApplied()).toBe(false);
  });
});

// The adaptive engine's DOM-walk + getComputedStyle path is exercised manually
// in a real browser (jsdom does not lay out elements / report rects). These
// tests pin the structural invariants the engine MUST hold in any environment:
// the single <style id="themeMaker">, the :root variable remap, AA on the
// remapped pair, and observer install/teardown.
describe("Engine.apply (in-page engine — structural invariants)", () => {
  const palette = generatePalette("#3a7bd5", "triad");
  const opts: ApplyOptions = { intensity: 50 };

  let engine: Engine;

  afterEach(() => {
    engine.reset();
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    document.documentElement.removeAttribute("style");
  });

  // A FRESH instance per test so the per-test reset + state is isolated; the
  // idempotency tests deliberately reuse the SAME instance (its frozen originals
  // persist across applies, exactly as the page-side singleton does).
  const newEngine = (): Engine => {
    engine = new Engine();
    return engine;
  };

  /** Declares :root color variables the page would normally ship. */
  const seedVars = (css: string) => {
    const s = document.createElement("style");
    s.textContent = css;
    document.head.appendChild(s);
  };

  it("writes exactly one <style id='themeMaker'>", () => {
    seedVars(":root { --bg: #ffffff; --color-text: #111111; }");
    document.body.innerHTML = "<div>content</div>";
    expect(newEngine().apply(palette, opts)).toBe(true);
    expect(document.querySelectorAll(`#${STYLE_ELEMENT_ID}`)).toHaveLength(1);
    expect(engine.isApplied()).toBe(true);
  });

  it("detects :root variables and emits a :root remap block", () => {
    seedVars(
      ":root { --bg: #ffffff; --color-text: #111111; --border: #cccccc; }",
    );
    newEngine().apply(palette, opts);
    const css = document.getElementById(STYLE_ELEMENT_ID)?.textContent ?? "";
    expect(css).toContain(":root {");
    expect(css).toContain("--bg:");
    expect(css).toContain("--color-text:");
  });

  it("the remapped text variable passes AA against the remapped bg", () => {
    seedVars(":root { --bg: #ffffff; --color-text: #111111; }");
    newEngine().apply(palette, opts);
    const css = document.getElementById(STYLE_ELEMENT_ID)?.textContent ?? "";
    const bg = /--bg:\s*(#[0-9a-f]{6})/i.exec(css)?.[1] as string;
    const text = /--color-text:\s*(#[0-9a-f]{6})/i.exec(css)?.[1] as string;
    expect(bg).toBeTruthy();
    expect(text).toBeTruthy();
    expect(contrastRatio(text, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it("re-applies IN PLACE on the same <style> (no flash, no duplicates)", () => {
    seedVars(":root { --bg: #ffffff; --color-text: #111111; }");
    newEngine().apply(palette, opts);
    const first = document.getElementById(STYLE_ELEMENT_ID);
    engine.apply(generatePalette("#aa3333", "complement"), opts);
    // SAME element instance — overwritten via textContent, never re-appended.
    expect(document.getElementById(STYLE_ELEMENT_ID)).toBe(first);
    expect(document.querySelectorAll(`#${STYLE_ELEMENT_ID}`)).toHaveLength(1);
  });

  it("ALWAYS themes html + body as a base surface (bug #1)", () => {
    document.body.innerHTML = "<div>content</div>";
    // Even at intensity 0 (only the base is painted).
    newEngine().apply(palette, { intensity: 0 });
    const css = document.getElementById(STYLE_ELEMENT_ID)?.textContent ?? "";
    expect(css).toMatch(/^html \{[^}]*background-color:/m);
    expect(css).toMatch(/^body \{[^}]*background-color:/m);
  });

  it("the base html/body text is AA against the base background (bug #3)", () => {
    document.body.innerHTML = "<p>plain</p>";
    newEngine().apply(palette, { intensity: 0 });
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

  it("keeps a MONOTONIC id counter across applies (never rewinds)", () => {
    document.body.innerHTML =
      '<div style="background-color: rgb(20,20,20)">a</div>';
    const e = newEngine();
    e.apply(palette, opts);
    const firstId = Number(
      (document.querySelector("div") as HTMLElement).getAttribute(
        "data-thememaker",
      ),
    );
    // A second SURFACE appears, then we re-apply on the SAME instance — its id
    // must be strictly greater (the counter is never rewound to 0).
    document.body.innerHTML +=
      '<section style="background-color: rgb(40,40,40)">b</section>';
    e.apply(palette, opts);
    const secondId = Number(
      (document.querySelector("section") as HTMLElement).getAttribute(
        "data-thememaker",
      ),
    );
    expect(secondId).toBeGreaterThan(firstId);
  });

  it("installs a MutationObserver and tears it down on reset", () => {
    seedVars(":root { --bg: #ffffff; --color-text: #111111; }");
    document.body.innerHTML = "<div>content</div>";
    const e = newEngine();
    e.apply(palette, opts);
    expect(document.getElementById(STYLE_ELEMENT_ID)).not.toBeNull();
    expect(e.reset()).toBe(true);
    expect(document.getElementById(STYLE_ELEMENT_ID)).toBeNull();
    // A reset re-apply must still work (observer re-installed cleanly).
    e.apply(palette, opts);
    expect(e.isApplied()).toBe(true);
  });

  it("is resilient when there are no :root color variables", () => {
    document.body.innerHTML = "<p>plain</p>";
    expect(newEngine().apply(palette, opts)).toBe(true);
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

    // ONE instance for the whole drag — the frozen originals persist across
    // applies, so re-mapping never drifts.
    const e = newEngine();
    e.apply(palette, { intensity: 100 });
    const first = css();

    // Drag all the way left...
    e.apply(palette, { intensity: 0 });
    // ...and all the way back right.
    e.apply(palette, { intensity: 100 });
    const back = css();

    // Returning to the same intensity reproduces the exact same CSS — detection
    // reads each element's ORIGINAL color, so re-mapping never drifts.
    expect(back).toBe(first);
    // The SURFACE (the div) is tagged with a per-element id. The span is TEXT —
    // colored by inheritance / tag rules now, so it is intentionally NOT tagged.
    const div = document.querySelector("div") as HTMLElement;
    const span = document.querySelector("span") as HTMLElement;
    expect(div.getAttribute("data-thememaker")).not.toBeNull();
    expect(span.getAttribute("data-thememaker")).toBeNull();
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
    newEngine().apply(palette, { intensity: 100 });
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
      // A FRESH instance per mode (each mode is an independent page).
      const e = new Engine();
      e.apply(generatePalette("#3a7bd5", mode), { intensity: 100 });
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
      e.reset();
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
    newEngine().apply(palette, { intensity: 100 });
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

    const e = newEngine();
    const cssWith = (overrides?: Record<string, string>): string => {
      e.apply(palette, { intensity: 100, overrides });
      const out = document.getElementById(STYLE_ELEMENT_ID)?.textContent ?? "";
      return out;
    };

    // Text is colored by ROOT-SCOPED tag rules now: heading → the
    // `[data-thememaker] h1, [data-thememaker] h2 {}` rule, link → the
    // `[data-thememaker] a {}` rule. Read the page-level rule color for a role.
    const headingColor = (css: string): string => {
      const m =
        /\[data-thememaker\] h1, \[data-thememaker\] h2 \{ color:\s*(#[0-9a-f]{6})/i.exec(
          css,
        );
      return (m?.[1] ?? "").toLowerCase();
    };
    const linkColor = (css: string): string => {
      const m = /\[data-thememaker\] a \{ color:\s*(#[0-9a-f]{6})/i.exec(css);
      return (m?.[1] ?? "").toLowerCase();
    };

    // The default palette heading role is a RED/pink (#a8…); overriding it to a
    // blue must flip the heading into the blue family while leaving the link
    // role (also blue, untouched) unchanged. Comparing hue families is robust to
    // the AA floor (which only shifts lightness, preserving hue).
    const themed = cssWith({ heading: "#1565c0" });
    const headingHue = hexToHsl(headingColor(themed)).h;
    expect(headingHue).toBeGreaterThan(180);
    expect(headingHue).toBeLessThan(260); // blue family — override hue survived
    // Generated heading role hue is NOT in the blue family (it's the palette's
    // pink/red heading at ~335°), so the override genuinely changed it.
    const genHue = hexToHsl(palette.roles.heading).h;
    expect(genHue < 180 || genHue > 260).toBe(true);

    // The link (untouched role) is identical with and without the override.
    const linkWithOverride = linkColor(themed);
    const plain = cssWith(undefined);
    expect(linkColor(plain)).toBe(linkWithOverride);
  });

  it("in-page: an UNREADABLE override is relit (AA floor holds, not collapsed)", () => {
    document.body.innerHTML = '<h1 style="color: rgb(0,0,0)">Title</h1>';
    document.body.style.backgroundColor = "rgb(255,255,255)";
    newEngine().apply(palette, {
      intensity: 100,
      overrides: { heading: "#fffbe0" }, // pale → unreadable on white
    });
    const css = document.getElementById(STYLE_ELEMENT_ID)?.textContent ?? "";
    // Heading text → the root-scoped `[data-thememaker] h1, …h2 {}` tag rule.
    const m =
      /\[data-thememaker\] h1, \[data-thememaker\] h2 \{ color:\s*(#[0-9a-f]{6})/i.exec(
        css,
      );
    const color = (m?.[1] ?? "").toLowerCase();
    expect(color).toBeTruthy();
    expect(color).not.toBe("#fffbe0"); // was relit
    // AA-large against a near-white base.
    expect(contrastRatio(color, "#ffffff")).toBeGreaterThanOrEqual(3);
  });

  it("re-detects against ORIGINAL colors, not our themed output (no drift)", () => {
    document.body.innerHTML =
      '<div style="background-color: rgb(240, 240, 240)">x</div>';
    const e = newEngine();
    e.apply(palette, { intensity: 100 });
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
    e.apply(palette, { intensity: 100 });
    e.apply(palette, { intensity: 100 });
    expect(ruleFor()).toBe(firstBg);
    expect(firstBg).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// IN-PAGE DETERMINISTIC TEXT COLOR — lockstep with the pure core's SPA fix.
//
// Text is colored by INHERITANCE + global/per-surface TAG rules (NOT per
// element), so a new/typed text node is correct the instant it exists (no
// flicker). These assert that the deterministic text colors — the per-role TAG
// rules and a surface's inherited subtree color — are a PURE FUNCTION of the
// palette: independent of any element's own original color, of the intensity
// dial, and of a row's swapped (hover/selected) background. This is what stops
// the Gmail flicker.
// ---------------------------------------------------------------------------
describe("Engine.apply — DETERMINISTIC text color (SPA stability)", () => {
  const palette = generatePalette("#3a7bd5", "triad");

  let engine: Engine;

  afterEach(() => {
    engine.reset();
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    document.documentElement.removeAttribute("style");
  });

  const newEngine = (): Engine => {
    engine = new Engine();
    return engine;
  };

  const css = (): string =>
    document.getElementById(STYLE_ELEMENT_ID)?.textContent ?? "";

  /** The color the root-scoped link TAG rule emits at the page level. */
  const linkTagColor = (): string => {
    const m = /\[data-thememaker\] a \{ color:\s*(#[0-9a-f]{6})/i.exec(css());
    return (m?.[1] ?? "").toLowerCase();
  };

  /** The inherited subtree text color a SURFACE element sets (its per-el rule). */
  const surfaceColor = (el: HTMLElement): string => {
    const id = el.getAttribute("data-thememaker");
    const m = new RegExp(
      `\\[data-thememaker="${id}"\\] \\{[^}]*[^-]color:\\s*(#[0-9a-f]{6})`,
      "i",
    ).exec(css());
    return (m?.[1] ?? "").toLowerCase();
  };

  /** Builds an email-row-shaped page; returns the row surface's text color. */
  const rowSurfaceColor = (rowBg: string, textColor: string): string => {
    document.body.innerHTML =
      `<article style="background-color: ${rowBg}">` +
      `<span style="color: ${textColor}">row text</span></article>`;
    document.body.style.backgroundColor = "#ffffff";
    newEngine().apply(palette, { intensity: 100 });
    const article = document.querySelector("article") as HTMLElement;
    return surfaceColor(article);
  };

  it("the link tag color is INDEPENDENT of the elements' own original colors", () => {
    document.body.innerHTML =
      '<a href="#" style="color: rgb(0,0,0)">one</a>' +
      '<a href="#" style="color: rgb(255,0,255)">two</a>';
    document.body.style.backgroundColor = "#ffffff";
    newEngine().apply(palette, { intensity: 100 });
    const a = linkTagColor();
    expect(a).toBeTruthy();
    // No per-element link rules exist — there is ONE deterministic page-level
    // `[data-thememaker] a {}` rule.
    expect(
      (css().match(/\[data-thememaker\] a \{ color:/gi) ?? []).length,
    ).toBe(1);
  });

  it("row surface text color is INDEPENDENT of the row's swapped background", () => {
    const normal = rowSurfaceColor("rgb(255,255,255)", "rgb(34,34,34)");
    engine.reset();
    document.head.innerHTML = "";
    const hovered = rowSurfaceColor("rgb(238,243,255)", "rgb(34,34,34)");
    engine.reset();
    document.head.innerHTML = "";
    const selected = rowSurfaceColor("rgb(210,227,255)", "rgb(34,34,34)");
    // The row is a CARD surface → its mapped bg is the SAME role surface
    // regardless of the original (swapped) bg, so the inherited text is stable.
    expect(hovered).toBe(normal);
    expect(selected).toBe(normal);
    expect(normal).toBeTruthy();
  });

  it("the link tag color is INDEPENDENT of the intensity dial", () => {
    const at = (intensity: number): string => {
      document.body.innerHTML = '<a href="#" style="color: rgb(0,0,0)">x</a>';
      document.body.style.backgroundColor = "#ffffff";
      newEngine().apply(palette, { intensity });
      const c = linkTagColor();
      engine.reset();
      document.head.innerHTML = "";
      return c;
    };
    const low = at(10);
    const mid = at(50);
    const high = at(100);
    expect(low).toBe(high);
    expect(mid).toBe(high);
    expect(low).toBeTruthy();
  });

  it("text is colored by TAG rules / inheritance, NOT per element (no flicker)", () => {
    // A fresh <p>/<a> gets NO per-element color rule — its color comes from the
    // body base + the root-scoped `[data-thememaker] a {}` rule — so a newly
    // inserted node is instantly correct (the whole point of the anti-flicker
    // change).
    document.body.innerHTML =
      '<p style="color: rgb(0,0,0)">para</p>' +
      '<a href="#" style="color: rgb(0,0,0)">link</a>';
    document.body.style.backgroundColor = "#ffffff";
    newEngine().apply(palette, { intensity: 100 });
    const p = document.querySelector("p") as HTMLElement;
    const a = document.querySelector("a") as HTMLElement;
    // Neither text element is tagged with a per-element id (only surfaces are).
    expect(p.getAttribute("data-thememaker")).toBeNull();
    expect(a.getAttribute("data-thememaker")).toBeNull();
    // The base CSS carries deterministic, root-scoped tag rules for them.
    expect(css()).toMatch(/\[data-thememaker\] a \{ color:/i);
    expect(css()).toMatch(/(?:^|\n)body \{[^}]*color:/i);
    // The ROOT MARKER is present on <html> so those rules actually apply.
    expect(document.documentElement.hasAttribute("data-thememaker")).toBe(true);
  });

  it("re-applying twice on the SAME DOM yields byte-identical CSS (idempotent)", () => {
    document.body.innerHTML =
      '<article style="background-color: rgb(255,255,255)">' +
      '<span style="color: rgb(0,0,0)">row text</span>' +
      '<a href="#" style="color: rgb(0,0,0)">link</a></article>';
    document.body.style.backgroundColor = "#ffffff";
    // ONE instance — re-applying on it reuses the frozen originals (idempotent).
    const e = newEngine();
    e.apply(palette, { intensity: 100 });
    const first = css();
    e.apply(palette, { intensity: 100 });
    expect(css()).toBe(first);
  });
});
