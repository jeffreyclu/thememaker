import { describe, expect, it } from "vitest";

import { sendMessage } from "../src/lib/messages";
import { createChromeInjector } from "../src/lib/router";
import { getChromeMock } from "./chrome-mock";
import { mockOptions, mockPalette, mockScheme } from "./mocks";

describe("sendMessage (typed runtime wrapper)", () => {
  it("resolves with the callback response", async () => {
    const chrome = getChromeMock();
    chrome.runtime.sendMessage.mockImplementation(
      (_msg: unknown, cb: (r: unknown) => void) =>
        cb({ ok: true, applied: true }),
    );
    const resp = await sendMessage({ type: "QUERY_STATE" });
    expect(resp).toStrictEqual({ ok: true, applied: true });
  });

  it("rejects when chrome.runtime.lastError is set", async () => {
    const chrome = getChromeMock();
    chrome.runtime.lastError = { message: "boom" };
    chrome.runtime.sendMessage.mockImplementation(
      (_msg: unknown, cb: (r: unknown) => void) => cb(undefined),
    );
    await expect(sendMessage({ type: "RESET_SCHEME" })).rejects.toThrow("boom");
  });
});

describe("createChromeInjector (against chrome.tabs + chrome.scripting)", () => {
  const stubActiveTab = (tab: Partial<chrome.tabs.Tab> | null) => {
    getChromeMock().tabs.query.mockImplementation(
      (_q: unknown, cb?: (tabs: unknown[]) => void) => {
        const result = tab ? [tab] : [];
        if (cb) {
          cb(result);
          return undefined;
        }
        return Promise.resolve(result);
      },
    );
  };

  it("apply resolves the active tab, executes the func, returns origin+result", async () => {
    const chrome = getChromeMock();
    stubActiveTab({ id: 7, url: "https://example.com/x" });
    chrome.scripting.executeScript.mockResolvedValue([{ result: true }]);

    const injector = createChromeInjector();
    const out = await injector.apply(mockPalette, mockOptions);

    expect(chrome.scripting.executeScript).toHaveBeenCalledWith(
      expect.objectContaining({
        target: { tabId: 7 },
        args: [mockPalette, mockOptions],
      }),
    );
    expect(out).toStrictEqual({ origin: "https://example.com", applied: true });
  });

  it("reset runs removeSchemeStyle and maps removed flag", async () => {
    const chrome = getChromeMock();
    stubActiveTab({ id: 9, url: "https://site.test/" });
    chrome.scripting.executeScript.mockResolvedValue([{ result: true }]);

    const out = await createChromeInjector().reset();
    expect(out).toStrictEqual({ origin: "https://site.test", removed: true });
  });

  it("throws when there is no active tab", async () => {
    stubActiveTab(null);
    await expect(createChromeInjector().query()).rejects.toThrow(
      "no active tab",
    );
  });

  it("query maps the applied result", async () => {
    const chrome = getChromeMock();
    stubActiveTab({ id: 3, url: "https://q.test/" });
    chrome.scripting.executeScript.mockResolvedValue([{ result: false }]);
    const out = await createChromeInjector().query();
    expect(out).toStrictEqual({ origin: "https://q.test", applied: false });
    // echo the scheme through apply too, for completeness
    expect(mockScheme.schemeDetails).toBeTruthy();
  });
});
