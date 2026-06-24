/**
 * Always-on content script — per-site AUTO-REAPPLY.
 *
 * Registered for `<all_urls>` at `run_at: document_start` (see
 * `src/manifest.config.ts`). On EVERY page load it reads the saved per-site
 * state for this origin from `chrome.storage.local` and, when the site is
 * enabled with a faithful saved scheme, reapplies the theme — so a reload or a
 * revisit restores the look the user picked, without reopening the popup.
 *
 * This is a BUNDLED module (imports resolve normally), NOT a serialized
 * `executeScript` function — so it imports the EXISTING engine
 * (`applyAdaptiveScheme`) and the pure load decision (`loadDecision`) instead of
 * duplicating any logic. It runs in the content-script ISOLATED WORLD, the same
 * world `chrome.scripting.executeScript` injects into, so the engine's
 * `window.__themeMaker*` state and the single `<style id="themeMaker">` are
 * shared with the popup's on-demand path: the two paths never double-apply
 * (both write the same style in place) and never conflict.
 *
 * ## Flash elimination
 *
 * `chrome.storage` is async, so at `document_start` we can't know the theme
 * before the browser paints the site's original background — that's the reload
 * flash. We eliminate it with a SYNCHRONOUS, same-origin cache in the page's own
 * `localStorage`: every engine apply caches the EXACT base background it painted
 * (`__thememaker_base__`). At the VERY TOP of `document_start`, BEFORE any async
 * read, we synchronously `readBaseCache()` and, if present, paint that exact hex
 * onto `<html>` — so the first frame is already the themed base (no flash, and
 * since it's the engine's exact base, no early→final second flash either). Then
 * we proceed with the async `loadDecision` + full apply (which rewrites the
 * cache).
 *
 * Residual flash: only the VERY FIRST themed load of an origin (no cache yet)
 * falls back to the palette-derived base; every subsequent reload is flash-free.
 * A reset/disable clears the cache so a disabled site never early-paints stale.
 */
import {
  STYLE_ELEMENT_ID,
  applyAdaptiveScheme,
  baseBackgroundFor,
  readBaseCache,
} from "../lib/inject";
import { loadDecision } from "../lib/site-state";
import { KEYS, type SiteState } from "../lib/storage";
import { startPick, type PickSession } from "./pick";
import {
  mountPickerPanel,
  PANEL_HOST_ID,
  type PanelHandle,
} from "./picker-panel";
import {
  withoutRole,
  withPickedRole,
  withRoleColor,
} from "./picker-panel-model";
import type { ContentMessage } from "../lib/messages";
import type { Palette } from "../lib/palette";
import type { ApplyOptions, RoleOverrides, Scheme } from "../types";

/** Promise-wraps the single per-site read; resolves `undefined` on any error. */
const readSiteState = (origin: string): Promise<SiteState | undefined> =>
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

/**
 * Paints a base background `hex` onto `<html>` immediately, before the body
 * exists, to remove the reload flash. Uses its own marker `<style>` so it never
 * collides with the engine's `<style id="themeMaker">`; the full engine later
 * overwrites the html/body rule with the precise (body-aware) base.
 */
const EARLY_STYLE_ID = "themeMakerEarly";
const paintEarlyBaseColor = (hex: string): void => {
  const head = document.head || document.documentElement;
  if (!head) {
    return;
  }
  let style = document.getElementById(
    EARLY_STYLE_ID,
  ) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = EARLY_STYLE_ID;
    head.appendChild(style);
  }
  style.textContent = `html { background-color: ${hex} !important; }`;
};

/** Removes the early-base marker style once the full engine has painted. */
const clearEarlyBase = (): void => {
  document.getElementById(EARLY_STYLE_ID)?.remove();
};

/** Runs the full adaptive engine once a body is available. */
const applyWhenReady = (palette: Palette, options: ApplyOptions): void => {
  const run = (): void => {
    applyAdaptiveScheme(palette, options);
    // The engine writes its own html/body base rule into `#themeMaker`; drop the
    // early stand-in so there's a single source of truth for the page base.
    clearEarlyBase();
  };
  if (document.body) {
    run();
  } else {
    document.addEventListener("DOMContentLoaded", run, { once: true });
  }
};

