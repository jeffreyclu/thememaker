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

  it("disable clears enabled and forgets the saved scheme", () => {
    const enabled: SiteState = { enabled: true, savedScheme: mockScheme };
    expect(siteStateReducer(enabled, { type: "disable" })).toStrictEqual({
      enabled: false,
      savedScheme: undefined,
    });
  });

  it("toggle flips enabled both ways", () => {
    const on = siteStateReducer(DEFAULT_SITE_STATE, { type: "toggle" });
    expect(on.enabled).toBe(true);
    const off = siteStateReducer(on, { type: "toggle" });
    expect(off.enabled).toBe(false);
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
