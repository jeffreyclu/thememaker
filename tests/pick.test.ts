/**
 * In-page element picker — the PURE per-element RESOLVERS (`app/pick-resolve.ts`)
 * plus the live PICK SESSION now folded into the `usePickSession` hook.
 *
 * Resolvers (no DOM session):
 *  - `isPickable`: media/structural tags rejected, everything else accepted;
 *  - `propForElement`: buttons / html|body / own-background → "background";
 *    text-bearing leaves → "color"; plain containers → "background";
 *  - `pickKeyFor`: `<tag>|<prop>`;
 *  - `currentColorFor`: the element's computed color as `#rrggbb` (walks up for a
 *    transparent background; falls back to white / neutral text).
 *
 * Session (the hook): capture-phase click reports the key + re-arms (the panel
 * stays open), a hover overlay tracks the element, excluded host elements pass
 * through untouched, and unmount tears down the listeners + overlay.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { createElement, type ReactElement } from "react";

import {
  currentColorFor,
  isPickable,
  pickKeyFor,
  propForElement,
} from "../src/content/picker/app/pick-resolve";
import { OVERLAY_ID } from "../src/content/picker/app/usePickSession";
import { usePickSession } from "../src/content/picker/app/usePickSession";
import { PickerProvider } from "../src/content/picker/app/PickerProvider";
import { usePickerState } from "../src/content/picker/app/PickerProvider";
import { PANEL_HOST_ID } from "../src/content/picker/picker-session";
import type { Palette } from "../src/lib/palette";
import type { RoleOverrides } from "../src/types";

const applyWhenReady = vi.fn();
vi.mock("../src/lib/engine", () => ({
  engine: { applyWhenReady: (...a: unknown[]) => applyWhenReady(...a) },
}));
vi.mock("../src/content/picker/app/persist-overrides", () => ({
  persistOverrides: vi.fn(),
}));

const palette = { seed: "#123456", mode: "dark" } as unknown as Palette;

afterEach(() => {
  document.body.innerHTML = "";
  document.getElementById(OVERLAY_ID)?.remove();
});

const q = (id: string): HTMLElement => document.getElementById(id)!;

describe("isPickable (media/structural reject set)", () => {
  it("rejects media + void/structural tags, accepts real content tags", () => {
    document.body.innerHTML = `
      <img id="img" /><svg id="svg"></svg><canvas id="canvas"></canvas>
      <video id="video"></video><br id="br" /><script id="script"></script>
      <div id="div">x</div><p id="p">x</p><button id="btn">x</button>
      <section id="section"></section>
    `;
    for (const id of ["img", "svg", "canvas", "video", "br", "script"]) {
      expect(isPickable(q(id))).toBe(false);
    }
    for (const id of ["div", "p", "btn", "section"]) {
      expect(isPickable(q(id))).toBe(true);
    }
  });
});

describe("propForElement (which CSS property a pick recolors)", () => {
  it("buttons recolor their BACKGROUND", () => {
    document.body.innerHTML =
      '<button id="b">Save</button><input id="i" type="submit" />';
    expect(propForElement(q("b"))).toBe("background");
    expect(propForElement(q("i"))).toBe("background");
  });

  it("html/body recolor their BACKGROUND", () => {
    expect(propForElement(document.documentElement)).toBe("background");
    expect(propForElement(document.body)).toBe("background");
  });

  it("an element with its own background recolors its BACKGROUND", () => {
    document.body.innerHTML =
      '<div id="d" style="background-color: rgb(10,20,30)">x</div>';
    expect(propForElement(q("d"))).toBe("background");
  });

  it("a text-bearing leaf recolors its TEXT color", () => {
    document.body.innerHTML =
      '<p id="p">paragraph</p><h1 id="h">Title</h1><a id="a" href="#">link</a>';
    expect(propForElement(q("p"))).toBe("color");
    expect(propForElement(q("h"))).toBe("color");
    expect(propForElement(q("a"))).toBe("color");
  });

  it("a plain container (no direct text, no own bg) recolors its BACKGROUND", () => {
    document.body.innerHTML = '<div id="wrap"><span>nested</span></div>';
    expect(propForElement(q("wrap"))).toBe("background");
  });
});

describe("pickKeyFor (per-tag override key)", () => {
  it("composes `<tag>|<prop>` from the element", () => {
    document.body.innerHTML =
      '<h3 id="h">Sub</h3><button id="b">Go</button><div id="wrap"><i>x</i></div>';
    expect(pickKeyFor(q("h"))).toBe("h3|color");
    expect(pickKeyFor(q("b"))).toBe("button|background");
    expect(pickKeyFor(q("wrap"))).toBe("div|background");
  });
});

describe("currentColorFor (#rrggbb seed for the row)", () => {
  it("reads the computed color/background as a 6-digit hex", () => {
    document.body.innerHTML = `
      <p id="p" style="color: rgb(40,50,60)">x</p>
      <div id="d" style="background-color: rgb(1,2,3)">x</div>`;
    expect(currentColorFor(q("p"), "color")).toBe("#28323c");
    expect(currentColorFor(q("d"), "background")).toBe("#010203");
  });

  it("never seeds a transparent background as black; walks up to the visible bg", () => {
    document.body.innerHTML =
      '<div id="wrap" style="background-color: rgb(20,30,40)"><p id="p">x</p></div>';
    expect(currentColorFor(q("p"), "background")).toBe("#141e28");
  });

  it("falls back to white when nothing up the tree has an opaque background", () => {
    document.body.innerHTML = '<p id="p">x</p>';
    expect(currentColorFor(q("p"), "background")).toBe("#ffffff");
  });
});

/** Mounts `usePickSession` in a provider; `latest` captures the live overrides. */
let latest: RoleOverrides = {};
const Probe = (): null => {
  usePickSession();
  latest = usePickerState().overrides;
  return null;
};
const mountSession = (
  onClose: () => void = () => {},
): { unmount: () => void } =>
  render(
    createElement(
      PickerProvider,
      { palette, intensity: 60, overrides: {}, onClose },
      createElement(Probe),
    ) as ReactElement,
  );

