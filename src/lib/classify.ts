/**
 * Shared element CLASSIFIERS for the theming engine + element picker.
 *
 * These are the small, framework-agnostic DOM predicates both the picker
 * (`content/pick-resolve.ts`) and the in-page engine consume. Centralizing them
 * here (D2) means one definition of "is this button-like?" instead of a copy in
 * each consumer. They read only an `Element`'s tag/attributes — no `chrome.*`,
 * no computed styles.
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
