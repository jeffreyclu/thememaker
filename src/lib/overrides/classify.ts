/**
 * Shared element classifiers for the theming engine + element picker.
 *
 * These are the small, framework-agnostic DOM predicates both the picker
 * and the in-page engine consume, so "is this
 * button-like?" has one definition instead of a copy in each consumer. They read
 * only an `Element`'s tag/attributes — no `chrome.*`, no computed styles.
 */

/** Detects whether an element is button-like (a button, a button role, or a
 * submit/button/reset input, or a `btn`/`button` class token). */
export const isButtonLike = (el: Element): boolean => {
  const tag = el.tagName.toLowerCase();
  if (tag === "button") {
    return true;
  }
  if (el.getAttribute("role") === "button") {
    return true;
  }
  if (tag === "input") {
    const t = (el.getAttribute("type") || "").toLowerCase();
    if (t === "submit" || t === "button" || t === "reset") {
      return true;
    }
  }
  const cls = (el.getAttribute("class") || "").toLowerCase();
  return /(^|[-_ ])(btn|button)([-_ ]|$)/.test(cls);
};
