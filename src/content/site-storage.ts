/**
 * Tiny direct `chrome.storage.local` read/write of a single per-site state,
 * used at `document_start` (auto-reapply) and by the in-page picker's persist.
 *
 * These keep a minimal surface (a single get/set with `lastError` swallowed)
 * rather than pulling the full `storage.ts` facade into the content script's
 * hot path; both wrappers resolve (never reject) so a torn-down extension
 * context is a no-op, not an unhandled rejection.
 */
import { KEYS, type SiteState } from "../lib/storage";

/** Promise-wraps the single per-site read; resolves `undefined` on any error. */
export const readSiteState = (origin: string): Promise<SiteState | undefined> =>
  new Promise((resolve) => {
    try {
      const key = KEYS.sitePrefix + origin;
      chrome.storage.local.get(key, (items) => {
        // Swallow lastError (e.g. extension context invalidated) → no-op.
        void chrome.runtime.lastError;
        resolve(items?.[key] as SiteState | undefined);
      });
    } catch {
      resolve(undefined);
    }
  });

/** Promise-wraps writing this origin's per-site state. */
export const writeSiteState = (
  origin: string,
  state: SiteState,
): Promise<void> =>
  new Promise((resolve) => {
    try {
      chrome.storage.local.set({ [KEYS.sitePrefix + origin]: state }, () => {
        void chrome.runtime.lastError;
        resolve();
      });
    } catch {
      resolve();
    }
  });
