/**
 * Popup controller / composition root.
 *
 * Wires the pure reducer (`state.ts`), the view (`view.ts`), storage, the engine
 * bridge, and message passing to the active tab's CONTENT SCRIPT. This is the
 * ONLY popup module that touches `chrome.*`; the controller + handlers run over
 * an injected, chrome-free {@link PopupContext}.
 *
 * Flow on each user action:
 *   user gesture → engine computes scheme/options → sendToContentWithReply(
 *   activeTab, APPLY_SCHEME) → the content script runs the engine in the page +
 *   replies → persist history/site-state → reducer → render.
 *
 * Apply / reset / query go DIRECTLY to the content script (no background hub, no
 * `chrome.scripting.executeScript`): the always-on content script already owns
 * page-side effects, so the engine can be ordinary bundled code.
 */
import "./popup.css";

import {
  hydratePartial,
  initialPopupState,
  popupReducer,
  type PopupAction,
  type PopupState,
} from "./state";
import { bindEvents, populateModes, queryRefs, render } from "./view";
import { makeController } from "./controller";
import { makeHandlers } from "./handlers";
import type { PopupContext } from "./context";
import { sendToContent, sendToContentWithReply } from "../lib/messages";
import {
  createChromeStorage,
  originFromUrl,
  DEFAULT_SITE_STATE,
} from "../lib/storage";

const storage = createChromeStorage();
const refs = queryRefs(document);
populateModes(refs.mode);

let state: PopupState = initialPopupState;

const dispatch = (action: PopupAction): void => {
  state = popupReducer(state, action);
  render(state, refs);
};

/** The active tab's id, cached so apply/reset/pick messages can target it. */
let activeTabId: number | null = null;

/** Resolves the active tab's origin (and caches its id) for per-site work. */
const activeOrigin = async (): Promise<string | null> => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTabId = tab?.id ?? null;
  return originFromUrl(tab?.url);
};

// The chrome-free context the controller + handlers run over. `send`/`sendNoReply`
// target the active tab's content script; a null tab id degrades gracefully.
const ctx: PopupContext = {
  getState: () => state,
  dispatch,
  storage,
  send: (message) =>
    activeTabId == null
      ? Promise.resolve({ ok: false, applied: false } as never)
      : sendToContentWithReply(activeTabId, message),
  sendNoReply: (message) =>
    activeTabId == null
      ? Promise.resolve()
      : sendToContent(activeTabId, message),
  activeTabId: () => activeTabId,
};

const controller = makeController(ctx);
const handlers = makeHandlers(ctx, controller);

/** Hydrates initial popup state from storage + the active tab. */
const hydrate = async (): Promise<void> => {
  const [settings, history, favorites, origin] = await Promise.all([
    storage.getSettings(),
    storage.getHistory(),
    storage.getFavorites(),
    activeOrigin(),
  ]);
  const site = origin ? await storage.getSiteState(origin) : DEFAULT_SITE_STATE;

  // Ask the content script whether a Thememaker style is already on the tab.
  // A non-injectable tab (chrome://, etc.) degrades to applied=false.
  let applied = false;
  if (activeTabId != null) {
    const resp = await ctx.send({ type: "QUERY_STATE" });
    applied = Boolean(resp.applied);
  }

  // Restore this origin's persisted theme (palette + saved intensity) as the
  // popup's `current` scheme so the intensity slider / details / re-apply have
  // something to act on after a reload or popup reopen on a persisted site.
  const partial = hydratePartial({
    settings,
    history,
    favorites,
    origin,
    site,
    applied,
  });

  // Storage is the single source of truth for overrides: the in-page floating
  // control writes them onto this origin's saved scheme, which `hydratePartial`
  // already restored into `partial.overrides`. So a pick made on the page is
  // reflected here simply by reading storage on open — no handoff needed.
  dispatch({ type: "hydrate", partial });
};

bindEvents(refs, handlers);
void hydrate();
