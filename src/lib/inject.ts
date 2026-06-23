/**
 * Injectable page functions.
 *
 * These run in the *target page's* world via `chrome.scripting.executeScript`.
 * They are serialized (`func.toString()`) and shipped to the page, so they MUST
 * be fully self-contained: NO imports, NO closure over module-scope variables,
 * NO `chrome.*`. Everything they need is passed as an argument, and every helper
 * they call is declared INSIDE the function body. (Verified against the bundled
 * service-worker chunk — the minifier inlines these because they reference
 * nothing external.)
 *
 * Phase 2: `applyAdaptiveScheme` is the v2 engine's in-page entry point. It
 * inspects the live page (`getComputedStyle`, `:root` custom properties), then
 * runs a TWO-PASS algorithm (surfaces, then text against the EFFECTIVE rendered
 * background), always theming `<html>` + `<body>` as a base surface, enforcing
 * WCAG AA on every text/background pair, writing the single
 * `<style id="themeMaker">` IN PLACE (no themeless gap → no flash), and
 * installing an INCREMENTAL, debounced `MutationObserver` for SPA/lazy content.
 *
 * INTENSITY is a BLEND: "how much of the theme is applied vs. the original".
 * Every themed color is mixed from each element's ORIGINAL color (captured once,
 * so re-apply is idempotent) toward the mapped palette color by `intensity/100`,
 * uniformly across all surfaces/text — so the dial always has a visible effect.
 * The algorithm is a SELF-CONTAINED port of the canonical, unit-tested core in
 * `src/lib/mapping.ts` + `src/lib/color.ts` (kept in lockstep with those).
 */
import type { Palette } from "./palette";
import type { ApplyOptions } from "../types";

/** The id of the <style> element Thememaker owns on the page. */
export const STYLE_ELEMENT_ID = "themeMaker";

/**
 * Writes `css` into the Thememaker <style> element, creating it only if missing
 * (never remove-then-append, so there is no themeless gap / flash on re-apply).
 * Self-contained: safe to pass to `executeScript({ func: applySchemeStyle })`.
 *
 * @returns `true` once applied.
 */
export function applySchemeStyle(css: string): boolean {
  const STYLE_ID = "themeMaker";
  const head = document.querySelector("head") || document.documentElement;
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    head.appendChild(style);
  }
  style.textContent = css;
  return true;
}

/**
 * Removes the Thememaker <style> element if present, and tears down any active
 * MutationObserver / engine state the adaptive engine installed.
 * Self-contained: safe to pass to `executeScript({ func: removeSchemeStyle })`.
 *
 * @returns `true` if a style element was removed, otherwise `false`.
 */
export function removeSchemeStyle(): boolean {
  const STYLE_ID = "themeMaker";
  const w = window as unknown as {
    __themeMakerObserver?: MutationObserver;
    __themeMakerArgs?: unknown;
    __themeMakerNextId?: number;
    __themeMakerOriginals?: unknown;
  };
  if (w.__themeMakerObserver) {
    w.__themeMakerObserver.disconnect();
    w.__themeMakerObserver = undefined;
  }
  w.__themeMakerArgs = undefined;
  w.__themeMakerNextId = undefined;
  // Drop the original-style cache so a fresh apply re-captures true originals.
  w.__themeMakerOriginals = undefined;
  const old = document.getElementById(STYLE_ID);
  if (old) {
    old.remove();
    return true;
  }
  return false;
}

/**
 * Reports whether a Thememaker style is currently applied on the page.
 * Self-contained: safe to pass to `executeScript({ func: isSchemeApplied })`.
 */
export function isSchemeApplied(): boolean {
  const STYLE_ID = "themeMaker";
  return document.getElementById(STYLE_ID) !== null;
}

/**
 * The v2 adaptive engine, IN-PAGE entry point.
 *
 * Self-contained by necessity (serialized to the page): all color math, role
 * detection, mapping, and contrast enforcement are inlined here. This mirrors
 * the canonical pure modules (`color.ts` / `mapping.ts`) which carry the tests.
 *
 * @param palette the generated palette (surfaces ascending by luminance).
 * @param options apply options (numeric 0–100 intensity = theme-vs-original blend).
 * @returns `true` once applied.
 */
