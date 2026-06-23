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

  it("disable clears enabled but KEEPS the saved scheme (re-enable restores)", () => {
    const enabled: SiteState = { enabled: true, savedScheme: mockScheme };
    expect(siteStateReducer(enabled, { type: "disable" })).toStrictEqual({
      enabled: false,
      savedScheme: mockScheme,
    });
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

  it("toggle flips enabled both ways and saves the scheme when enabling", () => {
    const on = siteStateReducer(DEFAULT_SITE_STATE, {
      type: "toggle",
      scheme: mockScheme,
    });
    expect(on.enabled).toBe(true);
    expect(on.savedScheme).toStrictEqual(mockScheme);
    const off = siteStateReducer(on, { type: "toggle" });
    expect(off.enabled).toBe(false);
    // off keeps the saved scheme so re-enabling restores it
    expect(off.savedScheme).toStrictEqual(mockScheme);
  });

  it("rememberScheme stores the scheme without changing enabled", () => {
    const next = siteStateReducer(
      { enabled: true },
      { type: "rememberScheme", scheme: mockScheme },
    );
    expect(next).toStrictEqual({ enabled: true, savedScheme: mockScheme });
  });

  it("forgetScheme drops the saved scheme but keeps enabled", () => {
    const next = siteStateReducer(
      { enabled: true, savedScheme: mockScheme },
      { type: "forgetScheme" },
    );
    expect(next).toStrictEqual({ enabled: true, savedScheme: undefined });
  });

  it("is pure (does not mutate the input)", () => {
    const input: SiteState = { enabled: false };
    siteStateReducer(input, { type: "enable" });
    expect(input).toStrictEqual({ enabled: false });
  });
});
