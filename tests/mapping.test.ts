import { describe, expect, it } from "vitest";

import {
  buildMapping,
  blendFactor,
  classifyButton,
  classifySurface,
  classifyText,
  classifyVarName,
  isVariableDriven,
  remapVariables,
  textRoleColor,
  HTML_SELECTOR,
  BODY_SELECTOR,
  type DetectedNode,
  type DetectedVar,
} from "../src/lib/mapping";
import {
  contrastRatio,
  AA_NORMAL,
  AA_LARGE,
  hexToHsl,
  isHexColor,
  luminanceOf,
} from "../src/lib/color";
import { generatePalette } from "../src/lib/palette";
import type { ApplyOptions } from "../src/types";

const palette = generatePalette("#3a7bd5", "triad");

/** Circular hue distance in [0, 180]. */
const hueDist = (a: number, b: number): number => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

// Numeric intensities (0–100). Intensity is a blend: theme vs. original.
const LOW: ApplyOptions = { intensity: 10 };
const MID: ApplyOptions = { intensity: 50 };
const MAX: ApplyOptions = { intensity: 100 };

const surfaceNode = (
  selector: string,
  bgColor: string,
  extra: Partial<DetectedNode> = {},
): DetectedNode => ({
  selector,
  role: "surface",
  bgColor,
  luminance: 0.5,
  ...extra,
});

const textNode = (
  selector: string,
  extra: Partial<DetectedNode> = {},
): DetectedNode => ({
  selector,
  role: "text",
  textColor: "#000000",
  luminance: 0,
  ...extra,
});

describe("classifyVarName", () => {
  it("maps common variable naming conventions to roles", () => {
    expect(classifyVarName("--bg")).toBe("surface");
    expect(classifyVarName("--background-color")).toBe("surface");
    expect(classifyVarName("--surface")).toBe("surface");
    expect(classifyVarName("--card-bg")).toBe("surface");
    expect(classifyVarName("--text")).toBe("text");
    expect(classifyVarName("--color-text")).toBe("text");
    expect(classifyVarName("--fg")).toBe("text");
    expect(classifyVarName("--link")).toBe("text");
    expect(classifyVarName("--border")).toBe("border");
    expect(classifyVarName("--divider")).toBe("border");
    expect(classifyVarName("--spacing-lg")).toBeNull();
  });
});

describe("isVariableDriven", () => {
  it("requires BOTH a surface and a text variable", () => {
    expect(
      isVariableDriven([
        { name: "--bg", value: "#ffffff" },
        { name: "--text", value: "#111111" },
      ]),
    ).toBe(true);
    expect(isVariableDriven([{ name: "--bg", value: "#fff" }])).toBe(false);
    expect(isVariableDriven([{ name: "--gap", value: "8px" }])).toBe(false);
  });
});