export function applyAdaptiveScheme(
  palette: Palette,
  options: ApplyOptions,
): boolean {
  const STYLE_ID = "themeMaker";
  const ATTR = "data-thememaker";

  // ---- inlined color math (port of src/lib/color.ts) ----------------------
  const clamp = (n: number, lo: number, hi: number): number =>
    Math.min(hi, Math.max(lo, n));

  const parseColor = (input: string): [number, number, number] | null => {
    if (!input) {
      return null;
    }
    const s = input.trim().toLowerCase();
    if (s === "transparent") {
      return null;
    }
    if (s.startsWith("#")) {
      let h = s.slice(1);
      if (h.length === 3) {
        h = h
          .split("")
          .map((c) => c + c)
          .join("");
      }
      if (h.length !== 6) {
        return null;
      }
      const r = parseInt(h.slice(0, 2), 16);
      const g = parseInt(h.slice(2, 4), 16);
      const b = parseInt(h.slice(4, 6), 16);
      if ([r, g, b].some((n) => Number.isNaN(n))) {
        return null;
      }
      return [r, g, b];
    }
    const m = s.match(
      /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/,
    );
    if (m) {
      const a = m[4] === undefined ? 1 : parseFloat(m[4]);
      if (a === 0) {
        return null; // fully transparent → treat as "no background"
      }
      return [Number(m[1]), Number(m[2]), Number(m[3])];
    }
    return null;
  };

  const toHex = (rgb: [number, number, number]): string => {
    const h = (n: number): string =>
      Math.round(clamp(n, 0, 255))
        .toString(16)
        .padStart(2, "0");
    return `#${h(rgb[0])}${h(rgb[1])}${h(rgb[2])}`;
  };

  const rgbToHsl = (
    rgb: [number, number, number],
  ): [number, number, number] => {
    const rn = rgb[0] / 255;
    const gn = rgb[1] / 255;
    const bn = rgb[2] / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const d = max - min;
    let hh = 0;
    if (d !== 0) {
      if (max === rn) {
        hh = ((gn - bn) / d) % 6;
      } else if (max === gn) {
        hh = (bn - rn) / d + 2;
      } else {
        hh = (rn - gn) / d + 4;
      }
      hh *= 60;
      if (hh < 0) {
        hh += 360;
      }
    }
    const l = (max + min) / 2;
    const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    return [hh, sat * 100, l * 100];
  };

  const hslToHex = (hsl: [number, number, number]): string => {
    const hh = (((hsl[0] % 360) + 360) % 360) / 60;
    const sat = clamp(hsl[1], 0, 100) / 100;
    const l = clamp(hsl[2], 0, 100) / 100;
    const c = (1 - Math.abs(2 * l - 1)) * sat;
    const x = c * (1 - Math.abs((hh % 2) - 1));
    const m = l - c / 2;
    let r = 0;
    let g = 0;
    let b = 0;
    if (hh < 1) {
      [r, g, b] = [c, x, 0];
    } else if (hh < 2) {
      [r, g, b] = [x, c, 0];
    } else if (hh < 3) {
      [r, g, b] = [0, c, x];
    } else if (hh < 4) {
      [r, g, b] = [0, x, c];
    } else if (hh < 5) {
      [r, g, b] = [x, 0, c];
    } else {
      [r, g, b] = [c, 0, x];
    }
    return toHex([(r + m) * 255, (g + m) * 255, (b + m) * 255]);
  };

  const linearize = (ch: number): number => {
    const c = ch / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };

  const lumOfRgb = (rgb: [number, number, number]): number =>
    0.2126 * linearize(rgb[0]) +
    0.7152 * linearize(rgb[1]) +
    0.0722 * linearize(rgb[2]);

  const lumOfHex = (hex: string): number => {
    const rgb = parseColor(hex);
    return rgb ? lumOfRgb(rgb) : 0;
  };

  const contrast = (a: string, b: string): number => {
    const la = lumOfHex(a);
    const lb = lumOfHex(b);
    const hi = Math.max(la, lb);
    const lo = Math.min(la, lb);
    return (hi + 0.05) / (lo + 0.05);
  };

  const ensureContrast = (text: string, bg: string, large: boolean): string => {
    const target = large ? 3 : 4.5;
    if (contrast(text, bg) >= target) {
      return text;
    }
    const rgb = parseColor(text) || [51, 51, 51];
    const base = rgbToHsl(rgb);
    const search = (dir: number): string | null => {
      for (let step = 1; step <= 100; step += 1) {
        const l = base[2] + dir * step;
        if (l < 0 || l > 100) {
          break;
        }
        const cand = hslToHex([base[0], base[1], l]);
        if (contrast(cand, bg) >= target) {
          return cand;
        }
      }
      return null;
    };
    const darker = search(-1);
    const lighter = search(1);
    if (darker && lighter) {
      const dDelta = Math.abs(
        rgbToHsl(parseColor(darker) as [number, number, number])[2] - base[2],
      );
      const lDelta = Math.abs(
        rgbToHsl(parseColor(lighter) as [number, number, number])[2] - base[2],
      );
      return dDelta <= lDelta ? darker : lighter;
    }
    if (darker) {
      return darker;
    }
    if (lighter) {
      return lighter;
    }
    return contrast("#000000", bg) >= contrast("#ffffff", bg)
      ? "#000000"
      : "#ffffff";
  };

  // Nudge a color to the NEAREST shade of ITS OWN hue that meets AA against bg
  // (preserving hue + saturation), only falling back to black/white when no
  // shade of the hue can reach AA. This is the anti-monochrome contrast path:
  // a colorful accent (link/heading/button) stays its color, just relit. Port
  // of `nudgeToAA` in src/lib/color.ts.
  const nudgeToAA = (color: string, bg: string, large: boolean): string => {
    const target = large ? 3 : 4.5;
    if (contrast(color, bg) >= target) {
      return color;
    }
    const rgb = parseColor(color) || [51, 51, 51];
    const base = rgbToHsl(rgb);
    const search = (dir: number): string | null => {
      for (let step = 1; step <= 100; step += 1) {
        const l = base[2] + dir * step;
        if (l < 0 || l > 100) {
          break;
        }
        const cand = hslToHex([base[0], base[1], l]);
        if (contrast(cand, bg) >= target) {
          return cand;
        }
      }
      return null;
    };
    const darker = search(-1);
    const lighter = search(1);
    if (darker && lighter) {
      const dDelta = Math.abs(
        rgbToHsl(parseColor(darker) as [number, number, number])[2] - base[2],
      );
      const lDelta = Math.abs(
        rgbToHsl(parseColor(lighter) as [number, number, number])[2] - base[2],
      );
      return dDelta <= lDelta ? darker : lighter;
    }
    if (darker) {
      return darker;
    }
    if (lighter) {
      return lighter;
    }
    return ensureContrast(color, bg, large);
  };

  const bucketOf = (hex: string): "dark" | "medium" | "light" => {
    const l = lumOfHex(hex);
    if (l < 0.15) {
      return "dark";
    }
    if (l < 0.55) {
      return "medium";
    }
    return "light";
  };

  // ---- palette accessors (port of src/lib/mapping.ts) ---------------------
  const surfaces = (palette.surfaces || []).slice();
  const accents = (palette.accents || []).slice();
  const swatches = (palette.swatches || []).slice();
  const surfaceFor = (bucket: "dark" | "medium" | "light"): string => {
    if (surfaces.length === 0) {
      return "#808080";
    }
    if (bucket === "dark") {
      return surfaces[0];
    }
    if (bucket === "light") {
      return surfaces[surfaces.length - 1];
    }
    return surfaces[Math.floor(surfaces.length / 2)];
  };
  const borderSeed =
    accents[accents.length - 1] || swatches[swatches.length - 1] || "#888888";

  // ---- semantic role colors (the anti-monochrome layer) -------------------
  // Distinct palette slots for distinct semantic roles, so a multi-hue palette
  // spends its whole harmony (heading ≠ link ≠ body ≠ primary button). The
  // `roles` object is derived purely in src/lib/palette.ts; we read it with
  // safe fallbacks so a legacy palette (no roles) degrades to the old behavior.
  const fallbackInk = accents[0] || swatches[0] || "#333333";
  const roles = (palette.roles || {}) as Partial<{
    bg: string;
    surface: string;
    surfaceAlt: string;
    textPrimary: string;
    textSecondary: string;
    heading: string;
    link: string;
    primary: string;
    onPrimary: string;
    secondary: string;
    onSecondary: string;
    border: string;
    accent: string;
  }>;
  const roleTextPrimary = roles.textPrimary || fallbackInk;
  const roleTextSecondary = roles.textSecondary || fallbackInk;
  const roleHeading = roles.heading || fallbackInk;
  const roleLink = roles.link || fallbackInk;
  const roleAccent = roles.accent || fallbackInk;
  const rolePrimary = roles.primary || surfaceFor("medium");
  const roleOnPrimary = roles.onPrimary || "#ffffff";
  const roleSecondary = roles.secondary || surfaceFor("light");
  const roleOnSecondary = roles.onSecondary || "#111111";
  const roleSurface = roles.surface || surfaceFor("light");
  const roleSurfaceAlt = roles.surfaceAlt || surfaceFor("medium");
  const roleBorder = roles.border || borderSeed;

  // The fully-themed base surface (html/body) before blending.
  const themedBase = roles.bg || surfaceFor("light");

  // ---- intensity → BLEND factor (theme vs. original) ----------------------
  // Intensity is "how much of the theme is applied versus the original": every
  // themed color is mixed from the element's ORIGINAL color toward the mapped
  // palette color by this factor. This affects EVERY surface/text on EVERY site
  // (no area gating → the dial is never a no-op).
  const intensity = Math.min(100, Math.max(0, options.intensity));
  const factor = intensity / 100;

  // sRGB linear blend: from → to by t in [0,1].
  const mix = (from: string, to: string, t: number): string => {
    const a = parseColor(from);
    const b = parseColor(to);
    if (!a || !b) {
      return to;
    }
    const k = clamp(t, 0, 1);
    return toHex([
      a[0] + (b[0] - a[0]) * k,
      a[1] + (b[1] - a[1]) * k,
      a[2] + (b[2] - a[2]) * k,
    ]);
  };

  // Text color from a ROLE SEED. SOURCE-OF-TRUTH with a READABILITY FLOOR: at
  // full intensity (t>=1) paint the EXACT seed, but passed through `nudgeToAA` —
  // which returns it UNCHANGED when already readable (so the swatch == the DOM
  // color), and only nudges a truly-unreadable color to the nearest readable
  // shade of the SAME hue. Below full intensity, blend toward the seed and keep
  // it readable. Mirrors `blendedText` in src/lib/mapping.ts.
  const blendedText = (
    originalText: string | null,
    bg: string,
    seed: string,
    t: number,
    large: boolean,
  ): string => {
    if (t >= 1) {
      return nudgeToAA(seed, bg, large);
    }
    const themed = nudgeToAA(seed, bg, large);
    if (!originalText) {
      return themed;
    }
    const cand = mix(originalText, themed, t);
    return nudgeToAA(cand, bg, large);
  };

  const classifyVarName = (
    name: string,
  ): "surface" | "text" | "border" | null => {
    const n = name.toLowerCase();
    if (/(^|[-_])(bg|background|surface|paper|card|panel)([-_]|$)/.test(n)) {
      return "surface";
    }
    if (
      /(^|[-_])(text|fg|foreground|ink|copy|body|heading|link)([-_]|$)/.test(n)
    ) {
      return "text";
    }
    if (/(^|[-_])(border|outline|divider|rule|stroke)([-_]|$)/.test(n)) {
      return "border";
    }
    return null;
  };

  // ---- detect :root CSS variables -----------------------------------------
  const root = document.documentElement;
  const rootStyle = getComputedStyle(root);
  const detectedVars: Array<{ name: string; value: string; role: string }> = [];
  const seenVars = new Set<string>();
  const collectFromRule = (style: CSSStyleDeclaration): void => {
    for (let i = 0; i < style.length; i += 1) {
      // Index access works in both real browsers and jsdom; `.item(i)` does not
      // exist in jsdom, so avoid it.
      const prop = (style as unknown as Record<number, string>)[i];
      if (prop && prop.startsWith("--") && !seenVars.has(prop)) {
        seenVars.add(prop);
        const declared = style.getPropertyValue(prop).trim();
        const resolved = declared || rootStyle.getPropertyValue(prop).trim();
        const rgb = parseColor(resolved);
        if (rgb) {
          const role = classifyVarName(prop);
          if (role) {
            detectedVars.push({ name: prop, value: toHex(rgb), role });
          }
        }
      }
    }
  };
  try {
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList | null = null;
      try {
        rules = sheet.cssRules;
      } catch {
        rules = null; // cross-origin sheet — skip
      }
      if (!rules) {
        continue;
      }
      for (const rule of Array.from(rules)) {
        const sr = rule as CSSStyleRule;
        if (
          sr.selectorText &&
          (sr.selectorText === ":root" || sr.selectorText === "html") &&
          sr.style
        ) {
          collectFromRule(sr.style);
        }
      }
    }
  } catch {
    // Best-effort variable detection; absence just routes to repaint.
  }

  let hasSurfaceVar = false;
  let hasTextVar = false;
  for (const v of detectedVars) {
    if (v.role === "surface") {
      hasSurfaceVar = true;
    }
    if (v.role === "text") {
      hasTextVar = true;
    }
  }
  const variableDriven = hasSurfaceVar && hasTextVar;

  // ---- remap variables (additive layer) -----------------------------------
  const varDecls: string[] = [];
  if (variableDriven || intensity >= 100) {
    const surfaceVar = detectedVars.find((v) => v.role === "surface");
    const primarySurface = surfaceFor(
      surfaceVar ? bucketOf(surfaceVar.value) : "light",
    );
    for (const v of detectedVars) {
      if (v.role === "surface") {
        // Blend each surface var from its ORIGINAL value toward the mapped one.
        const mapped = surfaceFor(bucketOf(v.value));
        varDecls.push(`${v.name}: ${mix(v.value, mapped, factor)} !important;`);
      } else if (v.role === "text") {
        // Route text vars to the matching ROLE color so heading/link vars carry
        // their own accent hue (not all one seed), then AA-nudge (hue-preserving).
        const n = v.name.toLowerCase();
        const seed = /heading|title/.test(n)
          ? roleHeading
          : /link|anchor/.test(n)
            ? roleLink
            : /muted|secondary|subtle/.test(n)
              ? roleTextSecondary
              : roleTextPrimary;
        varDecls.push(
          `${v.name}: ${blendedText(v.value, primarySurface, seed, factor, false)} !important;`,
        );
      } else if (v.role === "border") {
        const mapped = nudgeToAA(roleBorder, primarySurface, true);
        varDecls.push(`${v.name}: ${mix(v.value, mapped, factor)} !important;`);
      }
    }
  }

  // ---- a single element's rule emitter (shared with the observer) ---------
  type OriginalStyle = { bg: string | null; fg: string | null };
  const w = window as unknown as {
    __themeMakerObserver?: MutationObserver;
    __themeMakerArgs?: [Palette, ApplyOptions];
    __themeMakerNextId?: number;
    __themeMakerWriting?: boolean;
    __themeMakerOriginals?: WeakMap<Element, OriginalStyle>;
  };

  // Monotonic id counter — NEVER reset to 0 (so incremental observer rules
  // don't collide with / strand earlier ones).
  if (typeof w.__themeMakerNextId !== "number") {
    w.__themeMakerNextId = 0;
  }

  // Cache of each element's ORIGINAL (pre-theming) background/text, captured the
  // FIRST time we see it. Crucial for idempotent re-apply: once our <style> is
  // live, getComputedStyle returns OUR themed colors, so re-detecting from the
  // live computed style would re-map already-mapped colors and DRIFT (e.g.
  // dragging the slider left→right wouldn't return to the same result). We
  // always detect against these originals instead.
  if (!w.__themeMakerOriginals) {
    w.__themeMakerOriginals = new WeakMap<Element, OriginalStyle>();
  }
  const originals = w.__themeMakerOriginals;

  /**
   * Returns an element's ORIGINAL bg/fg, capturing it once. On the very first
   * apply the live computed style IS the original; on re-applies we read the
   * cached value so detection never sees our own themed output.
   */
  const originalStyleOf = (el: HTMLElement): OriginalStyle => {
    const cached = originals.get(el);
    if (cached) {
      return cached;
    }
    const cs = getComputedStyle(el);
    const captured: OriginalStyle = {
      bg: cs.backgroundColor || null,
      fg: cs.color || null,
    };
    originals.set(el, captured);
    return captured;
  };

  // Base surface (html/body): ALWAYS painted, blended from the page's ORIGINAL
  // body background toward the themed base by the intensity factor.
  const bodyOriginal = document.body
    ? originalStyleOf(document.body)
    : { bg: null, fg: null };
  const baseBackground = mix(bodyOriginal.bg || "#ffffff", themedBase, factor);
  // Page base ink carries the faintly-tinted body (textPrimary) slot.
  const baseText = blendedText(
    bodyOriginal.fg || "#111111",
    baseBackground,
    roleTextPrimary,
    factor,
    false,
  );

  // ---- semantic element classification (port of src/lib/mapping.ts) -------
  // These mirror the pure core's `classifyText` / `classifySurface` /
  // `classifyButton`, so the in-page engine spends the whole palette by role.
  const HEADING_TAGS = " h1 h2 ";
  const SUBHEADING_TAGS = " h3 h4 h5 h6 ";
  const MUTED_TAGS = " small figcaption caption time label ";
  const EMPHASIS_TAGS = " strong em b i mark dfn th ";
  const QUOTE_TAGS = " blockquote q cite ";
  const CODE_TAGS = " pre code kbd samp ";
  const CARD_TAGS =
    " article section figure dialog details fieldset blockquote ";
  const BANNER_TAGS = " header nav ";
  const COMPLEMENTARY_TAGS = " aside footer ";
  const MUTED_CLASS =
    /(^|[-_ ])(muted|secondary|subtle|meta|caption|help|hint|dim|faint|footnote)([-_ ]|$)/;
  const PRIMARY_CLASS =
    /(^|[-_ ])(primary|cta|submit|btn-primary|is-primary|accent|main)([-_ ]|$)/;
  const SECONDARY_CLASS =
    /(^|[-_ ])(secondary|ghost|outline|tertiary|cancel|link-button|btn-secondary|is-secondary)([-_ ]|$)/;
  const PRIMARY_TEXT =
    /\b(submit|save|continue|sign up|sign in|log in|buy|checkout|get started|subscribe|confirm|next|send|apply|create|add)\b/;
  const SECONDARY_TEXT =
    /\b(cancel|back|skip|dismiss|close|learn more|details|reset|edit|more)\b/;

  // Stable document-order index of every button-like element, so "the first
  // button is the dominant CTA" is deterministic across re-applies/observer
  // updates (a monotonic counter would drift on incremental walks).
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

  const isButtonLike = (el: HTMLElement): boolean => {
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

  /** primaryButton | secondaryButton — see `classifyButton` in mapping.ts. */
  const classifyButton = (el: HTMLElement): "primary" | "secondary" => {
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
   * The surface fill + label seed for an element. Buttons → primary/secondary
   * fills with their on-color; code/card → dedicated tinted surfaces; generic
   * surfaces → null (fall back to luminance-bucket mapping so the page's own
   * dark/light hierarchy is preserved).
   */
  const surfaceFillFor = (
    el: HTMLElement,
  ): { bg: string; label: string } | null => {
    const tag = el.tagName.toLowerCase();
    if (isButtonLike(el)) {
      return classifyButton(el) === "primary"
        ? { bg: rolePrimary, label: roleOnPrimary }
        : { bg: roleSecondary, label: roleOnSecondary };
    }
    if (CODE_TAGS.indexOf(` ${tag} `) >= 0) {
      return { bg: roleSurfaceAlt, label: roleTextPrimary };
    }
    if (BANNER_TAGS.indexOf(` ${tag} `) >= 0) {
      // Header/nav get their OWN hued surface tint (heading hue → bg).
      return { bg: mix(roleHeading, themedBase, 0.86), label: roleTextPrimary };
    }
    if (COMPLEMENTARY_TAGS.indexOf(` ${tag} `) >= 0) {
      // Aside/footer get a different hued tint (link hue → bg).
      return { bg: mix(roleLink, themedBase, 0.86), label: roleTextPrimary };
    }
    if (CARD_TAGS.indexOf(` ${tag} `) >= 0) {
      return { bg: roleSurface, label: roleTextPrimary };
    }
    return null;
  };

  /**
   * The TEXT role seed + AA size for an element: a → link; h1/h2 → heading;
   * h3–h6 → accent (subheading); strong/em/… → primary (emphasis);
   * blockquote/cite → secondary (quote); small/caption/muted-class → muted;
   * else body. Mirrors `classifyText` + `textRoleColor` in mapping.ts.
   */
  const textSeedFor = (el: HTMLElement): { seed: string; large: boolean } => {
    const tag = el.tagName.toLowerCase();
    const cls = (el.getAttribute("class") || "").toLowerCase();
    if (tag === "a") {
      return { seed: roleLink, large: false };
    }
    if (HEADING_TAGS.indexOf(` ${tag} `) >= 0) {
      return { seed: roleHeading, large: true };
    }
    if (SUBHEADING_TAGS.indexOf(` ${tag} `) >= 0) {
      return { seed: roleAccent, large: true };
    }
    if (MUTED_TAGS.indexOf(` ${tag} `) >= 0 || MUTED_CLASS.test(cls)) {
      return { seed: roleTextSecondary, large: false };
    }
    if (EMPHASIS_TAGS.indexOf(` ${tag} `) >= 0) {
      return { seed: rolePrimary, large: false };
    }
    if (QUOTE_TAGS.indexOf(` ${tag} `) >= 0) {
      return { seed: roleSecondary, large: false };
    }
    return { seed: roleTextPrimary, large: false };
  };

  /**
   * Process ONE element subtree (the element + its descendants): tag each in
   * DOM order, decide surfaces (pass 1) then text (pass 2 against the effective
   * ancestor background), and return the CSS rules. Used for the full initial
   * walk AND for incremental observer updates.
   */
  const processSubtree = (rootEl: HTMLElement): string[] => {
    const els: HTMLElement[] = [rootEl];
    const descendants = rootEl.querySelectorAll<HTMLElement>("*");
    for (let i = 0; i < descendants.length; i += 1) {
      els.push(descendants[i]);
    }

    // paintedBg: element → new bg (for effective-bg resolution in pass 2).
    const paintedBg = new Map<HTMLElement, string>();
    const out: string[] = [];

    const isSkippable = (el: HTMLElement): boolean => {
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

    // PASS 1 — surfaces (DOM order, so ancestors resolve before descendants).
    // EVERY element that owns a background gets repainted; the NEW background is
    // a BLEND from its ORIGINAL color toward the mapped palette surface.
    for (const el of els) {
      if (isSkippable(el)) {
        continue;
      }
      // Detect against the ORIGINAL background, not our themed output, so
      // re-apply (e.g. dragging the intensity slider) is idempotent.
      const orig = originalStyleOf(el);
      const bgRgb = parseColor(orig.bg ?? "");
      if (!bgRgb) {
        continue;
      }
      // tag + emit a surface rule.
      let id = el.getAttribute(ATTR);
      if (id === null) {
        id = String(w.__themeMakerNextId as number);
        w.__themeMakerNextId = (w.__themeMakerNextId as number) + 1;
        w.__themeMakerWriting = true;
        el.setAttribute(ATTR, id);
        w.__themeMakerWriting = false;
      }
      const originalBg = toHex(bgRgb);
      // Role-aware fill: buttons/code/cards pull dedicated palette slots; other
      // surfaces fall back to luminance-bucket mapping (preserves dark/light).
      const fill = surfaceFillFor(el);
      const mapped = fill ? fill.bg : surfaceFor(bucketOf(originalBg));
      const background = mix(originalBg, mapped, factor);
      paintedBg.set(el, background);
      const labelSeed = fill ? fill.label : roleTextPrimary;
      const color = blendedText(orig.fg, background, labelSeed, factor, false);
      out.push(
        `[${ATTR}="${id}"] { background-color: ${background} !important; background-image: none !important; color: ${color} !important; text-shadow: none !important; }`,
      );
    }

    // Resolve the effective background for an element: nearest ancestor-or-self
    // that pass 1 painted (in THIS subtree), else the base background.
    const effectiveBg = (el: HTMLElement): string => {
      let cursor: HTMLElement | null = el;
      while (cursor) {
        const bg = paintedBg.get(cursor);
        if (bg) {
          return bg;
        }
        cursor = cursor.parentElement;
      }
      return baseBackground;
    };

    // PASS 2 — text (ALWAYS, regardless of intensity). Enforce AA against the
    // EFFECTIVE rendered background behind the text.
    for (const el of els) {
      if (isSkippable(el)) {
        continue;
      }
      // Surfaces already emitted their own (AA) text color in pass 1; don't
      // also emit a text-only rule for them.
      if (paintedBg.has(el)) {
        continue;
      }
      // Detect against the ORIGINAL text color, not our themed output.
      const origFg = originalStyleOf(el).fg;
      const fgRgb = parseColor(origFg ?? "");
      if (!fgRgb) {
        continue;
      }
      // Only bother with elements that actually hold their own text content.
      let hasText = false;
      for (let i = 0; i < el.childNodes.length; i += 1) {
        const cn = el.childNodes[i];
        if (cn.nodeType === 3 && (cn.textContent || "").trim().length > 0) {
          hasText = true;
          break;
        }
      }
      if (!hasText) {
        continue;
      }
      // Reuse the element's stable id if already tagged; otherwise assign one.
      let id = el.getAttribute(ATTR);
      if (id === null) {
        id = String(w.__themeMakerNextId as number);
        w.__themeMakerNextId = (w.__themeMakerNextId as number) + 1;
        w.__themeMakerWriting = true;
        el.setAttribute(ATTR, id);
        w.__themeMakerWriting = false;
      }
      const effBg = effectiveBg(el);
      // Role-aware seed: link/heading/subheading/muted/body each pull their own
      // palette slot, so multi-hue palettes spend the whole harmony — AA-nudged
      // (hue-preserving) against the effective rendered background.
      const ts = textSeedFor(el);
      const color = blendedText(origFg, effBg, ts.seed, factor, ts.large);
      out.push(
        `[${ATTR}="${id}"] { color: ${color} !important; text-shadow: none !important; }`,
      );
    }

    return out;
  };

  // ---- assemble the full CSS FIRST (no themeless gap) ---------------------
  const cssParts: string[] = [];
  if (varDecls.length > 0) {
    cssParts.push(`:root { ${varDecls.join(" ")} }`);
  }
  // html + body are ALWAYS themed as the base surface.
  cssParts.push(
    `html { background-color: ${baseBackground} !important; background-image: none !important; color: ${baseText} !important; }`,
    `body { background-color: ${baseBackground} !important; background-image: none !important; color: ${baseText} !important; }`,
  );
  if (document.body) {
    for (const rule of processSubtree(document.body)) {
      cssParts.push(rule);
    }
  }
  const css = cssParts.join("\n");

  // ---- write the single <style id="themeMaker"> IN PLACE ------------------
  // Create only if missing; otherwise overwrite textContent — never
  // remove-then-append, so there is no themeless frame (no flash).
  const head = document.querySelector("head") || document.documentElement;
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    w.__themeMakerWriting = true;
    head.appendChild(style);
    w.__themeMakerWriting = false;
  }
  style.textContent = css;

  // ---- MutationObserver: INCREMENTAL + debounced re-theme -----------------
  if (w.__themeMakerObserver) {
    w.__themeMakerObserver.disconnect();
  }
  w.__themeMakerArgs = [palette, options];

  const styleEl = style;
  let pending: HTMLElement[] = [];
  let scheduled = false;

  const flush = (): void => {
    scheduled = false;
    const obs = w.__themeMakerObserver;
    if (obs) {
      obs.disconnect();
    }
    const additions: string[] = [];
    for (const el of pending) {
      if (!el.isConnected) {
        continue;
      }
      for (const rule of processSubtree(el)) {
        additions.push(rule);
      }
    }
    pending = [];
    if (additions.length > 0) {
      // Append to the EXISTING style — never re-walk the whole document.
      w.__themeMakerWriting = true;
      styleEl.textContent = `${styleEl.textContent ?? ""}\n${additions.join("\n")}`;
      w.__themeMakerWriting = false;
    }
    if (obs && document.body) {
      obs.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }
  };

  const schedule = (): void => {
    if (scheduled) {
      return;
    }
    scheduled = true;
    const ric = (
      window as unknown as { requestIdleCallback?: (cb: () => void) => void }
    ).requestIdleCallback;
    if (ric) {
      ric(flush);
    } else {
      setTimeout(flush, 200);
    }
  };

  const observer = new MutationObserver((mutations) => {
    // Ignore mutations caused by our OWN style/attribute writes.
    if (w.__themeMakerWriting) {
      return;
    }
    let queued = false;
    for (const mm of mutations) {
      if (mm.type !== "childList") {
        continue;
      }
      mm.addedNodes.forEach((n) => {
        if (!(n instanceof HTMLElement)) {
          return;
        }
        // Skip our own <style> element.
        if (n.id === STYLE_ID) {
          return;
        }
        pending.push(n);
        queued = true;
      });
    }
    if (queued) {
      schedule();
    }
  });
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  }
  w.__themeMakerObserver = observer;

  return true;
}
