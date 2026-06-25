/**
 * Shared SCHEME side-effect engine — the transport + apply/persist primitives the
 * focused scheme hooks (`useApplyScheme`, `useGenerate`, `useFavorites`,
 * `useHistory`, `usePersist`) build their intents on.
 *
 * One factory over the scheme store + the popup view actions, so the primitives
 * stay built-once + read the latest state. This is the SHARED commit logic (no
 * duplication across the focused hooks), NOT a public action layer — each hook
 * composes only what it needs and owns its own dispatch/orchestration.
 *
 * CRITICAL — React's `dispatch` is DEFERRED: callers that apply a scheme right
 * after dispatching it pass an explicit `LiveScheme` SNAPSHOT, since reading
 * `getState()` after `dispatch` would still see the pre-dispatch scheme.
 */
import { applyPayloadForScheme, schemeWithIntensity } from "../../lib/scheme";
import { siteStateReducer } from "../../lib/storage/site-state";
import { sendToContent, sendToContentWithReply } from "../../lib/messaging";
import type {
  ContentMessage,
  ContentReplyMessage,
  ResponseFor,
} from "../../lib/messaging";
import { storage } from "../../lib/storage";
import type { Intensity, RoleOverrides, Scheme } from "../../types";
import type { SchemeStore } from "./scheme-store";
import type { PopupActions } from "./usePopup";

/** The exact look to commit (apply + persist): scheme + live intensity + overrides. */
export interface LiveScheme {
  scheme: Scheme;
  intensity: Intensity;
  overrides: RoleOverrides;
}

export interface SchemeEffects {
  /** Send a content message that expects a typed reply (no tab → not-ok). */
  send: <M extends ContentReplyMessage>(
    message: M,
  ) => Promise<ResponseFor[M["type"]]>;
  /** Fire-and-forget a content message (no reply, no-op without a tab). */
  sendNoReply: (message: ContentMessage) => Promise<void>;
  /** The look to commit: an explicit snapshot, or the current reducer state. */
  resolveLive: (live?: LiveScheme) => LiveScheme | null;
  /** Apply a scheme to the active tab (reuses its palette); updates `applied`. */
  applyCurrentScheme: (live?: LiveScheme) => Promise<void>;
  /** Auto-save the live look for this origin so a reload restores it. */
  persistTheme: (live?: LiveScheme) => Promise<void>;
  /** The single apply-live + persist path; throws are caught + surfaced. */
  commitCurrent: (live?: LiveScheme) => Promise<void>;
}

/** Builds the shared effect primitives over the scheme store + popup actions. */
export const createSchemeEffects = (
  store: SchemeStore,
  popup: PopupActions,
): SchemeEffects => {
  const { getState, dispatch, activeTabId } = store;

  const send = <M extends ContentReplyMessage>(
    message: M,
  ): Promise<ResponseFor[M["type"]]> => {
    const tabId = activeTabId();
    return tabId == null
      ? Promise.resolve({ ok: false, applied: false } as never)
      : sendToContentWithReply(tabId, message);
  };

  const sendNoReply = (message: ContentMessage): Promise<void> => {
    const tabId = activeTabId();
    return tabId == null ? Promise.resolve() : sendToContent(tabId, message);
  };

  const resolveLive = (live?: LiveScheme): LiveScheme | null => {
    if (live) {
      return live;
    }
    const s = getState();
    return s.current
      ? { scheme: s.current, intensity: s.intensity, overrides: s.overrides }
      : null;
  };

  // Reuses the palette already on the page (only intensity + live overrides
  // change — NO new colors). Updates `applied`.
  const applyCurrentScheme = async (live?: LiveScheme): Promise<void> => {
    const resolved = resolveLive(live);
    if (!resolved) {
      return;
    }
    const { palette, options } = applyPayloadForScheme(
      resolved.scheme,
      resolved.intensity,
      resolved.overrides,
    );
    const resp = await send({
      type: "APPLY_SCHEME",
      palette,
      options,
      scheme: resolved.scheme,
    });
    if (!resp.ok) {
      popup.setError(resp.error ?? "apply failed");
      return;
    }
    dispatch({ type: "applied", applied: Boolean(resp.applied) });
  };

  // No-op when there's nothing to save (no origin / no current scheme).
  const persistTheme = async (live?: LiveScheme): Promise<void> => {
    const s = getState();
    const resolved = resolveLive(live);
    if (!s.origin || !resolved) {
      return;
    }
    const scheme = schemeWithIntensity(
      resolved.scheme,
      resolved.intensity,
      resolved.overrides,
    );
    const next = siteStateReducer(await storage.getSiteState(s.origin), {
      type: "enable",
      scheme,
    });
    await storage.setSiteState(s.origin, next);
    if (!s.siteEnabled) {
      dispatch({ type: "setSiteEnabled", enabled: true });
    }
  };

  const commitCurrent = async (live?: LiveScheme): Promise<void> => {
    try {
      await applyCurrentScheme(live);
      await persistTheme(live);
    } catch (e) {
      popup.setError(e instanceof Error ? e.message : "apply failed");
    }
  };

  return {
    send,
    sendNoReply,
    resolveLive,
    applyCurrentScheme,
    persistTheme,
    commitCurrent,
  };
};
