import { describe, expect, it } from "vitest";

import { sendToContentWithReply } from "../src/lib/messages";
import { getChromeMock } from "./chrome-mock";
import { mockOptions, mockPalette, mockScheme } from "./mocks";

/**
 * `sendToContentWithReply` is the single apply transport: a typed
 * `chrome.tabs.sendMessage` request/response to the active tab's content script.
 * It REPLACES the old popup→background `sendMessage` + `createChromeInjector`
 * seam (the executeScript path); the routing logic those tested now lives in the
 * content script (`tests/content.test.ts`).
 */
describe("sendToContentWithReply (popup → content reply channel)", () => {
  it("resolves with the content script's reply for APPLY_SCHEME", async () => {
    const chrome = getChromeMock();
    chrome.tabs.sendMessage.mockImplementation(
      (_tabId: number, _msg: unknown, cb: (r: unknown) => void) =>
        cb({ ok: true, applied: true, scheme: mockScheme }),
    );

    const resp = await sendToContentWithReply(7, {
      type: "APPLY_SCHEME",
      palette: mockPalette,
      options: mockOptions,
      scheme: mockScheme,
    });

    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ type: "APPLY_SCHEME", palette: mockPalette }),
      expect.any(Function),
    );
    expect(resp).toStrictEqual({
      ok: true,
      applied: true,
      scheme: mockScheme,
    });
  });

  it("resolves with the reply for QUERY_STATE", async () => {
    const chrome = getChromeMock();
    chrome.tabs.sendMessage.mockImplementation(
      (_tabId: number, _msg: unknown, cb: (r: unknown) => void) =>
        cb({ ok: true, applied: false }),
    );
    const resp = await sendToContentWithReply(3, { type: "QUERY_STATE" });
    expect(resp).toStrictEqual({ ok: true, applied: false });
  });

  it("degrades to { ok:false, applied:false } on a non-injectable tab (lastError)", async () => {
    const chrome = getChromeMock();
    chrome.runtime.lastError = { message: "no receiving end" };
    chrome.tabs.sendMessage.mockImplementation(
      (_tabId: number, _msg: unknown, cb: (r: unknown) => void) =>
        cb(undefined),
    );
    // No reject — the popup degrades gracefully on chrome:// / web store tabs.
    const resp = await sendToContentWithReply(9, { type: "RESET_SCHEME" });
    expect(resp).toStrictEqual({ ok: false, applied: false });
  });

  it("degrades when the reply is null (no listener) even without lastError", async () => {
    const chrome = getChromeMock();
    chrome.tabs.sendMessage.mockImplementation(
      (_tabId: number, _msg: unknown, cb: (r: unknown) => void) =>
        cb(undefined),
    );
    const resp = await sendToContentWithReply(2, { type: "QUERY_STATE" });
    expect(resp).toStrictEqual({ ok: false, applied: false });
  });

  it("degrades (no throw) when chrome.tabs.sendMessage itself throws", async () => {
    const chrome = getChromeMock();
    chrome.tabs.sendMessage.mockImplementation(() => {
      throw new Error("context invalidated");
    });
    const resp = await sendToContentWithReply(1, {
      type: "APPLY_SCHEME",
      palette: mockPalette,
      options: mockOptions,
      scheme: mockScheme,
    });
    expect(resp).toStrictEqual({ ok: false, applied: false });
  });
});
