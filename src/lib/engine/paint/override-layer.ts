/**
 * The per-tag custom override layer: a separate `<style>` emitted after the main
 * theme so it wins.
 *
 * `options.overrides` maps `<tag>|<prop>` to an exact hex (no AA floor, since an
 * override is a deliberate manual choice). This builds + installs a sibling
 * `<style id="themeMakerOverrides">`:
 *  - background on a real tag: `tag[data-thememaker]` (0,1,1) beats the engine's
 *    per-element `[data-thememaker="N"]` (0,1,0).
 *  - text on a real tag: root-scoped `[data-thememaker] tag` (mirrors the engine's
 *    role rules) plus a per-surface variant, so it ties the engine's specificity
 *    and wins by later source order, clearing site single-class colors.
 *  - the `page` sentinel: bare `html, body`; `html`/`body`: bare tag.
 *
 * Parses the `<tag>|<prop>` key via `parseOverrideKey` so the picker, popup, and
 * this emitter all speak one grammar.
 */
import { parseOverrideKey } from "../../overrides";
import { OVERRIDE_STYLE_ID, SURFACE_TOKEN_ATTR } from "../dom/owned-attributes";
import type { RoleOverrides } from "../../../types";

/** The tinted semantic surface tokens a text override also scopes a variant for. */
const SURFACE_KEYS = ["card", "code", "banner", "comp"] as const;

/**
 * Builds + installs (or removes) the `<style id="themeMakerOverrides">` layer for
 * the given overrides, appending it to `head` so it follows the main theme style.
 * Invalid hex values and unsafe tag names are skipped; an empty map removes any
 * stale layer.
 */
export const applyOverrideLayer = (
  overrides: RoleOverrides | undefined,
  head: Element,
): void => {
  const ovr = overrides || {};
  const ovrKeys = Object.keys(ovr);
  let ovrStyle = document.getElementById(
    OVERRIDE_STYLE_ID,
  ) as HTMLStyleElement | null;
  if (ovrKeys.length === 0) {
    if (ovrStyle) {
      ovrStyle.remove();
    }
    return;
  }
  const rules: string[] = [];
  for (const key of ovrKeys) {
    const val = ovr[key];
    if (!val || !/^#[0-9a-fA-F]{6}$/.test(val)) {
      continue;
    }
    const parsed = parseOverrideKey(key);
    const tag = (parsed.tag ?? parsed.role).toLowerCase();
    const prop = parsed.prop ?? "background";
    if (!/^[a-z][a-z0-9-]*$/.test(tag)) {
      continue; // only safe element names
    }
    const cssProp = prop === "background" ? "background-color" : "color";
    if (tag === "page") {
      rules.push(`html, body{${cssProp}:${val} !important}`);
    } else if (tag === "html" || tag === "body") {
      rules.push(`${tag}{${cssProp}:${val} !important}`);
    } else if (cssProp === "background-color") {
      rules.push(`${tag}[data-thememaker]{${cssProp}:${val} !important}`);
    } else {
      rules.push(`[data-thememaker] ${tag}{${cssProp}:${val} !important}`);
      for (const surfKey of SURFACE_KEYS) {
        rules.push(
          `[data-thememaker] [${SURFACE_TOKEN_ATTR}="${surfKey}"] ${tag}{${cssProp}:${val} !important}`,
        );
      }
    }
  }
  if (!ovrStyle) {
    ovrStyle = document.createElement("style");
    ovrStyle.id = OVERRIDE_STYLE_ID;
  }
  head.appendChild(ovrStyle);
  ovrStyle.textContent = rules.join("\n");
};
