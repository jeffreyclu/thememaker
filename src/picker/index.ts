/**
 * In-page floating picker control — the eager shim around the React app.
 *
 * The popup sends SHOW_PICKER (carrying the live theme) then closes; this lazily
 * mounts a React app into a Shadow DOM host. The session state (overrides /
 * palette / intensity) and the logic (element-pick arming, apply + persist,
 * Esc-to-close) live inside that app (`./main` + the React tree). This file only:
 *   - shows the picker  → lazy `import()` + mount the app with the initial theme;
 *   - hides the picker  → unmount the app;
 *   - applies live      → re-apply via the engine and re-render the open app with
 *                         the new theme (the popup's "Clear all" etc. re-seeds it).
 *
 * The app statically imports React + react-dom. This file runs in the always-on
 * content script (every page), so it `await import`s the app only when the picker
 * is shown, letting Vite code-split React out of the content entry chunk.
 * `PANEL_HOST_ID` is defined here (not in the lazy chunk) so the pick session can
 * exclude the host synchronously, without loading React.
 */
import type { PickerAppHandle } from "./main";
import { engine } from "../lib/engine";
import type { Palette } from "../lib/palette";
import type { ApplyOptions } from "../types";

/** The id on the Shadow DOM host element — the engine + picker exclude this. */
export const PANEL_HOST_ID = "themeMakerPickerHost";

/**
 * The single live app for this tab, plus a generation token so a lazy mount that
 * resolves AFTER a teardown/replacement is discarded. `app` is null while its
 * lazy chunk is still loading (or when no picker is open).
 */
let app: PickerAppHandle | null = null;
let generation = 0;

/** The props the app re-renders from (theme + the host close intent). */
const propsFor = (palette: Palette, options: ApplyOptions) => ({
  palette,
  intensity: options.intensity,
  overrides: { ...(options.overrides ?? {}) },
  onClose: hidePicker,
});

/**
 * Shows the in-page floating control: lazily loads the React app chunk and mounts
 * it with the popup's current theme (palette + intensity + overrides). Replaces
 * any existing session. The app arms element-pick + Esc itself on mount.
 */
export const showPicker = (palette: Palette, options: ApplyOptions): void => {
  hidePicker();
  const mine = ++generation;
  const props = propsFor(palette, options);

  // Lazily load the app chunk (React + the picker tree). When it resolves, mount
  // it unless this session was already torn down or replaced meanwhile.
  void import("./main").then(({ mountPickerApp }) => {
    if (generation !== mine) {
      return;
    }
    app = mountPickerApp(props);
  });
};

/** Hides the floating control (idempotent). Unmounts the app (ending pick mode). */
export const hidePicker = (): void => {
  generation++;
  app?.destroy();
  app = null;
};

/**
 * Re-applies the theme in place (popup → content, e.g. after "Clear all" in the
 * popup) and, if the floating control is open, re-renders it with the new theme
 * so its rows stay in sync (the app re-seeds its state from the new props).
 */
export const applyLive = (palette: Palette, options: ApplyOptions): void => {
  engine.applyWhenReady(palette, options);
  app?.update(propsFor(palette, options));
};
