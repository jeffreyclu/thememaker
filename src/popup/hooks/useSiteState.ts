/**
 * `useSiteState` — the per-site enable/persist business logic, as a hook.
 *
 * The per-site state (this origin's `enabled` flag + `savedScheme`) is STATE; it
 * lives in `chrome.storage` and is mirrored into the popup context (the reducer's
 * `siteEnabled`). The pure transition (`siteStateReducer`) is an implementation
 * detail of THIS hook — callers never reach for it directly. Components/actions
 * invoke `persistEnabled(origin, scheme)`; nobody calls the bare reducer.
 *
 * Returns a STABLE api (built once over the module storage singleton), so the
 * controller can pass it into the action deps without churn.
 */
import { useMemo } from "react";

import { storage, type SiteState } from "../../lib/storage";
import { siteStateReducer } from "../../lib/storage/site-state";
import type { Scheme } from "../../types";

export interface SiteStateApi {
  /**
   * Enables this origin and persists `scheme` as the look to auto-reapply,
   * returning the persisted state. Pure-data in, pure-data out at the call site —
   * the reducer transition + the storage write are owned here.
   */
  persistEnabled: (origin: string, scheme: Scheme) => Promise<SiteState>;
}

export const useSiteState = (): SiteStateApi =>
  useMemo<SiteStateApi>(
    () => ({
      persistEnabled: async (origin, scheme) => {
        const next = siteStateReducer(await storage.getSiteState(origin), {
          type: "enable",
          scheme,
        });
        await storage.setSiteState(origin, next);
        return next;
      },
    }),
    [],
  );
