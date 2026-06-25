import { describe, expect, it } from "vitest";

import { siteStateReducer } from "../src/lib/site-state";
import { DEFAULT_SITE_STATE, type SiteState } from "../src/lib/storage";
import { mockScheme } from "./mocks";

describe("siteStateReducer", () => {
  it("enable sets enabled true", () => {
    expect(
      siteStateReducer(DEFAULT_SITE_STATE, { type: "enable" }),
    ).toStrictEqual({ enabled: true });
  });

  it("enable persists the supplied scheme as the reapply target", () => {
    const next = siteStateReducer(DEFAULT_SITE_STATE, {
      type: "enable",
      scheme: mockScheme,
    });
    expect(next).toStrictEqual({ enabled: true, savedScheme: mockScheme });
  });

  it("enable without a scheme keeps any previously-saved scheme", () => {
    const prior: SiteState = { enabled: false, savedScheme: mockScheme };
    expect(siteStateReducer(prior, { type: "enable" })).toStrictEqual({
      enabled: true,
      savedScheme: mockScheme,
    });
  });

  it("is pure (does not mutate the input)", () => {
    const input: SiteState = { enabled: false };
    siteStateReducer(input, { type: "enable" });
    expect(input).toStrictEqual({ enabled: false });
  });
});
