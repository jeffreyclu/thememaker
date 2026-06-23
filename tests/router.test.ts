import { beforeEach, describe, expect, it, vi } from "vitest";

import { routeMessage, type Injector } from "../src/lib/router";
import type { ThememakerMessage } from "../src/lib/messages";
import { mockOptions, mockPalette, mockScheme } from "./mocks";

const makeInjector = (overrides: Partial<Injector> = {}): Injector => ({
  apply: vi.fn(async () => ({ origin: "https://example.com", applied: true })),
  reset: vi.fn(async () => ({ origin: "https://example.com", removed: true })),
  query: vi.fn(async () => ({ origin: "https://example.com", applied: false })),
  ...overrides,
});

describe("routeMessage", () => {
  let injector: Injector;
  beforeEach(() => {
    injector = makeInjector();
  });

  it("routes APPLY_SCHEME to injector.apply and echoes the scheme", async () => {
    const msg: ThememakerMessage = {
      type: "APPLY_SCHEME",
      palette: mockPalette,
      options: mockOptions,
      scheme: mockScheme,
    };
    const resp = await routeMessage(msg, injector);
    expect(injector.apply).toHaveBeenCalledWith(mockPalette, mockOptions);
    expect(resp).toMatchObject({
      ok: true,
      applied: true,
      origin: "https://example.com",
      scheme: mockScheme,
    });
  });

  it("routes RESET_SCHEME to injector.reset and reports not-applied", async () => {
    const resp = await routeMessage({ type: "RESET_SCHEME" }, injector);
    expect(injector.reset).toHaveBeenCalled();
    expect(resp.ok).toBe(true);
    expect(resp.applied).toBe(false);
  });

  it("routes QUERY_STATE to injector.query", async () => {
    const resp = await routeMessage({ type: "QUERY_STATE" }, injector);
    expect(injector.query).toHaveBeenCalled();
    expect(resp).toMatchObject({ ok: true, applied: false });
  });

  it("turns an injector error into { ok: false, error } (no throw)", async () => {
    const failing = makeInjector({
      apply: vi.fn(async () => {
        throw new Error("no active tab");
      }),
    });
    const resp = await routeMessage(
      {
        type: "APPLY_SCHEME",
        palette: mockPalette,
        options: mockOptions,
        scheme: mockScheme,
      },
      failing,
    );
    expect(resp.ok).toBe(false);
    expect(resp.error).toBe("no active tab");
  });

  it("rejects an unknown message type", async () => {
    const resp = await routeMessage(
      { type: "NOPE" } as unknown as ThememakerMessage,
      injector,
    );
    expect(resp.ok).toBe(false);
    expect(resp.error).toContain("unknown message");
  });
});
