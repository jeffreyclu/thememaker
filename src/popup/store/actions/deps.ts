/**
 * Plain dependency bundle for the popup's commit + action hooks.
 *
 * The provider (`PopupProvider.tsx`) owns ALL `chrome.*` access and builds this
 * `deps` object once, then passes it to `makeCommit` / `makeActions`. They read
 * the latest state via `getState` (backed by a ref), mutate via `dispatch`,
 * persist via `storage`, and reach the page via `send` / `sendNoReply` +
 * `activeTabId` — without touching `chrome.*`. This keeps the action logic a
 * pure function of its deps, so it stays unit-testable.
 */
import type { PopupAction, PopupState } from "../state";
import type {
  ContentMessage,
  ContentReplyMessage,
  ResponseFor,
} from "../../lib/messaging";
import type { Storage } from "../../lib/storage";
import type { SiteStateApi } from "../hooks/useSiteState";

export type PopupStorage = Storage;

/** Sends a reply-carrying message to the active tab's content script. */
export type SendReply = <M extends ContentReplyMessage>(
  message: M,
) => Promise<ResponseFor[M["type"]]>;

/** Fire-and-forget send to the active tab's content script (pick mode). */
export type SendNoReply = (message: ContentMessage) => Promise<void>;

export interface CommitDeps {
  /** Reads the latest reducer state (always current, not a render snapshot). */
  getState: () => PopupState;
  dispatch: (action: PopupAction) => void;
  storage: PopupStorage;
  /** Per-site enable/persist logic (owns the site-state transition). */
  siteState: SiteStateApi;
  /** Apply / reset / query on the active tab, with the typed reply. */
  send: SendReply;
}

export interface ActionDeps extends CommitDeps {
  /** Fire-and-forget content message (e.g. SHOW_PICKER / HIDE_PICKER). */
  sendNoReply: SendNoReply;
  /** The active tab's id, or null when unresolved / non-injectable. */
  activeTabId: () => number | null;
  /** Closes the popup window (Customize hands off to the in-page picker). */
  closeWindow: () => void;
}
