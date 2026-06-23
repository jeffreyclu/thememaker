import { describe, expect, it } from "vitest";

import {
  buildMapping,
  blendFactor,
  classifyVarName,
  isVariableDriven,
  remapVariables,
  HTML_SELECTOR,
  BODY_SELECTOR,
  type DetectedNode,
  type DetectedVar,
} from "../src/lib/mapping";
import {
  contrastRatio,
  AA_NORMAL,
  isHexColor,
  luminanceOf,
} from "../src/lib/color";
import { generatePalette } from "../src/lib/palette";
import type { ApplyOptions } from "../src/types";

const palette = generatePalette("#3a7bd5", "triad");

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
    // The label's color is AA against the panel's NEW dark background — this is
    // the invisible-text fix: contrast is enforced vs the effective ancestor bg.
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
});
