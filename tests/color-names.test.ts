import { describe, expect, it } from "vitest";

import { describeColor } from "../src/lib/color-names";

describe("describeColor", () => {
  it("names colors by hue family", () => {
    expect(describeColor("#ff0000")).toContain("Red");
    expect(describeColor("#00ff00")).toContain("Green");
    expect(describeColor("#0000ff")).toContain("Blue");
  });

  it("handles black, white, and grays without a hue", () => {
    expect(describeColor("#000000")).toBe("Black");
    expect(describeColor("#ffffff")).toBe("White");
    expect(describeColor("#808080")).toBe("Gray");
  });

  it("adds a lightness/saturation modifier", () => {
    expect(describeColor("#660000")).toContain("Dark");
    expect(describeColor("#add8e6")).toMatch(/Light|Pale/);
  });

  it("always returns a real name (never empty or the old placeholder)", () => {
    for (const hex of ["#3a7bd5", "#a8245b", "#69c129", "#123456", "#fedcba"]) {
      const name = describeColor(hex);
      expect(name.length).toBeGreaterThan(0);
      expect(name).not.toBe("scheme");
    }
  });
});
