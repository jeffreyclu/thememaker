/**
 * Shared dependency context for the popup's controller + handlers.
 *
 * The composition root (`index.ts`) owns ALL `chrome.*` access and builds this
 * `ctx`, passing it to `makeController` and `makeHandlers`. They read state via
 * `getState`, mutate via `dispatch`, persist via `storage`, and reach the page
 * via `send`/`sendNoReply` + `activeTabId` — without touching `chrome.*`
 * directly. This keeps the chrome wiring in one tiny root and makes the
 * controller/handlers unit-testable over a fake `ctx`.
 */
import type { PopupAction, PopupState } from "./state";
import type {
  ContentMessage,
  ContentReplyMessage,
  ResponseFor,
} from "../lib/messages";
import type { createChromeStorage } from "../lib/storage";

export type PopupStorage = ReturnType<typeof createChromeStorage>;

/** Sends a reply-carrying message to the active tab's content script. */
export type SendReply = <M extends ContentReplyMessage>(
  message: M,
) => Promise<ResponseFor[M["type"]]>;

/** Fire-and-forget send to the active tab's content script (pick mode). */
export type SendNoReply = (message: ContentMessage) => Promise<void>;

export interface PopupContext {
  /** Reads the latest reducer state (always current, not a snapshot). */
  getState: () => PopupState;
  dispatch: (action: PopupAction) => void;
  storage: PopupStorage;
  /** Apply / reset / query on the active tab, with the typed reply. */
  send: SendReply;
  /** Fire-and-forget content message (e.g. SHOW_PICKER / HIDE_PICKER). */
  sendNoReply: SendNoReply;
  /** The active tab's id, or null when unresolved / non-injectable. */
  activeTabId: () => number | null;
}
