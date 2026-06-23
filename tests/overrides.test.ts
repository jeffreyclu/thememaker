/**
 * Custom-theme OVERRIDES + single-element role classifier.
 *
 * Covers:
 *  - `roleOfElement` / `overrideKeyForElement`: one synthetic element → its
 *    semantic role / override-key, using the SAME classification as the engine
 *    walk (classifyText / classifySurface / classifyButton).
 *  - `applyOverridesToRoles`: override key → hex replaces only that role,
 *    ignores junk, never mutates the input.
 *  - `buildMapping` with `options.overrides`: the override color is used for that
 *    role, the AA floor still holds, other roles are unchanged, and an overridden
 *    SURFACE re-floors its text.
 */
import { describe, expect, it } from "vitest";

import {
  applyOverridesToRoles,
  buildMapping,
  overrideKeyForElement,
  roleOfElement,
  OVERRIDE_KEY_BY_ROLE,
  type DetectedNode,
  type RoleClassifierInput,
} from "../src/lib/mapping";
import { generatePalette } from "../src/lib/palette";
import { contrastRatio, AA_NORMAL, AA_LARGE } from "../src/lib/color";

const palette = generatePalette("#3a7bd5", "triad");

const el = (extra: Partial<RoleClassifierInput>): RoleClassifierInput => ({
  tagName: "div",
  ...extra,
});

describe("roleOfElement (single-element classifier)", () => {
  it("classifies TEXT elements the same way the walk does", () => {
    expect(roleOfElement(el({ tagName: "h1" }))).toBe("heading");
    expect(roleOfElement(el({ tagName: "h2" }))).toBe("heading");
    expect(roleOfElement(el({ tagName: "h3" }))).toBe("subheading");
    expect(roleOfElement(el({ tagName: "a" }))).toBe("link");
    expect(roleOfElement(el({ tagName: "small" }))).toBe("muted");
    expect(roleOfElement(el({ tagName: "p" }))).toBe("body");
    expect(roleOfElement(el({ tagName: "strong" }))).toBe("emphasis");
    expect(
      roleOfElement(el({ tagName: "blockquote", hasOwnBackground: false })),
    ).toBe("quote");
    expect(
      roleOfElement(el({ tagName: "span", className: "text-muted" })),
    ).toBe("muted");
  });

  it("classifies SURFACE elements (own background) into surface roles", () => {
    expect(
      roleOfElement(el({ tagName: "section", hasOwnBackground: true })),
    ).toBe("card");
    expect(roleOfElement(el({ tagName: "pre", hasOwnBackground: true }))).toBe(
      "code",
    );
    expect(
      roleOfElement(el({ tagName: "header", hasOwnBackground: true })),
    ).toBe("banner");
    expect(
      roleOfElement(el({ tagName: "aside", hasOwnBackground: true })),
    ).toBe("complementary");
    expect(roleOfElement(el({ tagName: "div", hasOwnBackground: true }))).toBe(
      "surface",
    );
  });

  it("classifies BUTTONS into primary/secondary (class > text > order)", () => {
    expect(roleOfElement(el({ tagName: "button", buttonLike: true }))).toBe(
      "primaryButton",
    );
    expect(
      roleOfElement(
        el({ tagName: "button", buttonLike: true, className: "btn-secondary" }),
      ),
    ).toBe("secondaryButton");
    expect(
      roleOfElement(
        el({ tagName: "button", buttonLike: true, text: "cancel" }),
      ),
    ).toBe("secondaryButton");
    // second button in document order → secondary
    expect(
      roleOfElement(
        el({ tagName: "button", buttonLike: true, buttonOrder: 1 }),
      ),
    ).toBe("secondaryButton");
  });

  it("overrideKeyForElement maps roles to palette-role keys", () => {
    expect(overrideKeyForElement(el({ tagName: "h1" }))).toBe("heading");
    expect(overrideKeyForElement(el({ tagName: "a" }))).toBe("link");
    expect(overrideKeyForElement(el({ tagName: "p" }))).toBe("textPrimary");
    expect(
      overrideKeyForElement(el({ tagName: "button", buttonLike: true })),
    ).toBe("primary");
    expect(
      overrideKeyForElement(el({ tagName: "section", hasOwnBackground: true })),
    ).toBe("surface");
  });

  it("every semantic role maps to a real PaletteRoles key", () => {
    for (const key of Object.values(OVERRIDE_KEY_BY_ROLE)) {
      expect(palette.roles).toHaveProperty(key);
    }
  });
});

