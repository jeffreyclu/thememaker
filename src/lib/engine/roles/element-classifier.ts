/**
 * Semantic surface / element classification: the engine-internal decisions over an
 * element's tag/class/attributes that the surface walk consumes.
 *
 * Surfaces are classified by tag/class into roles (button / code / card / banner /
 * complementary / generic) that pull dedicated palette slots, so every surface's
 * theme color is a pure function of its role, never of its original-bg luminance.
 * That decoupling is what lets recycled/restyled nodes and identical rows share
 * one color on SPAs. Text role classification lives in the root-scoped tag rules
 * (`roles/role-stylesheet`), so these classifiers only ever decide surfaces.
 *
 * The shared `isButtonLike` lives in `lib/overrides`; this module adds the engine's
 * surface-only classifiers. Pure decisions over an element + resolved roles;
 * `getComputedStyle` reads stay in the walk, not here.
 */
import { isButtonLike } from "../../overrides";
import type { ResolvedRoles } from "./index";

/** The surface fixed-theme fill for an element: bg, label seed, optional token. */
export interface SurfaceFill {
  bg: string;
  label: string;
  /** A `data-tm-surf` token for tinted semantic surfaces (card/code/banner/comp). */
  surf?: string;
}

// Tag membership tested via ` tag ` substring lookups against these space-padded
// strings.
const CODE_TAGS = " pre code kbd samp ";
const CARD_TAGS = " article section figure dialog details fieldset blockquote ";
const BANNER_TAGS = " header nav ";
const COMPLEMENTARY_TAGS = " aside footer ";
const PRIMARY_CLASS =
  /(^|[-_ ])(primary|cta|submit|btn-primary|is-primary|accent|main)([-_ ]|$)/;
const SECONDARY_CLASS =
  /(^|[-_ ])(secondary|ghost|outline|tertiary|cancel|link-button|btn-secondary|is-secondary)([-_ ]|$)/;
const PRIMARY_TEXT =
  /\b(submit|save|continue|sign up|sign in|log in|buy|checkout|get started|subscribe|confirm|next|send|apply|create|add)\b/;
const SECONDARY_TEXT =
  /\b(cancel|back|skip|dismiss|close|learn more|details|reset|edit|more)\b/;

/**
 * Builds a stable document-order index of every button-like element, so "the
 * first button is the dominant CTA" is deterministic across re-applies/observer
 * updates (a monotonic counter would drift on incremental walks). Best-effort.
 */
export const buildButtonOrder = (): Map<Element, number> => {
  const buttonOrder = new Map<Element, number>();
  try {
    const btns = document.querySelectorAll(
      'button, [role="button"], input[type="submit"], input[type="button"], .btn, .button',
    );
    for (let i = 0; i < btns.length; i += 1) {
      buttonOrder.set(btns[i], i);
    }
  } catch {
    // best-effort
  }
  return buttonOrder;
};

/** primaryButton | secondaryButton, by class → text → document order. */
export const classifyButton = (
  el: HTMLElement,
  buttonOrder: Map<Element, number>,
): "primary" | "secondary" => {
  const cls = (el.getAttribute("class") || "").toLowerCase();
  const txt = (el.textContent || "").toLowerCase().trim();
  if (SECONDARY_CLASS.test(cls)) {
    return "secondary";
  }
  if (PRIMARY_CLASS.test(cls)) {
    return "primary";
  }
  if (SECONDARY_TEXT.test(txt)) {
    return "secondary";
  }
  if (PRIMARY_TEXT.test(txt)) {
    return "primary";
  }
  return (buttonOrder.get(el) ?? 0) === 0 ? "primary" : "secondary";
};

/**
 * Surface scope tokens to the deterministic reference bg the scoped text rules
 * floor against. Tinted semantic surfaces (card/code/banner/comp) carry a token so
 * text inside them floors against that surface (AA + colorful). Generic surfaces
 * are not tokenized; their text uses the page-level role rules.
 */
