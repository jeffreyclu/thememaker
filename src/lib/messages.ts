/**
 * Typed message contract for popup ⇄ background.
 *
 * The popup is the control surface; the background service worker is the hub
 * that performs the privileged `chrome.scripting` injection into the active
 * tab. Centralizing injection in the background (rather than calling
 * `chrome.scripting` from the popup directly) keeps active-tab resolution and
 * the injection seam in one place — and is where Phase 3's command routing and
 * cross-tab logic will grow.
 *
 * Every message is discriminated by `type`; `sendMessage<T>` ties each request
 * type to its response type so callers stay end-to-end typed.
 */
import type { ApplyOptions, Scheme } from "../types";
import type { Palette } from "./palette";

/**
 * Apply a generated palette to the active tab. The ADAPTIVE engine runs IN the
 * page (only it can see computed styles), so the payload carries the palette +
 * options — NOT a precomputed CSS string. The page detects roles/variables,
 * maps onto the palette, enforces AA contrast, and injects the single
 * `<style id="themeMaker">`.
 */
export interface ApplySchemeMessage {
  type: "APPLY_SCHEME";
  /** The generated palette to map onto the page. */
  palette: Palette;
  /** Apply options (intensity). */
  options: ApplyOptions;
  /** The scheme being applied, echoed back to callers for state/history. */
  scheme: Scheme;
}

/** Remove Thememaker's <style> from the active tab. */
export interface ResetSchemeMessage {
  type: "RESET_SCHEME";
}

/** Query whether the active tab currently has a Thememaker style applied. */
export interface QueryStateMessage {
  type: "QUERY_STATE";
}

/** Discriminated union of all requests the background handles. */
export type ThememakerMessage =
  | ApplySchemeMessage
  | ResetSchemeMessage
  | QueryStateMessage;

/** Response envelope. `ok: false` carries a human-readable `error`. */
export interface MessageResponse {
  ok: boolean;
  /** Origin of the active tab the action targeted, when resolvable. */
  origin?: string | null;
  /** Whether a Thememaker style is applied on the active tab. */
  applied?: boolean;
  /** The scheme involved in the action, echoed for caller convenience. */
  scheme?: Scheme;
  error?: string;
}

/** Maps each request type to the response it yields (request → response). */
export interface ResponseFor {
  APPLY_SCHEME: MessageResponse;
  RESET_SCHEME: MessageResponse;
  QUERY_STATE: MessageResponse;
}

/**
 * Promise wrapper over `chrome.runtime.sendMessage`, typed so the response
 * matches the request's `type`.
 */
export const sendMessage = <M extends ThememakerMessage>(
  message: M,
): Promise<ResponseFor[M["type"]]> =>
  new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message));
        return;
      }
      resolve(response as ResponseFor[M["type"]]);
    });
  });
