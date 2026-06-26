/**
 * The Thememaker `<style>` element primitive: create-or-reuse by id, in place.
 *
 * The Engine writes its theme into a single `<style id="themeMaker">` and its
 * anti-flash stand-in into `<style id="themeMakerEarly">`. Both need the same
 * find-the-element-by-id-or-create-and-append-once behavior, never
 * remove-then-append, so there's no themeless gap / flash.
 *
 * Pure DOM, no `chrome.*` and no state.
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