describe("remapVariables", () => {
  const vars: DetectedVar[] = [
    { name: "--bg", value: "#ffffff" },
    { name: "--surface-dark", value: "#0a0a0a" },
    { name: "--text", value: "#222222" },
    { name: "--border", value: "#cccccc" },
  ];

  it("remaps each role and preserves the light/dark surface hierarchy", () => {
    const out = remapVariables(vars, palette);
    const bg = out.find((v) => v.name === "--bg")?.value as string;
    const dark = out.find((v) => v.name === "--surface-dark")?.value as string;
    // a light source surface stays lighter than a dark source surface
    expect(contrastRatio(bg, "#000000")).toBeGreaterThan(
      contrastRatio(dark, "#000000"),
    );
  });

  it("the remapped text variable passes AA against the primary surface", () => {
    const out = remapVariables(vars, palette);
    const bg = out.find((v) => v.name === "--bg")?.value as string;
    const text = out.find((v) => v.name === "--text")?.value as string;
    expect(contrastRatio(text, bg)).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});

describe("buildMapping — base is ALWAYS themed (bug #1)", () => {
  it("html and body always receive a background decision, even at low intensity", () => {
    const result = buildMapping([], [], palette, LOW);
    const html = result.decisions.find((d) => d.selector === HTML_SELECTOR);
    const body = result.decisions.find((d) => d.selector === BODY_SELECTOR);
    expect(html?.background).toBeTruthy();
    expect(body?.background).toBeTruthy();
    expect(isHexColor(result.baseBackground)).toBe(true);
    // and the base text is AA against the base background
    expect(
      contrastRatio(result.baseText, result.baseBackground),
    ).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(html?.color).toBe(result.baseText);
  });

  it("html/body are themed regardless of whether the page has surfaces", () => {
    for (const opts of [LOW, MID, MAX]) {
      const result = buildMapping([], [], palette, opts);
      expect(result.decisions.some((d) => d.selector === HTML_SELECTOR)).toBe(
        true,
      );
      expect(result.decisions.some((d) => d.selector === BODY_SELECTOR)).toBe(
        true,
      );
    }
  });
});

describe("buildMapping — strategy selection", () => {
  const vars: DetectedVar[] = [
    { name: "--bg", value: "#ffffff" },
    { name: "--text", value: "#111111" },
  ];

  it("takes the VARIABLE-REMAP path when the page is variable-driven", () => {
    const result = buildMapping([], vars, palette, MID);
    expect(result.variableDriven).toBe(true);
    expect(result.vars.length).toBe(2);
    expect(result.css).toContain(":root {");
    expect(result.css).toContain("--bg:");
    expect(result.css).toContain("--text:");
  });

  it("does NOT remap variables when the page is not variable-driven (mid)", () => {
    const result = buildMapping(
      [surfaceNode("[data-tm='1']", "#ffffff")],
      [{ name: "--gap", value: "8px" }],
      palette,
      MID,
    );
    expect(result.variableDriven).toBe(false);
    expect(result.vars).toHaveLength(0);
    expect(result.css).not.toContain(":root");
  });

  it("intensity 100 remaps variables even when not strictly variable-driven", () => {
    const result = buildMapping(
      [],
      [{ name: "--bg", value: "#ffffff" }],
      palette,
      MAX,
    );
    expect(result.vars.length).toBe(1);
  });
});

describe("buildMapping — intensity is a BLEND (theme vs. original)", () => {
  it("blendFactor maps intensity 0→0, 50→0.5, 100→1", () => {
    expect(blendFactor(0)).toBe(0);
    expect(blendFactor(50)).toBe(0.5);
    expect(blendFactor(100)).toBe(1);
  });

  it("paints EVERY surface at EVERY intensity (no per-site dead zones)", () => {
    const nodes: DetectedNode[] = [
      surfaceNode("[data-tm='1']", "#202020"),
      surfaceNode("[data-tm='2']", "#cccccc"),
      surfaceNode("[data-tm='3']", "#777777"),
    ];
    for (const opts of [LOW, MID, MAX]) {
      const r = buildMapping(nodes, [], palette, opts);
      const painted = r.decisions.filter(
        (d) => d.role === "surface" && d.selector.startsWith("[data"),
      );
      expect(painted).toHaveLength(nodes.length);
    }
  });

  it("a surface's new bg moves monotonically toward the palette as intensity rises", () => {
    // Original is white; the mapped surface is darker. Higher intensity → the
    // emitted bg should sit progressively further from white (closer to mapped).
    const node = surfaceNode("[data-tm='s']", "#ffffff");
    const bgAt = (intensity: number): string =>
      buildMapping([node], [], palette, { intensity }).decisions.find(
        (d) => d.selector === "[data-tm='s']",
      )?.background as string;
    const low = bgAt(10);
    const mid = bgAt(50);
    const high = bgAt(100);
    // distance from the ORIGINAL (white) grows with intensity.
    const dist = (hex: string): number => 1 - luminanceOf(hex); // white→0
    expect(dist(mid)).toBeGreaterThan(dist(low));
    expect(dist(high)).toBeGreaterThanOrEqual(dist(mid));
    // at 10% the bg is still close to the original white (subtle tint).
    expect(luminanceOf(low)).toBeGreaterThan(luminanceOf(high));
  });

  it("at intensity 100 the surface bg equals the fully-mapped palette surface", () => {
    const node = surfaceNode("[data-tm='dark']", "#0c0c0c");
    const r = buildMapping([node], [], palette, MAX);
    const bg = r.decisions.find((d) => d.selector === "[data-tm='dark']")
      ?.background as string;
    // dark source → mapped onto the darkest palette surface, fully (factor 1).
    expect(bg.toLowerCase()).toBe(palette.surfaces[0].toLowerCase());
  });

  it("intensity < 100 SKIPS borders; intensity 100 paints them", () => {
    const nodes: DetectedNode[] = [
      surfaceNode("[data-tm='1']", "#ffffff"),
      { selector: "[data-tm='2']", role: "border", luminance: 0.8 },
    ];
    expect(
      buildMapping(nodes, [], palette, MID).decisions.some(
        (d) => d.role === "border",
      ),
    ).toBe(false);
    expect(
      buildMapping(nodes, [], palette, MAX).decisions.some(
        (d) => d.role === "border",
      ),
    ).toBe(true);
  });
});

describe("buildMapping — luminance bucket mapping", () => {
  it("maps dark/medium/light source surfaces onto distinct palette surfaces", () => {
    const nodes = [
      surfaceNode("[data-tm='d']", "#0c0c0c"),
      surfaceNode("[data-tm='m']", "#808080"),
      surfaceNode("[data-tm='l']", "#fafafa"),
    ];
    const result = buildMapping(nodes, [], palette, MAX);
    const bgFor = (sel: string): string =>
      result.decisions.find((d) => d.selector === sel)?.background as string;
    const dark = bgFor("[data-tm='d']");
    const light = bgFor("[data-tm='l']");
    // hierarchy preserved: the dark source maps darker than the light source
    expect(contrastRatio(dark, "#ffffff")).toBeGreaterThan(
      contrastRatio(light, "#ffffff"),
    );
  });
});

describe("buildMapping — text against EFFECTIVE background (bug #3)", () => {
  it("text under a DARK themed ancestor is AA against THAT dark bg, not a default", () => {
    // Force the parent surface to map DARK by giving it a near-black own bg.
    // Node 0 is the surface (parent), node 1 is the text child pointing at it.
    const nodes: DetectedNode[] = [
      surfaceNode("[data-tm='panel']", "#050505", { area: 300_000 }),
      textNode("[data-tm='label']", { parent: 0 }),
    ];
    const result = buildMapping(nodes, [], palette, MAX);
    const panel = result.decisions.find(
      (d) => d.selector === "[data-tm='panel']",
    );
    const label = result.decisions.find(
      (d) => d.selector === "[data-tm='label']",
    );
    // The panel mapped onto the DARK end of the palette.
    expect(panel?.background).toBe(palette.surfaces[0]);
    // The label's color is AA against the panel's NEW dark background — the
    // invisible-text floor holds even at full intensity (the swatch color is
    // relit only if it would be unreadable on the effective ancestor bg).
    expect(
      contrastRatio(label?.color as string, panel?.background as string),
    ).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it("text with no themed ancestor falls back to AA against the base background", () => {
    const nodes: DetectedNode[] = [textNode("[data-tm='loose']")];
    const result = buildMapping(nodes, [], palette, LOW);
    const loose = result.decisions.find(
      (d) => d.selector === "[data-tm='loose']",
    );
    expect(
      contrastRatio(loose?.color as string, result.baseBackground),
    ).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it("text resolves through a CHAIN of ancestors to the nearest themed one", () => {
    // grandparent(surface, dark) → parent(text passthrough, not a surface) →
    // child(text). The child must resolve to the grandparent's dark bg.
    const nodes: DetectedNode[] = [
      surfaceNode("[data-tm='gp']", "#040404", { area: 300_000 }),
      textNode("[data-tm='mid']", { parent: 0 }),
      textNode("[data-tm='child']", { parent: 1 }),
    ];
    const result = buildMapping(nodes, [], palette, MAX);
    const gp = result.decisions.find((d) => d.selector === "[data-tm='gp']");
    const child = result.decisions.find(
      (d) => d.selector === "[data-tm='child']",
    );
    expect(
      contrastRatio(child?.color as string, gp?.background as string),
    ).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});

describe("buildMapping — AA GUARANTEE across intensities", () => {
  // A deliberately nasty mix: light surfaces, dark surfaces, varied text parents.
  const nodes: DetectedNode[] = [
    surfaceNode("[data-tm='1']", "#ffffff", { area: 300_000 }),
    surfaceNode("[data-tm='2']", "#000000", { area: 300_000 }),
    surfaceNode("[data-tm='3']", "#7a7a7a", { area: 300_000 }),
    surfaceNode("[data-tm='4']", "#1e3a5f", { area: 300_000 }),
    textNode("[data-tm='5']", { parent: 0 }), // on a light surface
    textNode("[data-tm='6']", { parent: 1 }), // on a dark surface
    textNode("[data-tm='7']"), // no parent → base background
  ];
  const vars: DetectedVar[] = [
    { name: "--bg", value: "#ffffff" },
    { name: "--text", value: "#222222" },
    { name: "--panel-bg", value: "#0d0d0d" },
  ];

  // The AA / invisible-text guarantee holds at EVERY intensity, including full.
  // Even though full intensity paints the swatch color as the source of truth,
  // it is floored through `nudgeToAA`, so a truly-unreadable swatch color is
  // minimally relit (same hue) rather than left invisible.
  for (const opts of [LOW, MID, MAX]) {
    it(`every surface's text passes AA against its new bg (intensity ${opts.intensity})`, () => {
      const result = buildMapping(nodes, vars, palette, opts);
      for (const d of result.decisions) {
        if (d.role === "surface") {
          expect(isHexColor(d.background as string)).toBe(true);
          expect(isHexColor(d.color as string)).toBe(true);
          expect(
            contrastRatio(d.color as string, d.background as string),
          ).toBeGreaterThanOrEqual(AA_NORMAL);
        }
      }
    });

    it(`every text node passes AA against its effective bg (intensity ${opts.intensity})`, () => {
      const result = buildMapping(nodes, vars, palette, opts);
      // Reconstruct the effective bg the engine used for each text node.
      const paintedSel = new Map<string, string>();
      for (const d of result.decisions) {
        if (d.role === "surface" && d.background) {
          paintedSel.set(d.selector, d.background);
        }
      }
      for (const d of result.decisions) {
        if (d.role === "text" && d.color) {
          expect(isHexColor(d.color)).toBe(true);
          // It must be AA against SOME real surface in the palette + base; the
          // weakest guarantee is the base background.
          const okAgainstBase =
            contrastRatio(d.color, result.baseBackground) >= AA_NORMAL;
          const okAgainstAnyPainted = [...paintedSel.values()].some(
            (bg) => contrastRatio(d.color as string, bg) >= AA_NORMAL,
          );
          expect(okAgainstBase || okAgainstAnyPainted).toBe(true);
        }
      }
    });
  }

  it("emits a :root rule + html + body + one rule per painted node at max", () => {
    const result = buildMapping(nodes, vars, palette, MAX);
    const ruleCount = (result.css.match(/\{/g) ?? []).length;
    // 1 :root + html + body + 4 surfaces + 3 text = 9
    expect(ruleCount).toBe(1 + 2 + nodes.length);
  });

  it("at FULL intensity paints the EXACT swatch colors when readable (source of truth)", () => {
    // The product rule: at 100% a swatch == what lands in the DOM, UNLESS the
    // color would be unreadable on its background (then it's minimally relit to
    // the nearest readable shade of the SAME hue — the readability floor).
    const page: DetectedNode[] = [
      surfaceNode("body", "#ffffff", { tagName: "body" }),
      textNode("[h1]", { tagName: "h1", parent: 0 }),
      textNode("[p]", { tagName: "p", parent: 0 }),
      surfaceNode("[btn]", "#dddddd", {
        tagName: "button",
        buttonLike: true,
        textColor: "#000000",
      }),
    ];
    const { decisions } = buildMapping(page, [], palette, MAX);
    const colorOf = (sel: string) =>
      decisions.find((d) => d.selector === sel)?.color?.toLowerCase();
    const bgOf = (sel: string) =>
      decisions.find((d) => d.selector === sel)?.background?.toLowerCase();
    // heading + body are readable on a light bg → painted EXACTLY.
    expect(colorOf("[h1]")).toBe(palette.roles.heading.toLowerCase());
    expect(colorOf("[p]")).toBe(palette.roles.textPrimary.toLowerCase());
    // surfaces/backgrounds are never floored → the primary button bg is exactly
    // the user's ROOT color, always.
    expect(bgOf("[btn]")).toBe(palette.roles.primary.toLowerCase());
    expect(bgOf("[btn]")).toBe(palette.seed.toLowerCase());
  });
});

// ---------------------------------------------------------------------------
// ANTI-MONOCHROME GATE. These would FAIL on the old behavior, where every text
// run was colored from `accents[0]` (clamped for contrast) and every surface
// from a single desaturated ramp — collapsing multi-hue palettes to grayscale.
// ---------------------------------------------------------------------------

describe("classification heuristics", () => {
  it("classifyText routes tags to distinct semantic roles", () => {
    expect(
      classifyText({ selector: "", role: "text", tagName: "a", luminance: 0 }),
    ).toBe("link");
    expect(
      classifyText({ selector: "", role: "text", tagName: "h1", luminance: 0 }),
    ).toBe("heading");
    expect(
      classifyText({ selector: "", role: "text", tagName: "h2", luminance: 0 }),
    ).toBe("heading");
    expect(
      classifyText({ selector: "", role: "text", tagName: "h3", luminance: 0 }),
    ).toBe("subheading");
    expect(
      classifyText({
        selector: "",
        role: "text",
        tagName: "small",
        luminance: 0,
      }),
    ).toBe("muted");
    expect(
      classifyText({ selector: "", role: "text", tagName: "p", luminance: 0 }),
    ).toBe("body");
    expect(
      classifyText({
        selector: "",
        role: "text",
        tagName: "span",
        luminance: 0,
        className: "text-muted",
      }),
    ).toBe("muted");
  });

  it("classifySurface splits buttons / code / cards / generic", () => {
    expect(
      classifySurface(
        { selector: "", role: "surface", tagName: "button", luminance: 0.8 },
        0,
      ),
    ).toBe("primaryButton");
    expect(
      classifySurface(
        { selector: "", role: "surface", tagName: "pre", luminance: 0.4 },
        0,
      ),
    ).toBe("code");
    expect(
      classifySurface(
        { selector: "", role: "surface", tagName: "section", luminance: 0.9 },
        0,
      ),
    ).toBe("card");
    expect(
      classifySurface(
        { selector: "", role: "surface", tagName: "div", luminance: 0.5 },
        0,
      ),
    ).toBe("surface");
  });

  it("classifyButton: class > text > order heuristic for primary vs secondary", () => {
    const base = {
      selector: "",
      role: "surface" as const,
      tagName: "button",
      luminance: 0.8,
    };
    // class wins
    expect(classifyButton({ ...base, className: "btn-secondary" }, 0)).toBe(
      "secondaryButton",
    );
    expect(classifyButton({ ...base, className: "btn btn-primary" }, 5)).toBe(
      "primaryButton",
    );
    // then text
    expect(classifyButton({ ...base, text: "Cancel" }, 0)).toBe(
      "secondaryButton",
    );
    expect(classifyButton({ ...base, text: "Save changes" }, 5)).toBe(
      "primaryButton",
    );
    // then order: first button = dominant CTA, rest = secondary
    expect(classifyButton(base, 0)).toBe("primaryButton");
    expect(classifyButton(base, 1)).toBe("secondaryButton");
  });

  it("textRoleColor pulls a DIFFERENT palette slot per role", () => {
    const r = palette.roles;
    expect(textRoleColor("heading", r)).toBe(r.heading);
    expect(textRoleColor("link", r)).toBe(r.link);
    expect(textRoleColor("muted", r)).toBe(r.textSecondary);
    expect(textRoleColor("body", r)).toBe(r.textPrimary);
    // and those slots are themselves distinct on a triad
    const set = new Set([r.heading, r.link, r.textSecondary, r.textPrimary]);
    expect(set.size).toBe(4);
  });
});

describe("buildMapping — spends the WHOLE palette (anti-monochrome)", () => {
  // A representative page: heading, body, link, muted text, two buttons, on a
  // white page background. Triad palette → should use several hues.
  const text = (
    tagName: string,
    extra: Partial<DetectedNode> = {},
  ): DetectedNode => ({
    selector: `[${tagName}]`,
    role: "text",
    tagName,
    textColor: "#000000",
    luminance: 0,
    parent: 0,
    ...extra,
  });
  const page = (): DetectedNode[] => [
    surfaceNode("body", "#ffffff", { tagName: "body" }),
    text("h1"),
    text("p"),
    text("a"),
    text("small"),
    surfaceNode("[btn1]", "#dddddd", {
      tagName: "button",
      buttonLike: true,
      textColor: "#000000",
    }),
    surfaceNode("[btn2]", "#dddddd", {
      tagName: "button",
      buttonLike: true,
      textColor: "#000000",
    }),
  ];

  const colorOf = (
    decisions: ReturnType<typeof buildMapping>["decisions"],
    sel: string,
  ) => (decisions.find((d) => d.selector === sel)?.color ?? "").toLowerCase();
  const bgOf = (
    decisions: ReturnType<typeof buildMapping>["decisions"],
    sel: string,
  ) =>
    (decisions.find((d) => d.selector === sel)?.background ?? "").toLowerCase();

  it("uses ≥4 DISTINCT colors across roles (would be ~2 on the old engine)", () => {
    const { decisions } = buildMapping(page(), [], palette, MAX);
    const used = new Set<string>();
    for (const d of decisions) {
      if (d.color) used.add(d.color.toLowerCase());
      if (d.background) used.add(d.background.toLowerCase());
    }
    expect(used.size).toBeGreaterThanOrEqual(4);
  });

  it("heading, link, body, and primary-button colors are MUTUALLY distinct", () => {
    const { decisions } = buildMapping(page(), [], palette, MAX);
    const h1 = colorOf(decisions, "[h1]");
    const p = colorOf(decisions, "[p]");
    const a = colorOf(decisions, "[a]");
    const primaryBg = bgOf(decisions, "[btn1]");
    const four = new Set([h1, p, a, primaryBg]);
    expect(four.size).toBe(4);
  });

  it("role differentiation: h1 ≠ p ≠ a ≠ muted; primary btn bg ≠ secondary btn bg", () => {
    const { decisions } = buildMapping(page(), [], palette, MAX);
    const h1 = colorOf(decisions, "[h1]");
    const p = colorOf(decisions, "[p]");
    const a = colorOf(decisions, "[a]");
    const small = colorOf(decisions, "[small]");
    expect(h1).not.toBe(p);
    expect(p).not.toBe(a);
    expect(a).not.toBe(small);
    expect(h1).not.toBe(a);
    expect(bgOf(decisions, "[btn1]")).not.toBe(bgOf(decisions, "[btn2]"));
  });

  it("link and heading keep DIFFERENT hues after AA enforcement", () => {
    const { decisions } = buildMapping(page(), [], palette, MAX);
    const a = colorOf(decisions, "[a]");
    const h1 = colorOf(decisions, "[h1]");
    // Both are real colors (not gray), separated in hue — the anti-monochrome
    // guarantee survives the contrast pass.
    expect(hexToHsl(a).s).toBeGreaterThan(15);
    expect(hexToHsl(h1).s).toBeGreaterThan(15);
    expect(hueDist(hexToHsl(a).h, hexToHsl(h1).h)).toBeGreaterThan(40);
  });

  // AA holds for accent-colored text at EVERY intensity, including full: the
  // readability floor relit any unreadable swatch color to a readable shade of
  // the same hue, so the invisible-text guarantee survives the source-of-truth
  // rule. Each text node's parent is the body, which here OWNS a background, so
  // the engine paints `body` as a SURFACE — and THAT surface paint is the bg that
  // actually renders behind body-level text (the `body` surface rule shares the
  // base rule's selector but is emitted later, so it wins). With the now-saturated
  // palette the body surface paint differs from `baseBackground`, so we MUST floor
  // against the surface paint, not `baseBackground`.
  for (const opts of [LOW, MID, MAX]) {
    it(`AA holds for EVERY accent-colored text/effective-bg pair (intensity ${opts.intensity})`, () => {
      const result = buildMapping(page(), [], palette, opts);
      // The bg that actually renders behind body-level text: the `body` SURFACE
      // decision. The engine emits TWO `body` rules at equal specificity — the
      // base rule (paints `baseBackground`) FIRST, then the classified surface
      // rule (its own paint) — so the LAST one wins the cascade. Take the last
      // `body` surface paint; fall back to baseBackground if body weren't a surface.
      const bodyPaints = result.decisions.filter(
        (d) => d.selector === "body" && d.role === "surface" && d.background,
      );
      const bg = bodyPaints.at(-1)?.background ?? result.baseBackground;
      for (const d of result.decisions) {
        if (d.role === "text" && d.color) {
          const large = d.semantic === "heading" || d.semantic === "subheading";
          expect(
            contrastRatio(d.color, bg),
            `${d.selector} (${d.semantic}) ${d.color} on ${bg}`,
          ).toBeGreaterThanOrEqual(large ? AA_LARGE : AA_NORMAL);
        }
      }
      // and button labels are AA against their fills.
      for (const sel of ["[btn1]", "[btn2]"]) {
        const d = result.decisions.find((x) => x.selector === sel);
        expect(
          contrastRatio(d?.color as string, d?.background as string),
        ).toBeGreaterThanOrEqual(AA_NORMAL);
      }
    });
  }

  it("primary button is the saturated accent; secondary is subtler", () => {
    const { decisions } = buildMapping(page(), [], palette, MAX);
    const primaryBg = bgOf(decisions, "[btn1]");
    const secondaryBg = bgOf(decisions, "[btn2]");
    // primary carries more saturation than secondary (the visual hierarchy).
    expect(hexToHsl(primaryBg).s).toBeGreaterThan(hexToHsl(secondaryBg).s);
  });
});
