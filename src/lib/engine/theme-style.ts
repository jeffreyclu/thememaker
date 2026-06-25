/**
 * The Thememaker `<style>` element primitive — create-or-reuse by id, IN PLACE.
 *
 * The Engine writes its theme into a single `<style id="themeMaker">` and its
 * anti-flash stand-in into `<style id="themeMakerEarly">`. Both need the same
 * "find the element by id, or create + append it once" behavior — never
 * remove-then-append, so there's no themeless gap / flash. This is that one
 * primitive, INTERNAL to the Engine (only `engine.ts` / `engine-early.ts` call it).
 *
 * Pure DOM (no `chrome.*`, no state).
 */

/**
 * Returns the `<style id={id}>` in `<head>` (or `<html>` as a fallback host),
 * creating + appending it once if absent. The returned element is reused in place
 * on every call.
 */
export const ensureStyleEl = (id: string): HTMLStyleElement => {
  const host =
    document.head || document.querySelector("head") || document.documentElement;
  let style = document.getElementById(id) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = id;
    host.appendChild(style);
  }
  return style;
};
