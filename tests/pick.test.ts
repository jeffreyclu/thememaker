/**
 * In-page element picker (`src/content/pick.ts`) — the PER-TAG model.
 *
 * Customize is now tag-based: a pick reports a `"<tag>|<prop>"` override key plus
 * the element's current color, and the session RE-ARMS (it does not exit on
 * click — the panel owns teardown via `stop()`). There is no cancellation
 * callback. This covers:
 *  - `isPickable`: media/structural tags are rejected, everything else accepted;
 *  - `propForElement`: buttons / html|body / own-background → "background";
 *    text-bearing leaves → "color"; plain containers → "background";
 *  - `pickKeyFor`: `<tag>|<prop>`;
 *  - `currentColorFor`: the element's computed color as `#rrggbb`;
 *  - `startPick`: capture-phase click reports the key (re-arming), hover overlay,
 *    and idempotent `stop()` teardown.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  currentColorFor,
  isPickable,
  pickKeyFor,
  propForElement,
  startPick,
  OVERLAY_ID,
} from "../src/content/pick";

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

  it("reads a transparent default background as its rgb channels", () => {
    document.body.innerHTML = '<p id="p">x</p>';
    // jsdom reports an unstyled background as `rgba(0, 0, 0, 0)`; the picker
    // parses the rgb channels (alpha is ignored) → black. The neutral-gray
    // FALLBACK is a defensive guard for when getComputedStyle is unavailable
    // (covered at the model level).
    expect(currentColorFor(q("p"), "background")).toBe("#000000");
  });
});

describe("startPick (re-arming pick session)", () => {
  it("reports `<tag>|<prop>` + current color on a capture-phase click and RE-ARMS", () => {
    document.body.innerHTML = '<h1 id="h" style="color: rgb(0,0,0)">Title</h1>';
    const onPicked = vi.fn();
    const session = startPick({ onPicked });
    expect(session.active).toBe(true);

    const evt = new MouseEvent("click", { bubbles: true, cancelable: true });
    q("h").dispatchEvent(evt);

    // The page's default action is prevented (capture phase) and the per-tag key
    // is reported with the element's current color.
    expect(evt.defaultPrevented).toBe(true);
    expect(onPicked).toHaveBeenCalledWith("h1|color", "#000000");
    // RE-ARMS: the session stays live so several elements can be picked in a row.
    expect(session.active).toBe(true);

    // A second pick on another element keeps reporting.
    document.body.innerHTML += '<button id="b">Go</button>';
    q("b").dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );
    expect(onPicked).toHaveBeenCalledWith(
      "button|background",
      expect.any(String),
    );
    session.stop();
  });

  it("does NOT register a pick for a non-pickable element (but still swallows the click)", () => {
    document.body.innerHTML = '<img id="img" />';
    const onPicked = vi.fn();
    const session = startPick({ onPicked });
    const evt = new MouseEvent("click", { bubbles: true, cancelable: true });
    q("img").dispatchEvent(evt);
    // Click is swallowed (pick mode), but nothing is reported.
    expect(evt.defaultPrevented).toBe(true);
    expect(onPicked).not.toHaveBeenCalled();
    session.stop();
  });

  it("excluded elements pass through untouched (panel's own host)", () => {
    document.body.innerHTML = '<div id="panel"><button id="b">x</button></div>';
    const onPicked = vi.fn();
    const session = startPick({
      onPicked,
      isExcluded: (el) => el.id === "panel" || el.closest("#panel") !== null,
    });
    const evt = new MouseEvent("click", { bubbles: true, cancelable: true });
    q("b").dispatchEvent(evt);
    // Not swallowed, not reported — the panel's own controls work normally.
    expect(evt.defaultPrevented).toBe(false);
    expect(onPicked).not.toHaveBeenCalled();
    session.stop();
  });

  it("shows a hover overlay tracking the hovered element", () => {
    document.body.innerHTML = "<p id='p'>Body</p>";
    const session = startPick({ onPicked: vi.fn() });
    q("p").dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    const overlay = document.getElementById(OVERLAY_ID);
    expect(overlay).toBeTruthy();
    expect(overlay?.style.pointerEvents).toBe("none");
    session.stop();
  });

  it("stop() tears down the session + overlay and is idempotent", () => {
    document.body.innerHTML = "<p id='p'>Body</p>";
    const session = startPick({ onPicked: vi.fn() });
    q("p").dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    expect(document.getElementById(OVERLAY_ID)).toBeTruthy();
    session.stop();
    expect(session.active).toBe(false);
    expect(document.getElementById(OVERLAY_ID)).toBeNull();
    // Idempotent: a second stop is a no-op.
    session.stop();
    expect(session.active).toBe(false);
  });
});