/** The content-script entry point. Exported for unit testing. */
export const runContentScript = async (): Promise<void> => {
  // Only http(s) pages carry a real origin worth theming; chrome://, about:,
  // and data: URLs have opaque/absent origins and aren't injectable anyway.
  const origin = location.origin;
  if (!origin || origin === "null") {
    return;
  }

  // 1) SYNCHRONOUS, BEFORE any async read: paint the cached EXACT base from the
  // page's own localStorage so the very first frame is already the themed base
  // (no flash). `cached` is null on the first themed load (no cache yet).
  const cached = readBaseCache();
  if (cached) {
    paintEarlyBaseColor(cached);
  }

  // 2) Now the async per-site read decides whether to actually theme.
  const site = await readSiteState(origin);
  const decision = loadDecision(site);
  if (!decision.apply) {
    // Site no longer themed (e.g. cache stale vs. storage) — undo any early
    // paint so we don't tint a page we're not theming.
    clearEarlyBase();
    return;
  }

  // 3) First themed load with no cache: fall back to the palette-derived base so
  // there's still a base paint this load (the engine then caches the exact one).
  if (!cached) {
    paintEarlyBaseColor(baseBackgroundFor(decision.palette, decision.options));
  }

  // 4) Run the full engine when the DOM is ready (it rewrites the cache).
  applyWhenReady(decision.palette, decision.options);
};

// ---- in-page floating picker control ------------------------------------
//
// The popup sends SHOW_PICKER (carrying the live theme) then closes. We mount a
// Shadow DOM panel and a RE-ARMING pick session: clicking page elements adds
// override rows; editing a row's color (or clearing it) applies live + persists.
// Storage is the source of truth — overrides live on the per-site savedScheme,
// so a reload restores them via `loadDecision`. Esc / Done close the panel.

/** The single live floating-control session for this tab. */
interface PickerSession {
  panel: PanelHandle;
  pick: PickSession;
  palette: Palette;
  /** The live theme intensity (panel re-applies + persists at this value). */
  intensity: number;
  /** The live override map the panel renders + applies + persists. */
  overrides: RoleOverrides;
}
let picker: PickerSession | null = null;

/** Promise-wraps writing this origin's per-site state. */
const writeSiteState = (origin: string, state: SiteState): Promise<void> =>
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

/** The current options (intensity + overrides) for a re-apply. */
const optionsFor = (s: PickerSession): ApplyOptions =>
  Object.keys(s.overrides).length > 0
    ? { intensity: s.intensity, overrides: s.overrides }
    : { intensity: s.intensity };

/**
 * Applies the session's overrides LIVE (in-page engine, no executeScript) AND
 * persists them into this origin's saved scheme, ENABLING auto-reapply so a
 * reload restores them. Storage is the single source of truth the popup reads.
 */
const applyAndPersist = async (s: PickerSession): Promise<void> => {
  applyWhenReady(s.palette, optionsFor(s));
  const origin = location.origin;
  const site = (await readSiteState(origin)) ?? { enabled: false };
  const prevDetails = site.savedScheme?.schemeDetails;
  const hasOverrides = Object.keys(s.overrides).length > 0;
  // Build/refresh the saved scheme: carry the live palette + intensity +
  // overrides so `loadDecision` reapplies the exact custom theme next load.
  const savedScheme: Scheme = {
    ...(site.savedScheme ?? {
      colors: {},
      schemeDetails: {} as Scheme["schemeDetails"],
    }),
    schemeDetails: {
      ...(prevDetails ?? {
        rootColor: s.palette.seed,
        colorMode: s.palette.mode,
      }),
      palette: s.palette,
      intensity: s.intensity,
      ...(hasOverrides ? { overrides: s.overrides } : { overrides: undefined }),
    },
  };
  await writeSiteState(origin, { ...site, enabled: true, savedScheme });
};

/** Re-renders the panel rows from the current overrides (if the panel is open). */
const renderPicker = (): void => {
  picker?.panel.render(picker.overrides);
};

