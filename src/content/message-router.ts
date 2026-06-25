/**
 * The content script's RECEIVE side: routes popup → content messages to the
 * engine + picker, and runs the APPLY / RESET / QUERY handlers.
 *
 * `lib/messaging.ts` defines the message shapes and the popup's SEND helpers.
 * Reply-carrying messages (APPLY / RESET / QUERY) drive the single long-lived
 * {@link engine} and return a typed response; the picker control messages (SHOW /
 * HIDE / APPLY_LIVE) are fire-and-forget. Every reply handler is total — it
 * returns a typed response and never throws — so the MV3 reply channel always
 * resolves (the popup awaits it).
 */
import { engine } from "../lib/engine";
import { applyLive, hidePicker, showPicker } from "../picker";
import type {
  ApplySchemeResponse,
  ContentMessage,
  ContentReplyMessage,
  MessageResponse,
  QueryStateResponse,
  ResetSchemeResponse,
} from "../lib/messaging";
import type { Palette } from "../lib/palette";
import type { ApplyOptions, Scheme } from "../types";

/**
 * APPLY: theme the page via `engine.applyWhenReady` and report the apply landed.
 * The engine defers to `DOMContentLoaded` if the body isn't there yet, so
 * `applied: true` means "scheduled/applied", before the page necessarily paints.
 */
const runApply = (
  palette: Palette,
  options: ApplyOptions,
  scheme: Scheme,
): ApplySchemeResponse => {
  try {
    engine.applyWhenReady(palette, options);
    return { ok: true, applied: true, scheme };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
};

/** RESET: tear down the engine's `<style>`; a reset leaves nothing applied. */
const runReset = (): ResetSchemeResponse => {
  try {
    engine.reset();
    return { ok: true, applied: false };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
};

/** QUERY: report whether a Thememaker style is currently on this page. */
const runQuery = (): QueryStateResponse => {
  try {
    return { ok: true, applied: engine.isApplied() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
};

/** Handles a fire-and-forget picker control message (no reply). */
export const handleContentMessage = (message: ContentMessage): void => {
  if (message.type === "SHOW_PICKER") {
    showPicker(message.palette, message.options);
  } else if (message.type === "HIDE_PICKER") {
    hidePicker();
  } else if (message.type === "APPLY_LIVE") {
    applyLive(message.palette, message.options);
  }
};

/** Handles a reply-carrying APPLY/RESET/QUERY message and returns its result. */
export const handleContentReplyMessage = (
  message: ContentReplyMessage,
): MessageResponse => {
  switch (message.type) {
    case "APPLY_SCHEME":
      return runApply(message.palette, message.options, message.scheme);
    case "RESET_SCHEME":
      return runReset();
    case "QUERY_STATE":
      return runQuery();
    default: {
      const _exhaustive: never = message;
      return {
        ok: false,
        error: `unknown message: ${JSON.stringify(_exhaustive)}`,
      };
    }
  }
};

const needsReply = (
  message: ContentMessage | ContentReplyMessage,
): message is ContentReplyMessage =>
  message.type === "APPLY_SCHEME" ||
  message.type === "RESET_SCHEME" ||
  message.type === "QUERY_STATE";

/** Installs the popup → content-script message listener. */
export const installMessageRouter = (): void => {
  try {
    chrome.runtime.onMessage.addListener(
      (
        message: ContentMessage | ContentReplyMessage,
        _sender,
        sendResponse: (response: MessageResponse) => void,
      ) => {
        if (needsReply(message)) {
          sendResponse(handleContentReplyMessage(message));
          // Keep the MV3 channel open so the response is delivered.
          return true;
        }
        handleContentMessage(message);
        return undefined;
      },
    );
  } catch {
    // chrome.runtime unavailable (non-extension context) — ignore.
  }
};