/** Dispatch a capture-phase click on `el` (inside act) and return the event. */
const clickEl = (el: Element): MouseEvent => {
  const evt = new MouseEvent("click", { bubbles: true, cancelable: true });
  act(() => {
    el.dispatchEvent(evt);
  });
  return evt;
};

describe("usePickSession (re-arming pick session)", () => {
  beforeEach(() => {
    applyWhenReady.mockClear();
    latest = {};
  });

  it("reports `<tag>|<prop>` + color on a capture-phase click and RE-ARMS", () => {
    mountSession();
    document.body.innerHTML +=
      '<h1 id="h" style="color: rgb(0,0,0)">Title</h1>';
    const evt = clickEl(q("h"));
    // The page's default action is prevented (capture phase) and the per-tag key
    // is recorded with the element's current color.
    expect(evt.defaultPrevented).toBe(true);
    expect(latest).toStrictEqual({ "h1|color": "#000000" });
    expect(applyWhenReady).toHaveBeenLastCalledWith(palette, {
      intensity: 60,
      overrides: { "h1|color": "#000000" },
    });
    // RE-ARMS: a second pick on another element keeps recording.
    document.body.innerHTML += '<button id="b">Go</button>';
    clickEl(q("b"));
    expect(latest).toHaveProperty("button|background");
  });

  it("does NOT register a pick for a non-pickable element (still swallows click)", () => {
    mountSession();
    document.body.innerHTML += '<img id="img" />';
    const evt = clickEl(q("img"));
    expect(evt.defaultPrevented).toBe(true);
    expect(latest).toStrictEqual({});
    expect(applyWhenReady).not.toHaveBeenCalled();
  });

  it("excluded host elements pass through untouched", () => {
    mountSession();
    document.body.innerHTML += `<div id="${PANEL_HOST_ID}"><button id="b">x</button></div>`;
    const evt = clickEl(q("b"));
    // Not swallowed, not recorded — the panel's own controls work normally.
    expect(evt.defaultPrevented).toBe(false);
    expect(latest).toStrictEqual({});
  });

  it("shows a hover overlay tracking the hovered element", () => {
    mountSession();
    document.body.innerHTML += "<p id='p'>Body</p>";
    act(() =>
      q("p").dispatchEvent(new MouseEvent("mousemove", { bubbles: true })),
    );
    const overlay = document.getElementById(OVERLAY_ID);
    expect(overlay).toBeTruthy();
    expect(overlay?.style.pointerEvents).toBe("none");
  });

  it("unmount tears down the listeners + overlay", () => {
    const { unmount } = mountSession();
    document.body.innerHTML += "<p id='p'>Body</p>";
    act(() =>
      q("p").dispatchEvent(new MouseEvent("mousemove", { bubbles: true })),
    );
    expect(document.getElementById(OVERLAY_ID)).toBeTruthy();
    unmount();
    expect(document.getElementById(OVERLAY_ID)).toBeNull();
    // A later click no longer records a pick.
    applyWhenReady.mockClear();
    clickEl(q("p"));
    expect(applyWhenReady).not.toHaveBeenCalled();
  });
});
