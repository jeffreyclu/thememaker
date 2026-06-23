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

/**
 * Element-picker messages, sent DIRECTLY from the popup to the active tab's
 * CONTENT SCRIPT (`chrome.tabs.sendMessage`), NOT through the background hub:
 * pick mode is an in-page interaction owned by the always-on content script.
 *
 * Flow: popup → `START_PICK` → content script enters pick mode (hover highlight +
 * capture-phase click). On a click the content script classifies the element's
 * semantic role via `roleOfElement`, replies `ELEMENT_PICKED { role }`, and
 * exits. `STOP_PICK` cancels pick mode (also fired on Esc, popup close, etc.).
 */
export interface StartPickMessage {
  type: "START_PICK";
}

/** Cancel pick mode on the active tab's content script. */
export interface StopPickMessage {
  type: "STOP_PICK";
}

/**
 * Apply a palette + options DIRECTLY in a specific tab's content script.
 *
 * Used by the DETACHED picker window (a standalone `chrome.windows` popup that
 * stays open while the user clicks the page). That window can't use the
 * background's `chrome.scripting` injector — that path targets the ACTIVE tab in
 * the CURRENT window, which is now the picker window itself, not the page. So
 * the picker window sends the palette here, to the page's own content script,
 * which runs the SAME `applyAdaptiveScheme` engine in place.
 */
export interface ApplyLiveMessage {
  type: "APPLY_LIVE";
  palette: Palette;
  options: ApplyOptions;
}

/**
 * The content script's reply to a click in pick mode: the override-key for the
 * clicked element's semantic role (a {@link import("./palette").PaletteRoles}
 * key, e.g. `heading` / `link` / `primary`). `cancelled` is `true` when pick
 * mode ended without a pick (Esc / STOP_PICK), so the popup can clear its UI.
 */
export interface ElementPickedMessage {
  type: "ELEMENT_PICKED";
  /** The palette-role key the user chose to recolor, or null when cancelled. */
  role: string | null;
  /** True when pick mode ended without a selection. */
  cancelled?: boolean;
}

/** Messages the CONTENT SCRIPT handles (popup → content script, direct). */
export type ContentMessage =
  | StartPickMessage
  | StopPickMessage
  | ApplyLiveMessage;

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

/**
 * Fire-and-forget send of a {@link ContentMessage} to a specific tab's CONTENT
 * SCRIPT (`chrome.tabs.sendMessage`). Used by the popup to drive pick mode.
 * Resolves even if the tab has no listener (a non-injectable tab), swallowing
 * `lastError` so the popup never rejects on a chrome:// tab.
 */
export const sendToContent = (
  tabId: number,
  message: ContentMessage,
): Promise<void> =>
  new Promise((resolve) => {
    try {
      chrome.tabs.sendMessage(tabId, message, () => {
        void chrome.runtime.lastError; // ignore "no receiving end"
        resolve();
      });
    } catch {
      resolve();
    }
  });
