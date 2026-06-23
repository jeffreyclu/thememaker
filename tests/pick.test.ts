/**
 * In-page element picker (`src/content/pick.ts`).
 *
 * Verifies the picker's role resolution from a LIVE element (via the shared
 * `roleOfElement` core), the capture-phase click flow (preventDefault +
 * resolve + exit), the hover overlay, and Esc cancellation.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  classifierInputFor,
  overrideKeyFor,
  startPick,
  OVERLAY_ID,
} from "../src/content/pick";

afterEach(() => {
  document.body.innerHTML = "";
  document.getElementById(OVERLAY_ID)?.remove();
});

describe("classifierInputFor / overrideKeyFor (live element → role key)", () => {
  it("reads tag/class/text/button signals off a real element", () => {
    document.body.innerHTML =
      '<button class="btn-primary">Save changes</button>';
    const btn = document.querySelector("button") as HTMLElement;
    const input = classifierInputFor(btn);
    expect(input.tagName).toBe("button");
    expect(input.className).toBe("btn-primary");
    expect(input.text).toBe("save changes");
    expect(input.buttonLike).toBe(true);
  });

  it("maps a heading/link/paragraph to the right override key", () => {
    document.body.innerHTML = "<h1>Title</h1><a href='#'>Link</a><p>Body</p>";
    expect(overrideKeyFor(document.querySelector("h1") as Element)).toBe(
      "heading",
    );
    expect(overrideKeyFor(document.querySelector("a") as Element)).toBe("link");
    expect(overrideKeyFor(document.querySelector("p") as Element)).toBe(
      "textPrimary",
    );
  });

  it("maps a button to the primary role", () => {
    document.body.innerHTML = "<button>Submit</button>";
    expect(overrideKeyFor(document.querySelector("button") as Element)).toBe(
      "primary",
    );
  });
});

describe("startPick (pick-mode session)", () => {
  it("resolves the clicked element's role and exits on click (capture phase)", () => {
    document.body.innerHTML = "<h1>Title</h1>";
    const onPicked = vi.fn();
    const onCancelled = vi.fn();
    const session = startPick({ onPicked, onCancelled });
    expect(session.active).toBe(true);

    const h1 = document.querySelector("h1") as HTMLElement;
    const evt = new MouseEvent("click", { bubbles: true, cancelable: true });
    h1.dispatchEvent(evt);

    // The page's default action is prevented (capture phase), the role reported,
    // and the session is no longer active.
    expect(evt.defaultPrevented).toBe(true);
    expect(onPicked).toHaveBeenCalledWith("heading");
    expect(onCancelled).not.toHaveBeenCalled();
    expect(session.active).toBe(false);
    // Overlay torn down.
    expect(document.getElementById(OVERLAY_ID)).toBeNull();
  });

  it("shows a hover overlay tracking the hovered element", () => {
    document.body.innerHTML = "<p>Body</p>";
    const session = startPick({ onPicked: vi.fn(), onCancelled: vi.fn() });
    const p = document.querySelector("p") as HTMLElement;
    p.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    const overlay = document.getElementById(OVERLAY_ID);
    expect(overlay).toBeTruthy();
    expect(overlay?.style.pointerEvents).toBe("none");
    session.stop();
  });

  it("Esc cancels: reports a cancellation and exits", () => {
    const onPicked = vi.fn();
    const onCancelled = vi.fn();
    const session = startPick({ onPicked, onCancelled });
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(onCancelled).toHaveBeenCalledTimes(1);
    expect(onPicked).not.toHaveBeenCalled();
    expect(session.active).toBe(false);
  });

  it("stop() cancels an active session exactly once", () => {
    const onCancelled = vi.fn();
    const session = startPick({ onPicked: vi.fn(), onCancelled });
    session.stop();
    session.stop(); // idempotent — no double-cancel
    expect(onCancelled).toHaveBeenCalledTimes(1);
    expect(session.active).toBe(false);
  });
});
