/**
 * The single, long-lived {@link Engine} instance for this tab's content script.
 *
 * The Engine is PURE page logic (no `chrome.*`); the content script owns the ONE
 * instance and its state persists across every `apply()` — exactly as the old
 * `window.__themeMaker*` globals did. The auto-reapply flow, the popup's APPLY /
 * RESET / QUERY handlers, and the in-page picker all drive THIS instance, so
 * re-applies + slider drags reuse the frozen originals (idempotent) and there is
 * one observer / one work queue for the page.
 */
import { Engine } from "../lib/engine/engine";

/** This tab's single adaptive theming engine. */
export const engine = new Engine();
