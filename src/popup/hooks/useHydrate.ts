/**
 * `useHydrate` — restores the popup's initial state on mount.
 *
 * A real custom hook: it owns a `useEffect` that reads persisted storage + the
 * active tab (settings, history, favorites, this origin's saved theme, and
 * whether a Thememaker style is already applied), then dispatches a single
 * `hydrate` patch. It also records the active tab id (via the passed ref) so
 * apply/reset/pick messages can target it. Runs exactly once.
 */
import { useEffect, type MutableRefObject } from "react";

import { hydratePartial, type PopupAction } from "../state";
import type { PopupStorage } from "../actions/deps";
import { sendToContentWithReply } from "../../lib/messaging";
import { originFromUrl, DEFAULT_SITE_STATE } from "../../lib/storage/storage";

export const useHydrate = (
  storage: PopupStorage,
  activeTabIdRef: MutableRefObject<number | null>,
  dispatch: (action: PopupAction) => void,
): void => {
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      activeTabIdRef.current = tab?.id ?? null;
      const origin = originFromUrl(tab?.url);

      const [settings, history, favorites] = await Promise.all([
        storage.getSettings(),
        storage.getHistory(),
        storage.getFavorites(),
      ]);
      const site = origin
        ? await storage.getSiteState(origin)
        : DEFAULT_SITE_STATE;

      // Ask the content script whether a Thememaker style is already on the tab.
      // A non-injectable tab (chrome://, etc.) degrades to applied=false.
      let applied = false;
      if (activeTabIdRef.current != null) {
        const resp = await sendToContentWithReply(activeTabIdRef.current, {
          type: "QUERY_STATE",
        });
        applied = Boolean(resp.applied);
      }

      if (cancelled) {
        return;
      }
      // Storage is the single source of truth for overrides: the in-page picker
      // writes them onto this origin's saved scheme, which `hydratePartial`
      // restores into `partial.overrides`. Reading storage on open reflects them.
      const partial = hydratePartial({
        settings,
        history,
        favorites,
        origin,
        site,
        applied,
      });
      dispatch({ type: "hydrate", partial });
    })();
    return () => {
      cancelled = true;
    };
    // `storage`, `activeTabIdRef` + `dispatch` are stable for the popup's life;
    // hydration is a once-on-mount effect.
  }, [storage, activeTabIdRef, dispatch]);
};
