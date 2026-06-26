/**
 * Picker app CONNECTED-component + mount-handle tests (React Testing Library).
 *
 * The migrated picker is a fully-React tree mounted into a Shadow DOM host: the
 * session state (overrides/palette/intensity) lives in `PickerProvider`, and all
 * logic lives in hooks (`usePickSession`/`useApplyOverrides`/`usePickerKeys`).
 * These cover the riskiest behavior the vanilla session guaranteed:
 *  - rows render from the provider's overrides (and the empty state);
 *  - editing a row's color applies LIVE (engine + persist) with the EXACT theme,
 *    and the input is UNCONTROLLED so it does not remount mid-drag;
 *  - clear / clear all apply with the right override map; Done closes;
 *  - the popup's APPLY_LIVE re-seed (`update` on the mount handle) repaints rows;
 *  - the mount handle builds a shadow host outside <body> and `destroy` unmounts.
 *
 * The engine + persist are mocked so we assert the apply/persist CONTRACT (args)
 * without real DOM theming or storage. The pick session (folded into
 * `usePickSession`) installs REAL capture-phase listeners; the per-element
 * resolvers are covered separately in `pick.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import { PickerProvider } from "../src/picker/state/PickerProvider";
import { Panel } from "../src/picker/components/Panel";
import { mountPickerApp } from "../src/picker/main";
import { PANEL_HOST_ID } from "../src/picker";
import type { Palette } from "../src/lib/palette";
import type { RoleOverrides } from "../src/types";

const applyWhenReady = vi.fn();
const persistOverrides = vi.fn();

vi.mock("../src/lib/engine", () => ({
  engine: {
    applyWhenReady: (...args: unknown[]) => applyWhenReady(...args),
  },
}));
vi.mock("../src/lib/scheme/persist-overrides", () => ({
  persistOverrides: (...args: unknown[]) => persistOverrides(...args),
}));

const palette = { seed: "#123456", mode: "dark" } as unknown as Palette;

/** A page element to pick: a click resolves to its `<tag>|<prop>` key. */
const addPageEl = (html: string): HTMLElement => {
  const wrap = document.createElement("div");
  wrap.innerHTML = html;
  const el = wrap.firstElementChild as HTMLElement;
  document.body.appendChild(el);
  return el;
};

const clickEl = (el: Element): void =>
  el.dispatchEvent(
    new MouseEvent("click", { bubbles: true, cancelable: true }),
  );

// Render the panel INSIDE a host carrying PANEL_HOST_ID, exactly like
// production: the pick session's capture-phase listeners exclude the host, so
// the panel's own buttons/inputs work (they aren't treated as page picks).
const renderApp = (
  overrides: RoleOverrides,
  onClose: () => void = () => {},
  intensity = 60,
) => {
  const host = document.createElement("div");
  host.id = PANEL_HOST_ID;
  document.body.appendChild(host);
  return render(
    <PickerProvider
      palette={palette}
      intensity={intensity}
      overrides={overrides}
      onClose={onClose}
    >
      <Panel />
    </PickerProvider>,
    { container: host },
  );
};

beforeEach(() => {
  applyWhenReady.mockClear();
  persistOverrides.mockClear();
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("Panel (connected, fully-React)", () => {
  it("renders the empty state with no overrides (Clear all disabled)", () => {
    renderApp({});
    expect(
      screen.getByText("No custom colors yet. Click an element."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear all" })).toBeDisabled();
  });

  it("renders one row per override (Clear all enabled)", () => {
    renderApp({ "div|background": "#112233", "h3|color": "#445566" });
    expect(screen.getByText("div · background")).toBeInTheDocument();
    expect(screen.getByText("h3 · text")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear all" })).toBeEnabled();
  });

  it("a color change applies live + persists with the exact theme", () => {
    renderApp({ "div|background": "#112233" });
    const input = screen.getByLabelText("div · background color");
    fireEvent.input(input, { target: { value: "#ff0000" } });
    const next = { "div|background": "#ff0000" };
    expect(applyWhenReady).toHaveBeenCalledWith(palette, {
      intensity: 60,
      overrides: next,
    });
    expect(persistOverrides).toHaveBeenCalledWith({
      palette,
      intensity: 60,
      overrides: next,
    });
    // Uncontrolled: the input keeps its dragged value, not remounted to the seed.
    expect((input as HTMLInputElement).value).toBe("#ff0000");
  });

  it("clear-role removes the override and applies the smaller map", () => {
    renderApp({ "div|background": "#112233", "h3|color": "#445566" });
    fireEvent.click(
      screen.getByRole("button", { name: "Clear div · background override" }),
    );
    expect(screen.queryByText("div · background")).not.toBeInTheDocument();
    expect(applyWhenReady).toHaveBeenLastCalledWith(palette, {
      intensity: 60,
      overrides: { "h3|color": "#445566" },
    });
  });

  it("clear-all empties the rows and applies intensity only", () => {
    renderApp({ "div|background": "#112233" });
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(
      screen.getByText("No custom colors yet. Click an element."),
    ).toBeInTheDocument();
    // Empty overrides → the key is ABSENT (intensity-only options).
    expect(applyWhenReady).toHaveBeenLastCalledWith(palette, { intensity: 60 });
  });

  it("Done delegates to the host onClose", () => {
    const onClose = vi.fn();
    renderApp({}, onClose);
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("a page click adds a row and applies live (the re-arming session path)", () => {
    renderApp({});
    const p = addPageEl('<p style="color: rgb(0,0,0)">text</p>');
    act(() => clickEl(p));
    expect(screen.getByText("p · text")).toBeInTheDocument();
    expect(applyWhenReady).toHaveBeenLastCalledWith(palette, {
      intensity: 60,
      overrides: { "p|color": "#000000" },
    });
  });

  it("Esc delegates to the host onClose", () => {
    const onClose = vi.fn();
    renderApp({}, onClose);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("unmount stops the pick session: a later click no longer applies", () => {
    const { unmount } = renderApp({});
    const p = addPageEl('<p style="color: rgb(0,0,0)">text</p>');
    unmount();
    applyWhenReady.mockClear();
    clickEl(p);
    expect(applyWhenReady).not.toHaveBeenCalled();
  });
});

describe("mountPickerApp (Shadow DOM handle)", () => {
  it("mounts a shadow host outside <body>, re-seeds via update, and destroys", async () => {
    let handle!: ReturnType<typeof mountPickerApp>;
    await act(async () => {
      handle = mountPickerApp({
        palette,
        intensity: 50,
        overrides: {},
        onClose() {},
      });
      // Let the concurrent root flush its initial commit inside act().
      await Promise.resolve();
    });

    expect(handle.host.id).toBe(PANEL_HOST_ID);
    expect(handle.host.parentElement).toBe(document.documentElement);
    const shadow = handle.host.shadowRoot!;
    expect(shadow).toBeTruthy();

    await waitFor(() =>
      expect(shadow.textContent).toContain("No custom colors yet"),
    );
    // The popup's APPLY_LIVE re-seed path: new props repaint the rows.
    act(() =>
      handle.update({
        palette,
        intensity: 50,
        overrides: { "p|color": "#010203" },
        onClose() {},
      }),
    );
    await waitFor(() => expect(shadow.textContent).toContain("p · text"));

    act(() => handle.destroy());
    expect(document.getElementById(PANEL_HOST_ID)).toBeNull();
  });
});
