/**
 * Picker React entry: mounts the app into a Shadow DOM host and returns an
 * imperative handle the shim drives (`host` / `update` / `destroy`). The host
 * carries {@link PANEL_HOST_ID} and lives on `document.documentElement` (outside
 * `<body>`), so the engine's body-walk never reaches it and the page's CSS can't
 * cascade in.
 *
 * This is the lazy-loaded entry: it statically imports React + `react-dom/client`,
 * so the content script's `await import("./main")` (only when the picker is shown)
 * makes Vite code-split React into a separate chunk kept out of the always-on
 * content entry bundle.
 *
 * The app owns the session state (overrides/palette/intensity) and logic (hooks);
 * `update` re-renders with new props so the popup's APPLY_LIVE re-seeds the open
 * panel, and `destroy` unmounts (Done / Esc / HIDE_PICKER).
 */
import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";

import { App } from "./App";
import { PANEL_STYLES } from "./components/panel-styles";
// `PANEL_HOST_ID` lives in `session` (the eager chunk) so the pick session can
// exclude the host without loading React; we import just that constant here.
import { PANEL_HOST_ID } from "./session";
import type { Palette } from "../lib/palette";
import type { RoleOverrides } from "../types";

/** The live theme + close intent the shim feeds the app. */
export interface PickerAppProps {
  palette: Palette;
  intensity: number;
  overrides: RoleOverrides;
  /** Hides the picker (the shim's `hidePicker`) — Done / Esc delegate here. */
  onClose: () => void;
}

/** A mounted app handle: re-render with new props, or tear it all down. */
export interface PickerAppHandle {
  /** The host element (so the shim can track/teardown the single instance). */
  readonly host: HTMLElement;
  /** Re-render the app with new props (the APPLY_LIVE re-seed path). */
  update(props: PickerAppProps): void;
  /** Remove the app + its host from the page. */
  destroy(): void;
}

/** Mounts the floating app into a fresh Shadow DOM host. */
export const mountPickerApp = (props: PickerAppProps): PickerAppHandle => {
  const host = document.createElement("div");
  host.id = PANEL_HOST_ID;
  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = PANEL_STYLES;
  shadow.append(style);

  // React renders into this container inside the shadow root; the isolated
  // `<style>` is a sibling so the page can't see the rules.
  const reactRoot = document.createElement("div");
  shadow.append(reactRoot);

  // Mount on the documentElement, outside <body>, so the engine's body-walk
  // never reaches the host and the page theme can't cascade in.
  document.documentElement.appendChild(host);

  const render = (p: PickerAppProps): void =>
    root.render(
      <StrictMode>
        <App
          palette={p.palette}
          intensity={p.intensity}
          overrides={p.overrides}
          onClose={p.onClose}
        />
      </StrictMode>,
    );

  const root: Root = createRoot(reactRoot);
  render(props);

  return {
    host,
    update: render,
    destroy: () => {
      root.unmount();
      host.remove();
    },
  };
};