describe("applyOverridesToRoles", () => {
  it("replaces only the overridden role; leaves others untouched", () => {
    const next = applyOverridesToRoles(palette.roles, { heading: "#ff0000" });
    expect(next.heading).toBe("#ff0000");
    expect(next.link).toBe(palette.roles.link);
    expect(next.primary).toBe(palette.roles.primary);
  });

  it("normalizes hex and ignores unknown keys / non-hex values", () => {
    const next = applyOverridesToRoles(palette.roles, {
      heading: "#ABC", // short hex → normalized
      bogusKey: "#123456", // unknown role → ignored
      link: "not-a-color", // invalid → ignored
    });
    expect(next.heading).toBe("#aabbcc");
    expect(next).not.toHaveProperty("bogusKey");
    expect(next.link).toBe(palette.roles.link); // unchanged
  });

  it("returns the same roles object reference when no overrides", () => {
    expect(applyOverridesToRoles(palette.roles, undefined)).toBe(palette.roles);
  });

  it("does not mutate the input roles", () => {
    const before = { ...palette.roles };
    applyOverridesToRoles(palette.roles, { heading: "#ff0000" });
    expect(palette.roles).toStrictEqual(before);
  });
});

describe("buildMapping with overrides", () => {
  const page = (): DetectedNode[] => [
    {
      selector: "body",
      role: "surface",
      tagName: "body",
      bgColor: "#ffffff",
      luminance: 1,
    },
    {
      selector: "[h1]",
      role: "text",
      tagName: "h1",
      textColor: "#000000",
      luminance: 0,
      parent: 0,
    },
    {
      selector: "[a]",
      role: "text",
      tagName: "a",
      textColor: "#000000",
      luminance: 0,
      parent: 0,
    },
  ];

  const colorOf = (
    decisions: ReturnType<typeof buildMapping>["decisions"],
    sel: string,
  ) => (decisions.find((d) => d.selector === sel)?.color ?? "").toLowerCase();

  it("uses the override color for the overridden role (readable on bg → exact)", () => {
    // #1565c0 is readable on a white bg, so at full intensity it is painted exactly.
    const { decisions } = buildMapping(page(), [], palette, {
      intensity: 100,
      overrides: { heading: "#1565c0" },
    });
    expect(colorOf(decisions, "[h1]")).toBe("#1565c0");
  });

  it("AA floor STILL holds for an unreadable override (relit, not collapsed)", () => {
    // Override heading to pale yellow — unreadable on white. The engine must
    // relight it to a readable shade of the SAME hue (not leave it invisible).
    const { decisions, baseBackground } = buildMapping(page(), [], palette, {
      intensity: 100,
      overrides: { heading: "#fffbe0" },
    });
    const h1 = colorOf(decisions, "[h1]");
    // It changed (was floored)...
    expect(h1).not.toBe("#fffbe0");
    // ...and now meets AA-large against the base background.
    expect(contrastRatio(h1, baseBackground)).toBeGreaterThanOrEqual(AA_LARGE);
  });

  it("leaves OTHER roles exactly as the generated theme", () => {
    const withOverride = buildMapping(page(), [], palette, {
      intensity: 100,
      overrides: { heading: "#ff0000" },
    });
    const without = buildMapping(page(), [], palette, { intensity: 100 });
    // The link (untouched role) is identical with and without the override.
    expect(colorOf(withOverride.decisions, "[a]")).toBe(
      colorOf(without.decisions, "[a]"),
    );
  });

  it("an overridden SURFACE re-floors its text against the new fill", () => {
    // A primary button overridden to a very dark fill → its label must re-floor
    // to stay AA against that dark background.
    const surfacePage: DetectedNode[] = [
      {
        selector: "[btn]",
        role: "surface",
        tagName: "button",
        buttonLike: true,
        bgColor: "#dddddd",
        textColor: "#000000",
        luminance: 0.8,
      },
    ];
    const { decisions } = buildMapping(surfacePage, [], palette, {
      intensity: 100,
      overrides: { primary: "#0a0a0a" },
    });
    const d = decisions.find((x) => x.selector === "[btn]");
    expect(d?.background?.toLowerCase()).toBe("#0a0a0a"); // surfaces are not floored
    // Its label is AA against the new dark fill.
    expect(
      contrastRatio(d?.color as string, d?.background as string),
    ).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it("the page base (bg override) recolors html/body", () => {
    const { baseBackground } = buildMapping(page(), [], palette, {
      intensity: 100,
      overrides: { bg: "#101820" },
    });
    expect(baseBackground.toLowerCase()).toBe("#101820");
  });
});