export const surfaceRoleBg = (
  roles: ResolvedRoles,
): Record<string, string> => ({
  card: roles.roleSurface,
  code: roles.roleSurfaceAlt,
  banner: roles.bannerBg,
  comp: roles.complementaryBg,
});

/**
 * Builds the surface fill resolver for the current palette: maps an element to
 * its fixed-theme bg + label seed + optional `data-tm-surf` token. Every surface's
 * `bg` is a pure function of its role: buttons to primary/secondary;
 * code/card/banner/comp to their tinted slots; generic surfaces to the one fixed
 * `roleSurface`. Total (never null): a generic surface is a first-class role.
 * Buttons carry no token (their content is a label, not document text).
 */
export const makeSurfaceFillFor = (
  roles: ResolvedRoles,
  buttonOrder: Map<Element, number>,
): ((el: HTMLElement) => SurfaceFill) => {
  return (el: HTMLElement): SurfaceFill => {
    const tag = el.tagName.toLowerCase();
    if (isButtonLike(el)) {
      return classifyButton(el, buttonOrder) === "primary"
        ? { bg: roles.rolePrimary, label: roles.roleOnPrimary }
        : { bg: roles.roleSecondary, label: roles.roleOnSecondary };
    }
    if (CODE_TAGS.indexOf(` ${tag} `) >= 0) {
      return {
        bg: roles.roleSurfaceAlt,
        label: roles.roleTextPrimary,
        surf: "code",
      };
    }
    if (BANNER_TAGS.indexOf(` ${tag} `) >= 0) {
      // Header/nav get their own hued surface tint (heading hue to bg).
      return {
        bg: roles.bannerBg,
        label: roles.roleTextPrimary,
        surf: "banner",
      };
    }
    if (COMPLEMENTARY_TAGS.indexOf(` ${tag} `) >= 0) {
      // Aside/footer get a different hued tint (link hue to bg).
      return {
        bg: roles.complementaryBg,
        label: roles.roleTextPrimary,
        surf: "comp",
      };
    }
    if (CARD_TAGS.indexOf(` ${tag} `) >= 0) {
      return {
        bg: roles.roleSurface,
        label: roles.roleTextPrimary,
        surf: "card",
      };
    }
    // Generic surface: the one fixed role surface (decoupled from original bg).
    return { bg: roles.roleSurface, label: roles.roleTextPrimary };
  };
};

/** Tags that can't be meaningfully repainted as a surface (media/SVG/script). */
export const isSkippable = (el: HTMLElement): boolean => {
  const tag = el.tagName.toLowerCase();
  return (
    tag === "style" ||
    tag === "script" ||
    tag === "svg" ||
    tag === "path" ||
    tag === "img" ||
    tag === "canvas" ||
    tag === "video" ||
    tag === "iframe"
  );
};

/**
 * Editable regions (compose boxes, inputs) must never be re-walked/re-themed:
 * typing churns their subtree on every keystroke, and they inherit the correct
 * text color from their surface/base anyway. Skipping them keeps typing smooth.
 */
export const isEditableRoot = (el: HTMLElement): boolean => {
  const tag = el.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea") {
    return true;
  }
  const ce = el.getAttribute("contenteditable");
  return ce === "" || ce === "true" || ce === "plaintext-only";
};

/**
 * A computed `background-image` is a real image asset to preserve when it contains
 * a `url(...)` (raster/SVG/sprite/photo). Pure gradients (`linear-`/`radial-`/
 * `conic-gradient`, no `url(`) are decorative and safe to replace with the themed
 * solid. `none` and empty are not images.
 */
export const hasImageBackground = (bgImage: string | null): boolean => {
  if (!bgImage) {
    return false;
  }
  const s = bgImage.trim().toLowerCase();
  if (s === "none" || s === "") {
    return false;
  }
  return s.includes("url(");
};
