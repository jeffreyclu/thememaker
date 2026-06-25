/**
 * Mounts the React picker app into a Shadow DOM host and returns an imperative
 * handle the vanilla shim drives (`host` / `update` / `destroy`). The host
 * carries {@link PANEL_HOST_ID} and lives on `document.documentElement` (OUTSIDE
 * `<body>`), so the engine's body-walk never reaches it and the page's CSS can't
 * cascade in — same as the vanilla panel.
 *
 * THIS is the lazy-loaded entry: it statically imports React + `react-dom/client`,
 * so the content script's `await import("./app/mount")` (only when the picker is
 * shown) makes Vite code-split React into a separate chunk that is NEVER in the
 * always-on content entry bundle.
 *
 * The app owns ALL session state (overrides/palette/intensity) + logic (hooks);
 * `update` re-renders with new props so the popup's APPLY_LIVE re-seeds the open
 * panel, and `destroy` unmounts (Done / Esc / HIDE_PICKER).
 */
import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";

import { Panel } from "./Panel";
import { PickerProvider } from "./PickerProvider";
import { PANEL_STYLES } from "./panel-styles";
// `PANEL_HOST_ID` lives in `picker-session` (the eager chunk) so the pick session
// can exclude the host without loading React; we import just that constant here.
import { PANEL_HOST_ID } from "../picker-session";
import type { Palette } from "../../../lib/palette";
import type { RoleOverrides } from "../../../types";

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

  // Mount on the documentElement, OUTSIDE <body>, so the engine's body-walk
  // never reaches the host and the page theme can't cascade in.
  document.documentElement.appendChild(host);

  const render = (p: PickerAppProps): void =>
    root.render(
      <StrictMode>
        <PickerProvider
          palette={p.palette}
          intensity={p.intensity}
          overrides={p.overrides}
          onClose={p.onClose}
        >
          <Panel />
        </PickerProvider>
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