/** Esc closes the floating control (delegates to the panel's Done). */
const onPickerKey = (e: KeyboardEvent): void => {
  if (e.key === "Escape" && picker) {
    e.preventDefault();
    e.stopPropagation();
    hidePicker();
  }
};

/**
 * Shows the in-page floating control, mounting the Shadow DOM panel + a
 * re-arming pick session. Replaces any existing session. Seeds from the popup's
 * current theme (palette + intensity + overrides) so edits start from the live
 * look and persist back onto the per-site saved scheme.
 */
export const showPicker = (palette: Palette, options: ApplyOptions): void => {
  hidePicker();

  const session: PickerSession = {
    palette,
    intensity: options.intensity,
    overrides: { ...(options.overrides ?? {}) },
    panel: undefined as unknown as PanelHandle,
    pick: undefined as unknown as PickSession,
  };

  session.panel = mountPickerPanel({
    onColorChange: (role, color) => {
      // Do NOT re-render here: rebuilding the rows would replace the
      // <input type="color"> the user is actively dragging, which closes the
      // native color dialog. The input already shows its own value — just
      // update the override and apply live.
      session.overrides = withRoleColor(session.overrides, role, color);
      void applyAndPersist(session);
    },
    onClearRole: (role) => {
      session.overrides = withoutRole(session.overrides, role);
      renderPicker();
      void applyAndPersist(session);
    },
    onClearAll: () => {
      session.overrides = {};
      renderPicker();
      void applyAndPersist(session);
    },
    onDone: () => hidePicker(),
  });

  session.pick = startPick({
    onPicked: (key, currentColor) => {
      session.overrides = withPickedRole(session.overrides, key, currentColor);
      renderPicker();
      void applyAndPersist(session);
    },
    // The panel host (and everything inside its shadow root) is excluded so the
    // control never highlights or recolors itself.
    isExcluded: (el) => el.closest(`#${PANEL_HOST_ID}`) !== null,
  });

  picker = session;
  session.panel.render(session.overrides);
  document.addEventListener("keydown", onPickerKey, true);
};

/** Hides the floating control + ends pick mode (idempotent). */
export const hidePicker = (): void => {
  if (!picker) {
    return;
  }
  document.removeEventListener("keydown", onPickerKey, true);
  picker.pick.stop();
  picker.panel.destroy();
  picker = null;
};

/**
 * Re-applies the theme in place (popup → content, e.g. after "Clear all" in the
 * popup) and, if the floating control is open, keeps its rows in sync.
 */
const applyLive = (palette: Palette, options: ApplyOptions): void => {
  applyWhenReady(palette, options);
  if (picker) {
    picker.palette = palette;
    picker.intensity = options.intensity;
    picker.overrides = { ...(options.overrides ?? {}) };
    renderPicker();
  }
};

/** Handles a popup → content-script {@link ContentMessage}. Exported for tests. */
export const handleContentMessage = (message: ContentMessage): void => {
  if (message.type === "SHOW_PICKER") {
    showPicker(message.palette, message.options);
  } else if (message.type === "HIDE_PICKER") {
    hidePicker();
  } else if (message.type === "APPLY_LIVE") {
    applyLive(message.palette, message.options);
  }
};

// Side-effect entry: kick off on load. Guarded so importing this module in unit
// tests (which set `__THEMEMAKER_TEST__`) doesn't auto-run against jsdom.
declare global {
  interface Window {
    __THEMEMAKER_TEST__?: boolean;
  }
}
if (typeof window === "undefined" || !(window as Window).__THEMEMAKER_TEST__) {
  void runContentScript();
  // Listen for the popup's pick-mode messages (direct tab → content script).
  try {
    chrome.runtime.onMessage.addListener((message: ContentMessage) => {
      handleContentMessage(message);
      // No async response; return undefined (channel closes immediately).
    });
  } catch {
    // chrome.runtime unavailable (non-extension context) — ignore.
  }
}

export { EARLY_STYLE_ID, paintEarlyBaseColor, clearEarlyBase, applyWhenReady };
export { STYLE_ELEMENT_ID };
