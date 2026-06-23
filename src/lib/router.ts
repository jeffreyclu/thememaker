/**
 * Background message router.
 *
 * The routing logic is separated from the `chrome.runtime.onMessage` wiring so
 * it is unit-testable: it depends only on an injected `Injector` (page-side
 * effects) which production backs with `chrome.scripting` against the active
 * tab. Tests pass a fake injector and assert routing + responses.
 */
import {
  applyAdaptiveScheme,
  removeSchemeStyle,
  isSchemeApplied,
} from "./inject";
import { originFromUrl } from "./storage";
import type { MessageResponse, ThememakerMessage } from "./messages";
import type { Palette } from "./palette";
import type { ApplyOptions } from "../types";

/**
 * Page-side effects the router needs, abstracted from `chrome.scripting`.
 * Each method resolves the active tab, runs the matching injected function, and
 * returns its result plus the resolved origin.
 */
export interface Injector {
  apply(
    palette: Palette,
    options: ApplyOptions,
  ): Promise<{ origin: string | null; applied: boolean }>;
  reset(): Promise<{ origin: string | null; removed: boolean }>;
  query(): Promise<{ origin: string | null; applied: boolean }>;
}

/**
 * Routes a single message to the injector and shapes the response.
 * Total: every branch returns a `MessageResponse`; failures become
 * `{ ok: false, error }` rather than throwing.
 */
export const routeMessage = async (
  message: ThememakerMessage,
  injector: Injector,
): Promise<MessageResponse> => {
  try {
    switch (message.type) {
      case "APPLY_SCHEME": {
        const { origin, applied } = await injector.apply(
          message.palette,
          message.options,
        );
        return { ok: true, origin, applied, scheme: message.scheme };
      }
      case "RESET_SCHEME": {
        const { origin, removed } = await injector.reset();
        return { ok: true, origin, applied: !removed && false };
      }
      case "QUERY_STATE": {
        const { origin, applied } = await injector.query();
        return { ok: true, origin, applied };
      }
      default: {
        // Exhaustiveness guard: unknown message types are rejected.
        const _exhaustive: never = message;
        return {
          ok: false,
          error: `unknown message: ${JSON.stringify(_exhaustive)}`,
        };
      }
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
};

/**
 * Production `Injector` backed by `chrome.scripting` against the active tab.
 * Each call resolves the active tab fresh (the `activeTab` grant is tied to the
 * current user gesture from the popup).
 */
export const createChromeInjector = (): Injector => {
  const activeTab = async (): Promise<chrome.tabs.Tab> => {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tab || tab.id == null) {
      throw new Error("no active tab");
    }
    return tab;
  };

  const run = async <T>(
    tabId: number,
    func: (...args: never[]) => T,
    args: unknown[] = [],
  ): Promise<T> => {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: func as (...a: unknown[]) => T,
      args,
    });
    return result.result as T;
  };

  return {
    async apply(palette: Palette, options: ApplyOptions) {
      const tab = await activeTab();
      const applied = await run<boolean>(
        tab.id as number,
        applyAdaptiveScheme,
        [palette, options],
      );
      return { origin: originFromUrl(tab.url), applied };
    },
    async reset() {
      const tab = await activeTab();
      const removed = await run<boolean>(tab.id as number, removeSchemeStyle);
      return { origin: originFromUrl(tab.url), removed };
    },
    async query() {
      const tab = await activeTab();
      const applied = await run<boolean>(tab.id as number, isSchemeApplied);
      return { origin: originFromUrl(tab.url), applied };
    },
  };
};
