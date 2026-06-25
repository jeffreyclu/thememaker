/**
 * Routes popup -> content-script messages to the engine and picker.
 *
 * `lib/messaging.ts` defines the message shapes and the popup's SEND helpers;
 * this is the content script's RECEIVE side. Reply-carrying messages (APPLY /
 * RESET / QUERY) return a typed response; the picker control messages are
 * fire-and-forget.
 */
import { runApply, runQuery, runReset } from "./apply-handlers";
import { applyLive, hidePicker, showPicker } from "./picker/picker-session";
import type {
  ContentMessage,
  ContentReplyMessage,
  MessageResponse,
} from "../lib/messaging";

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

/** Installs the popup -> content-script message listener. */
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
