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
 * pick mode is an IN-PAGE interaction owned by the always-on content script,
 * driven through an in-page floating control (Shadow DOM panel).
 *
 * Flow: the user clicks "Pick element" in the popup → the popup sends
 * `SHOW_PICKER` (carrying the live theme so the panel can live-apply + persist
 * its picks) and then closes. The in-page panel handles all picking + recoloring
 * itself; storage is the source of truth. There is NO reply channel and NO
 * detached window — the panel lives on the page.
 */

/**
 * Show the in-page floating picker control on the active tab. Carries the live
 * theme (palette + intensity + the popup's current overrides) so the content
 * script can apply each pick LIVE in place and persist it into the per-site
 * saved scheme. The panel is the source of all picking/recoloring once shown.
 */
export interface ShowPickerMessage {
  type: "SHOW_PICKER";
  /** The palette the page is (or will be) themed with. */
  palette: Palette;
  /** Apply options (intensity + the current overrides) the panel starts from. */
  options: ApplyOptions;
}

/** Hide the in-page picker control (e.g. the popup cleared all overrides). */
export interface HidePickerMessage {
  type: "HIDE_PICKER";
}

/**
 * Re-apply the theme in place with the given options (intensity + overrides).
 * Sent from the popup when it changes overrides while the page is themed (e.g.
 * "Clear all"), so the in-page result reflects the popup edit without a reload.
 * The content script runs the SAME `applyAdaptiveScheme` engine in place and
 * keeps its panel rows in sync.
 */
export interface ApplyLiveMessage {
  type: "APPLY_LIVE";
  palette: Palette;
  options: ApplyOptions;
}

/** Messages the CONTENT SCRIPT handles (popup → content script, direct). */
export type ContentMessage =
  | ShowPickerMessage
  | HidePickerMessage
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

/**
 * Fields every response carries. `ok: false` carries a human-readable `error`
 * (errors can come back for ANY request type — the background catch/exhaustive
 * guard produces this shape — so it lives on the base every response extends).
 */
export interface BaseResponse {
  ok: boolean;
  /** Origin of the active tab the action targeted, when resolvable. */
  origin?: string | null;
  /** Set when `ok` is false. */
  error?: string;
}

/** Response to {@link ApplySchemeMessage}: did the apply land, on what scheme. */
export interface ApplySchemeResponse extends BaseResponse {
  /** Whether the style was applied to the active tab. */
  applied?: boolean;
  /** The applied scheme, echoed back for state/history. */
  scheme?: Scheme;
}

/** Response to {@link ResetSchemeMessage}: a reset leaves nothing applied. */
export interface ResetSchemeResponse extends BaseResponse {
  /** Always `false` on success — a reset removes the theme. */
  applied?: false;
}

/** Response to {@link QueryStateMessage}: is a theme currently applied. */
export interface QueryStateResponse extends BaseResponse {
  /** Whether a Thememaker style is applied on the active tab. */
  applied?: boolean;
}

/**
 * The union of all response shapes — the type the background router returns
 * before `sendMessage` narrows it to the caller's request type via
 * {@link ResponseFor}.
 */
export type MessageResponse =
  | ApplySchemeResponse
  | ResetSchemeResponse
  | QueryStateResponse;

/**
 * Maps each request type to the SPECIFIC response it yields (request →
 * response), so a `QUERY_STATE` caller never sees a `scheme?` it can't get and a
 * `RESET_SCHEME` caller sees `applied` typed as the literal `false`.
 */
export interface ResponseFor {
  APPLY_SCHEME: ApplySchemeResponse;
  RESET_SCHEME: ResetSchemeResponse;
  QUERY_STATE: QueryStateResponse;
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
