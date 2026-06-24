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
 * `applyAdaptiveScheme` is the v2 engine's in-page entry point. It inspects the
 * live page (`getComputedStyle`, `:root` custom properties) and themes it as a
 * "DJ mixer": every themed color = `mix(frozenOriginal, fixedTheme, factor)`,
 * `factor = intensity/100`.
 *
 *  - TRACK 2 (`fixedTheme`) is a PURE FUNCTION OF THE ELEMENT'S ROLE / STRUCTURE,
 *    never of its original color. Generic surfaces → ONE fixed palette surface
 *    (`roles.surface`); semantic surfaces (card/code/banner/button via a
 *    `data-tm-surf` token) → their fixed distinct role colors; text → role colors
 *    delivered by ROOT-SCOPED tag rules. THIS is the SPA fix: on pages that
 *    recycle DOM nodes / swap row backgrounds, the theme color no longer changes
 *    with the (volatile) original bg, so identical rows share one color and a
 *    recycled node never drifts.
 *  - TRACK 1 (`frozenOriginal`) is each surface's original bg captured ONCE in a
 *    WeakMap and FROZEN; it feeds ONLY the crossfade blend, never the theme-color
 *    choice. A tagged element is never re-themed.
 *  - SURFACES are repainted PER ELEMENT (each frozen-original blend differs below
 *    100%), computed once and frozen. TEXT is NOT per-element: role colors are
 *    emitted ONCE as ROOT-SCOPED tag rules (+ per-surface scoped variants), so a
 *    newly created/typed node is the correct color the instant it exists.
 *
 * It always themes `<html>` + `<body>` as the base surface, enforces WCAG AA on
 * every text/surface pair against the FIXED reference surface, writes the single
 * `<style id="themeMaker">` IN PLACE (no themeless gap → no flash), and installs
 * an INCREMENTAL, debounced, TIME-SLICED `MutationObserver` for SPA/lazy content.
 *
 * This is the SINGLE source of truth for the adaptive mapping/role algorithm —
 * it must be self-contained (serialized payload, no imports), so the algorithm
 * lives here and nowhere else. It is tested DIRECTLY via `tests/inject.test.ts`
 * (DOM apply under jsdom), `tests/overrides.test.ts`, and the Playwright e2e
 * specs. The pure COLOR math (hex/hsl/contrast/AA) is necessarily hand-ported
 * from the canonical `src/lib/color.ts` (the popup/palette path's tested copy),
 * because this payload cannot import it; a contrast change must be made in both
 * deliberately.
 */
import { isHexColor, normalizeHex } from "./color";
import type { Palette } from "./palette";
import type { ApplyOptions } from "../types";

/** The id of the <style> element Thememaker owns on the page. */
export const STYLE_ELEMENT_ID = "themeMaker";

/**
 * Namespaced `localStorage` key under which we cache the EXACT base background
 * the engine painted onto html/body for THIS origin. The content script reads it
 * SYNCHRONOUSLY at `document_start` — before any async `chrome.storage` read —
 * to paint the themed base on the very first frame, eliminating the reload
 * flash. Kept in sync with the inlined string literal inside `applyAdaptiveScheme`
 * / `removeSchemeStyle` (those are serialized and can't reference this constant).
 */
export const BASE_CACHE_KEY = "__thememaker_base__";

/**
 * The themed page background (html/body base surface) a palette resolves to when
 * the page has NO own body background — which is the common case: a default page
 * body's computed `background-color` is transparent, so the engine's base blend
 * `mix(originalBodyBg, themedBase, factor)` returns `themedBase` in full (mixing
 * from an unparseable/transparent source yields the destination). So the engine
 * paints `roles.bg` (the theme's page color) directly, and this returns exactly
 * that. Used as the FALLBACK early paint when no per-origin cache exists yet
 * (first themed load); once the engine runs it caches the EXACT resolved base,
 * so later loads read that instead and the early paint matches the final paint.
 *
 * `options` is accepted for signature stability (the base equals `roles.bg`
 * regardless of intensity for a transparent body) and future use.
 *
 * Importable (bundled, NOT serialized): it may use the canonical color core.
 */
export const baseBackgroundFor = (
  palette: Palette,
  options: ApplyOptions,
): string => {
  const surfaces = palette.surfaces ?? [];
  // A `bg` override recolors the page base, so the early paint must honor it too
  // (otherwise the first frame flashes the generated base before the engine
  // repaints with the override).
  const overrideBg = options.overrides?.bg;
  if (overrideBg && isHexColor(overrideBg)) {
    return normalizeHex(overrideBg);
  }
  return palette.roles?.bg ?? surfaces[surfaces.length - 1] ?? "#808080";
};

/**
 * Reads the cached base background hex for the current origin from the page's
 * own `localStorage` (synchronous, same-origin). Returns `null` when absent or
 * when `localStorage` is unavailable / throws (private-mode, blocked, etc.).
 */
export const readBaseCache = (): string | null => {
  try {
    return window.localStorage.getItem(BASE_CACHE_KEY);
  } catch {
    return null;
  }
};

/** Caches `hex` as this origin's base background. Silent on any failure. */
export const writeBaseCache = (hex: string): void => {
  try {
    window.localStorage.setItem(BASE_CACHE_KEY, hex);
  } catch {
    // localStorage unavailable / quota / blocked — early paint just won't have
    // a cache next load; not fatal.
  }
};

/** Clears this origin's cached base so a reset/disabled site won't early-paint. */
export const clearBaseCache = (): void => {
  try {
    window.localStorage.removeItem(BASE_CACHE_KEY);
  } catch {
    // ignore
  }
};

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
    __themeMakerDone?: unknown;
    __themeMakerThemedCount?: unknown;
    __themeMakerCapped?: unknown;
  };
  if (w.__themeMakerObserver) {
    w.__themeMakerObserver.disconnect();
    w.__themeMakerObserver = undefined;
  }
  w.__themeMakerArgs = undefined;
  w.__themeMakerNextId = undefined;
  // Drop the frozen-original cache so a fresh apply re-captures true originals.
  w.__themeMakerOriginals = undefined;
  // Drop the per-apply walk state (done-set, themed counter, cap flag).
  w.__themeMakerDone = undefined;
  w.__themeMakerThemedCount = undefined;
  w.__themeMakerCapped = undefined;
  // Clear the cached base background so a reset/disabled site does NOT
  // early-paint a stale theme on its next load. Inlined (self-contained) key,
  // kept in sync with BASE_CACHE_KEY. Best-effort.
  try {
    window.localStorage.removeItem("__thememaker_base__");
  } catch {
    // localStorage unavailable — nothing to clear.
  }
  // Drop the per-tag override layer too.
  document.getElementById("themeMakerOverrides")?.remove();
  // Remove the ROOT MARKER from <html> so no stale role-text rules could match.
  document.documentElement.removeAttribute("data-thememaker");
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
 * detection, mapping, and contrast enforcement are inlined here. This IS the
 * canonical mapping/role algorithm (tested via `tests/inject.test.ts` + e2e);
 * only the pure color math mirrors `color.ts` (which carries its own tests).
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

  // Shared core for `ensureContrast`/`nudgeToAA` below: relight `color`
  // (preserving hue + saturation) to the nearest lightness that meets AA against
  // `bg`, walking both directions and preferring the smaller move. Defers to
  // `onFail()` only when no shade of the hue reaches AA. (Mirrors `relightToAA`
  // in src/lib/color.ts; inlined because this payload can't import.)
  const relightToAA = (
    color: string,
    bg: string,
    large: boolean,
    onFail: () => string,
  ): string => {
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
    return onFail();
  };

  const ensureContrast = (text: string, bg: string, large: boolean): string =>
    relightToAA(text, bg, large, () =>
      contrast("#000000", bg) >= contrast("#ffffff", bg)
        ? "#000000"
        : "#ffffff",
    );

  // Nudge a color to the NEAREST shade of ITS OWN hue that meets AA against bg
  // (preserving hue + saturation), only falling back to black/white when no
  // shade of the hue can reach AA. This is the anti-monochrome contrast path:
  // a colorful accent (link/heading/button) stays its color, just relit. Port
  // of `nudgeToAA` in src/lib/color.ts.
  const nudgeToAA = (color: string, bg: string, large: boolean): string =>
    relightToAA(color, bg, large, () => ensureContrast(color, bg, large));

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

  // ---- palette accessors ---------------------------------------------------
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
  const baseRoles = (palette.roles || {}) as Partial<{
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
  // ---- custom-theme overrides (role key → hex) ----------------------------
  // Layer the user's picked colors on top of the generated roles. Invalid keys
  // or non-hex values are ignored. Each overridden color is still passed through
  // the SAME AA floor downstream (`blendedText` / `nudgeToAA` for text, and
  // surfaces re-floor their label), so an override is exact unless unreadable.
  // Role-keyed overrides (keys matching a PaletteRoles property) land here; the
  // `<tag>|<prop>` keys are handled by the override CSS layer further below.
  const overrides = options.overrides || {};
  const roles: typeof baseRoles = { ...baseRoles };
  for (const k of Object.keys(overrides)) {
    const v = overrides[k];
    if (k in roles && parseColor(v)) {
      const rgb = parseColor(v) as [number, number, number];
      (roles as Record<string, string>)[k] = toHex(rgb);
    }
  }
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

  // DETERMINISTIC text color from a ROLE SEED, floored for readability against a
  // DETERMINISTIC reference background (`refBg`). The result is a pure function of
  // (seed, refBg, large): it does NOT depend on the element's current/original
  // color, on the intensity dial, or on the LIVE painted ancestor bg — which is
  // what made text FLICKER / drift on churny SPAs. The intensity slider crossfades
  // BACKGROUNDS only; text stays at this stable, readable role color across ALL
  // intensities. `nudgeToAA` returns the seed UNCHANGED when already readable, else
  // nudges to the nearest readable shade of the SAME hue.
  const roleText = (seed: string, refBg: string, large: boolean): string =>
    nudgeToAA(seed, refBg, large);

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
    // The RENDERED (blended) value each surface var becomes — that is what a
    // var-driven element actually paints behind its text. Floor every text/border
    // var against the LIGHTEST of these (the worst case for dark-ish ink), so a
    // remapped link/heading/body is AA against WHICHEVER surface var it lands on
    // (e.g. a link inside a card on `--surface`, not just the page `--bg`).
    const renderedSurface = (val: string): string =>
      mix(val, surfaceFor(bucketOf(val)), factor);
    let floorSurface = themedBase;
    let floorLum = -1;
    for (const v of detectedVars) {
      if (v.role === "surface") {
        const rendered = renderedSurface(v.value);
        const l = lumOfHex(rendered);
        if (l > floorLum) {
          floorLum = l;
          floorSurface = rendered;
        }
      }
    }
    for (const v of detectedVars) {
      if (v.role === "surface") {
        // Blend each surface var from its ORIGINAL value toward the mapped one.
        const mapped = surfaceFor(bucketOf(v.value));
        varDecls.push(`${v.name}: ${mix(v.value, mapped, factor)} !important;`);
      } else if (v.role === "text") {
        // Route text vars to the matching ROLE color so heading/link vars carry
        // their own accent hue (not all one seed), then AA-nudge against the
        // lightest RENDERED surface (hue-preserving) so it is readable on any of
        // the page's remapped surfaces.
        const n = v.name.toLowerCase();
        const seed = /heading|title/.test(n)
          ? roleHeading
          : /link|anchor/.test(n)
            ? roleLink
            : /muted|secondary|subtle/.test(n)
              ? roleTextSecondary
              : roleTextPrimary;
        varDecls.push(
          `${v.name}: ${roleText(seed, floorSurface, false)} !important;`,
        );
      } else if (v.role === "border") {
        const mapped = nudgeToAA(roleBorder, floorSurface, true);
        varDecls.push(`${v.name}: ${mix(v.value, mapped, factor)} !important;`);
      }
    }
  }

  // ---- per-apply + persistent engine state (shared with the observer) -----
  // `bgImage` is the element's FROZEN original computed `background-image` — used
  // to PRESERVE real image backgrounds (carousel photos, hero/banner art, sprites)
  // instead of painting a solid color over them.
  type OriginalStyle = {
    bg: string | null;
    fg: string | null;
    bgImage: string | null;
  };
  const w = window as unknown as {
    __themeMakerObserver?: MutationObserver;
    __themeMakerArgs?: [Palette, ApplyOptions];
    __themeMakerNextId?: number;
    /** TRACK 1: each surface's FROZEN original bg/fg, captured once. */
    __themeMakerOriginals?: WeakMap<Element, OriginalStyle>;
    /** Surfaces already TAGGED + frozen — never re-walk/re-theme them. */
    __themeMakerDone?: WeakSet<Element>;
    /** Running total of themed surfaces (for the MAX_THEMED budget). */
    __themeMakerThemedCount?: number;
    /** Set once we hit MAX_THEMED, so we warn only once. */
    __themeMakerCapped?: boolean;
  };

  // Monotonic id counter — NEVER reset to 0 (so incremental observer rules
  // don't collide with / strand earlier ones).
  if (typeof w.__themeMakerNextId !== "number") {
    w.__themeMakerNextId = 0;
  }

  // TRACK 1 — the FROZEN-ORIGINAL cache. Each surface's original bg is captured
  // the FIRST time we see it and FROZEN: it feeds ONLY the crossfade blend, never
  // the theme-color choice. Persisting it across applies keeps re-apply idempotent
  // (once our <style> is live, getComputedStyle returns OUR themed colors, so we
  // must blend from the cached original, not re-read drifted values).
  if (!w.__themeMakerOriginals) {
    w.__themeMakerOriginals = new WeakMap<Element, OriginalStyle>();
  }
  const originals = w.__themeMakerOriginals;

  // Set of surfaces ALREADY tagged + emitted into the CURRENT stylesheet. The
  // OBSERVER path uses it to skip already-themed nodes (a re-added subtree is a
  // cheap no-op). An explicit `applyAdaptiveScheme` call REBUILDS the sheet from
  // scratch (slider drags / new themes must recolor everything), so we RESET this
  // set + counter + style content per apply below. `originals` + monotonic
  // `nextId` persist across applies (true frozen state).
  w.__themeMakerDone = new WeakSet<Element>();
  const doneSet = w.__themeMakerDone;
  w.__themeMakerThemedCount = 0;
  w.__themeMakerCapped = false;

  /**
   * Returns an element's FROZEN ORIGINAL bg/fg, capturing it once. On the very
   * first sighting the live computed style IS the original; afterwards we read the
   * cached value so detection never sees our own themed output (idempotent).
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
      bgImage: cs.backgroundImage || null,
    };
    originals.set(el, captured);
    return captured;
  };

  // A computed `background-image` is a REAL image asset to PRESERVE when it
  // contains a `url(...)` (a raster/SVG/sprite/photo). Pure gradients (`linear-`/
  // `radial-`/`conic-gradient`, with no `url(`) are decorative and safe to replace
  // with the themed solid, so they are NOT treated as preserve-worthy. `none` and
  // empty are not images.
  const hasImageBackground = (bgImage: string | null): boolean => {
    if (!bgImage) {
      return false;
    }
    const s = bgImage.trim().toLowerCase();
    if (s === "none" || s === "") {
      return false;
    }
    return s.includes("url(");
  };

  // Base surface (html/body): ALWAYS painted, crossfaded from the page's FROZEN
  // ORIGINAL body background toward the themed base by the intensity factor.
  const bodyOriginal = document.body
    ? originalStyleOf(document.body)
    : { bg: null, fg: null, bgImage: null };
  const baseBackground = mix(bodyOriginal.bg || "#ffffff", themedBase, factor);
  // Cache the EXACT resolved base for this origin in the page's own
  // localStorage, so the content script can synchronously paint it at
  // document_start on the NEXT load (before any async chrome.storage read) and
  // eliminate the reload flash. Inlined (self-contained) string literal kept in
  // sync with BASE_CACHE_KEY. Best-effort: silent if localStorage is blocked.
  try {
    window.localStorage.setItem("__thememaker_base__", baseBackground);
  } catch {
    // localStorage unavailable — no early-paint cache next load; not fatal.
  }
  // Page base ink carries the faintly-tinted body (textPrimary) slot. Floored
  // against the DETERMINISTIC base surface (`themedBase` = roles.bg), NOT the
  // blended `baseBackground`, so the base text color is identical at every
  // intensity / re-apply / reload (stability-first).
  const baseText = roleText(roleTextPrimary, themedBase, false);

  // ---- semantic SURFACE classification ------------------------------------
  // Surfaces are classified by tag/class into roles (code/card/banner/comp/
  // button) that pull dedicated palette slots. TEXT role classification now lives
  // in the ROOT-SCOPED tag rules emitted in the base CSS (not here), so the walk
  // only ever touches surfaces.
  const CODE_TAGS = " pre code kbd samp ";
  const CARD_TAGS =
    " article section figure dialog details fieldset blockquote ";
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

  /** primaryButton | secondaryButton — see `classifyButton` below. */
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

  // The DETERMINISTIC tinted bg of each tinted SEMANTIC surface role — the scoped
  // role-text rules floor text inside such a surface against THESE.
  const bannerBg = mix(roleHeading, themedBase, 0.86);
  const complementaryBg = mix(roleLink, themedBase, 0.86);
  // Surface scope tokens → the DETERMINISTIC reference bg the scoped text rules
  // floor against. Tinted SEMANTIC surfaces (card/code/banner/comp) carry a token
  // so text inside them floors against THAT surface (AA + colorful). Generic
  // surfaces are NOT tokenized (their text uses the page-level role rules, floored
  // against the page base — `roleSurface` is close to `bg`, so AA holds).
  const SURFACE_ROLE_BG: Record<string, string> = {
    card: roleSurface,
    code: roleSurfaceAlt,
    banner: bannerBg,
    comp: complementaryBg,
  };

  /**
   * The surface FIXED-THEME fill + label seed + a short `data-tm-surf` token for
   * an element. THE CORE FIX: every surface's `bg` is a PURE FUNCTION OF ITS ROLE
   * — buttons → primary/secondary; code/card/banner/comp → their tinted slots;
   * generic surfaces → the ONE fixed `roleSurface`. It is NEVER derived from the
   * element's original-bg luminance, so recycled/restyled nodes and identical rows
   * share one theme color. Total (never null): a generic surface is a first-class
   * role. Buttons carry no token (their content is a label, not document text).
   */
  const surfaceFillFor = (
    el: HTMLElement,
  ): { bg: string; label: string; surf?: string } => {
    const tag = el.tagName.toLowerCase();
    if (isButtonLike(el)) {
      return classifyButton(el) === "primary"
        ? { bg: rolePrimary, label: roleOnPrimary }
        : { bg: roleSecondary, label: roleOnSecondary };
    }
    if (CODE_TAGS.indexOf(` ${tag} `) >= 0) {
      return { bg: roleSurfaceAlt, label: roleTextPrimary, surf: "code" };
    }
    if (BANNER_TAGS.indexOf(` ${tag} `) >= 0) {
      // Header/nav get their OWN hued surface tint (heading hue → bg).
      return { bg: bannerBg, label: roleTextPrimary, surf: "banner" };
    }
    if (COMPLEMENTARY_TAGS.indexOf(` ${tag} `) >= 0) {
      // Aside/footer get a different hued tint (link hue → bg).
      return { bg: complementaryBg, label: roleTextPrimary, surf: "comp" };
    }
    if (CARD_TAGS.indexOf(` ${tag} `) >= 0) {
      return { bg: roleSurface, label: roleTextPrimary, surf: "card" };
    }
    // GENERIC surface → the ONE fixed role surface (decoupled from original bg).
    return { bg: roleSurface, label: roleTextPrimary };
  };

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

  // Editable regions (compose boxes, inputs) must NEVER be re-walked/re-themed:
  // typing churns their subtree on every keystroke, and they inherit the correct
  // text color from their surface/base anyway. Skipping them keeps typing smooth.
  const isEditableRoot = (el: HTMLElement): boolean => {
    const tag = el.tagName.toLowerCase();
    if (tag === "input" || tag === "textarea") {
      return true;
    }
    const ce = el.getAttribute("contenteditable");
    return ce === "" || ce === "true" || ce === "plaintext-only";
  };

  // ---- performance budgets (large + churny DOM safety) --------------------
  // The walk (initial AND incremental) is TIME-SLICED: process elements until a
  // small per-slice budget is spent, then YIELD and resume — so a huge/churny DOM
  // never blocks the main thread in one long synchronous pass. A hard cap bounds
  // total themed surfaces so the <style> + work can't grow without limit.
  const SLICE_BUDGET_MS = 4;
  const MAX_NODES_PER_SLICE = 400;
  const MAX_THEMED = 12000;

  /**
   * TAG + emit the per-element SURFACE rule for ONE element. Returns its CSS rule
   * (or null if it is not a surface / is skipped / capped).
   *
   * SURFACE COLOR = `mix(frozenOriginal, fixedTheme, factor)` — the DJ-mixer
   * crossfade. `fixedTheme` (`fill.bg`) is a PURE FUNCTION OF ROLE (never the
   * original bg), so identical-role surfaces share one theme color and recycled
   * nodes never drift; `frozenOriginal` (captured once) only feeds the blend. The
   * element is tagged once with a stable `[data-thememaker="N"]` id + (for tinted
   * semantic surfaces) a `data-tm-surf` token; once in `doneSet` it is never
   * re-walked. The label color floors against the DETERMINISTIC `fill.bg`, so it
   * is stable + AA at every intensity.
   *
   * TEXT IS NOT COLORED PER-ELEMENT: role colors come from the ROOT-SCOPED tag
   * rules emitted once below, so newly created/typed text is instantly correct.
   */
  const processElement = (el: HTMLElement): string | null => {
    if (doneSet.has(el) || isSkippable(el)) {
      return null;
    }
    // Honor the total themed-surface budget. Past the cap we stop tagging new
    // surfaces (already-themed ones keep their frozen rules). Warn once.
    if ((w.__themeMakerThemedCount as number) >= MAX_THEMED) {
      if (!w.__themeMakerCapped) {
        w.__themeMakerCapped = true;
        try {
          // eslint-disable-next-line no-console
          console.warn(
            `[thememaker] themed-element budget reached (${MAX_THEMED}); ` +
              `further new elements on this page are left un-themed to stay fast.`,
          );
        } catch {
          // console unavailable — ignore.
        }
      }
      return null;
    }

    // Detect against the FROZEN ORIGINAL bg, not our themed output, so re-apply is
    // idempotent. Only elements that own a (non-transparent) background are
    // surfaces; everything else inherits / matches a role tag rule. NON-surfaces
    // are NOT added to `doneSet` — so a node later RECYCLED to own a background
    // (virtualized lists swap a row's bg class) gets themed when re-checked, rather
    // than being permanently stranded white. Only TAGGED SURFACES are frozen.
    const orig = originalStyleOf(el);
    const bgRgb = parseColor(orig.bg ?? "");
    if (!bgRgb) {
      return null;
    }

    // PRESERVE real image backgrounds: if the element's FROZEN original
    // `background-image` is a `url(...)` asset (carousel photo, hero/banner art,
    // sprite), do NOT paint a solid color over it or strip the image. Freeze it
    // (add to `doneSet`) so it is left alone — its text still inherits role colors.
    if (hasImageBackground(orig.bgImage)) {
      doneSet.add(el);
      return null;
    }

    doneSet.add(el);
    w.__themeMakerThemedCount = (w.__themeMakerThemedCount as number) + 1;
    let id = el.getAttribute(ATTR);
    if (id === null) {
      id = String(w.__themeMakerNextId as number);
      w.__themeMakerNextId = (w.__themeMakerNextId as number) + 1;
      el.setAttribute(ATTR, id);
    }
    const frozenOriginal = toHex(bgRgb);
    // FIXED THEME by role (never `bucketOf(frozenOriginal)`); crossfade from the
    // frozen original toward it by the intensity factor.
    const fill = surfaceFillFor(el);
    const background = mix(frozenOriginal, fill.bg, factor);
    // Tag tinted SEMANTIC surfaces (card/code/banner/comp) with their role token
    // so the scoped role-text rules floor text inside them against THIS surface —
    // keeping that text AA + colorful with no per-element text rule. Deterministic.
    if (fill.surf && el.getAttribute("data-tm-surf") !== fill.surf) {
      el.setAttribute("data-tm-surf", fill.surf);
    }
    // The surface sets the inherited body-text color for its subtree, floored
    // against its DETERMINISTIC fixed-theme bg (`fill.bg`) — stable + readable on
    // what it lands on at full theme. Role tags (a/h1/…) still override per role.
    const color = roleText(fill.label, fill.bg, false);
    return `[${ATTR}="${id}"] { background-color: ${background} !important; background-image: none !important; color: ${color} !important; text-shadow: none !important; }`;
  };

  // ---- write the BASE rules IMMEDIATELY (no themeless gap) -----------------
  const baseParts: string[] = [];
  if (varDecls.length > 0) {
    baseParts.push(`:root { ${varDecls.join(" ")} }`);
  }
  baseParts.push(
    `html { background-color: ${baseBackground} !important; background-image: none !important; color: ${baseText} !important; }`,
    `body { background-color: ${baseBackground} !important; background-image: none !important; color: ${baseText} !important; }`,
  );

  // ---- ROLE TEXT as ROOT-SCOPED TAG rules (no per-element text) ------------
  // Text color is delivered by INHERITANCE + these tag/role selectors, emitted
  // ONCE — NOT per element. So any newly-created or typed <p>/<a>/<h1>/… is the
  // right color the instant it exists (no observer round-trip → no per-keystroke
  // flash) and the walk/observer never touch text.
  //
  // SPECIFICITY (the real-SPA fix). Bare tag selectors are (0,0,1), which a site's
  // single-CLASS color (e.g. Gmail's `.Zt{color:…!important}` at (0,1,0)) BEATS.
  // We SCOPE every role rule under a stable ROOT MARKER attribute on <html>
  // (`[data-thememaker]`, set below), lifting page-level rules to (0,1,1) — beating
  // a single site class — while STILL being a descendant selector, so new/typed
  // nodes match instantly. Per-surface variants scope one level deeper (0,2,1).
  // Each rule floors its role seed against a DETERMINISTIC reference surface.
  const ROOT = `[${ATTR}]`;
  // The PAGE-LEVEL role rules must be readable on BOTH the page base AND a generic
  // surface (which lands on `roleSurface`), since an un-tokenized generic
  // container can hold any text. So floor each page-level seed against whichever of
  // {themedBase, roleSurface} gives it LOWER contrast (the harder case) — that
  // makes it AA against both endpoints and every blend between them (a generic
  // surface at any intensity). The per-surface scoped rules floor against their
  // own single fixed surface.
  const harderRef = (seed: string): string => {
    const a = themedBase;
    const b = roleSurface;
    if (a === b) {
      return a;
    }
    return contrast(seed, a) <= contrast(seed, b) ? a : b;
  };
  const roleRulesFor = (
    refFor: (seed: string, large: boolean) => string,
    scope: string,
  ): string[] => {
    const prefix = scope ? `${ROOT} ${scope}` : ROOT;
    const sel = (tags: string): string =>
      tags
        .split(", ")
        .map((t) => `${prefix} ${t}`)
        .join(", ");
    const c = (seed: string, large: boolean): string =>
      roleText(seed, refFor(seed, large), large);
    return [
      `${sel("p, li, td, th, dd, dt, span, div")} { color: ${c(roleTextPrimary, false)} !important; }`,
      `${sel("a")} { color: ${c(roleLink, false)} !important; }`,
      `${sel("h1, h2")} { color: ${c(roleHeading, true)} !important; }`,
      `${sel("h3, h4, h5, h6")} { color: ${c(roleAccent, true)} !important; }`,
      `${sel("small, figcaption, caption, time, label")} { color: ${c(roleTextSecondary, false)} !important; }`,
      `${sel("strong, em, b, i, mark, dfn")} { color: ${c(rolePrimary, false)} !important; }`,
      `${sel("blockquote, q, cite")} { color: ${c(roleSecondary, false)} !important; }`,
    ];
  };
  // Page level (readable on the page base AND any generic surface), then each
  // tinted surface role (floored against THAT fixed surface).
  for (const r of roleRulesFor(harderRef, "")) {
    baseParts.push(r);
  }
  for (const key of Object.keys(SURFACE_ROLE_BG)) {
    const ref = SURFACE_ROLE_BG[key];
    for (const r of roleRulesFor(() => ref, `[data-tm-surf="${key}"]`)) {
      baseParts.push(r);
    }
  }

  // ---- write the single <style id="themeMaker"> IN PLACE ------------------
  const head = document.querySelector("head") || document.documentElement;
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    head.appendChild(style);
  }
  const styleEl = style;
  // Each explicit apply REBUILDS the sheet: start from empty, write base rules,
  // then stream the surface walk in.
  styleEl.textContent = "";
  // ROOT MARKER: a stable presence attribute on <html> that every role-text rule
  // is scoped under, so the engine's text colors clear site single-class
  // specificity. It carries no value, so it never collides with the per-element
  // `[data-thememaker="N"]` surface rules.
  if (!document.documentElement.hasAttribute(ATTR)) {
    document.documentElement.setAttribute(ATTR, "");
  }

  const appendRules = (rules: string[]): void => {
    if (rules.length === 0) {
      return;
    }
    const existing = styleEl.textContent ?? "";
    styleEl.textContent = existing
      ? `${existing}\n${rules.join("\n")}`
      : rules.join("\n");
  };

  // ---- TIME-SLICED walk drainer -------------------------------------------
  const yieldThen = (cb: () => void): void => {
    const ric = (
      window as unknown as {
        requestIdleCallback?: (cb: () => void, opts?: unknown) => void;
      }
    ).requestIdleCallback;
    if (ric) {
      ric(() => cb(), { timeout: 200 });
    } else {
      setTimeout(cb, 16);
    }
  };

  // Each work item is a flattened list of elements (a subtree expanded once) plus
  // a cursor, so we can pause mid-subtree and resume without re-querying the DOM.
  // EDITABLE subtrees are EXCLUDED (typing churns them; their text inherits).
  type WorkItem = { els: HTMLElement[]; i: number };
  const EDITABLE_SEL =
    'input, textarea, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]';
  const expand = (rootEl: HTMLElement): HTMLElement[] => {
    if (isEditableRoot(rootEl)) {
      return [];
    }
    const els: HTMLElement[] = [rootEl];
    const d = rootEl.querySelectorAll<HTMLElement>("*");
    const hasEditable = rootEl.querySelector(EDITABLE_SEL) !== null;
    if (!hasEditable) {
      for (let i = 0; i < d.length; i += 1) {
        els.push(d[i]);
      }
      return els;
    }
    for (let i = 0; i < d.length; i += 1) {
      const el = d[i];
      if (el.closest(EDITABLE_SEL)) {
        continue;
      }
      els.push(el);
    }
    return els;
  };

  let work: WorkItem[] = [];
  let draining = false;

  // Observe childList (new nodes) AND class/style attributes (recycled nodes whose
  // bg changes). Shared by the initial observe + every disconnect/reconnect.
  const OBSERVE_OPTS: MutationObserverInit = {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "style"],
  };

  const now = (): number =>
    typeof performance !== "undefined" && performance.now
      ? performance.now()
      : Date.now();

  const drainQueue = (): void => {
    draining = true;
    const obs = w.__themeMakerObserver;
    // Disconnect while we mutate (attribute + style writes) so our own writes
    // never re-enter the observer queue; reconnect when the slice ends.
    if (obs) {
      obs.disconnect();
    }
    const start = now();
    const rules: string[] = [];
    let processed = 0;
    if ((w.__themeMakerThemedCount as number) >= MAX_THEMED) {
      work = [];
    }
    outer: while (work.length > 0) {
      const item = work[0];
      while (item.i < item.els.length) {
        const rule = processElement(item.els[item.i]);
        item.i += 1;
        processed += 1;
        if (rule !== null) {
          rules.push(rule);
        }
        if (
          processed >= MAX_NODES_PER_SLICE ||
          (processed >= 64 && now() - start >= SLICE_BUDGET_MS)
        ) {
          if (item.i >= item.els.length) {
            work.shift();
          }
          if ((w.__themeMakerThemedCount as number) >= MAX_THEMED) {
            work = [];
          }
          break outer;
        }
      }
      work.shift();
    }
    appendRules(rules);
    if (obs && document.body) {
      obs.observe(document.body, OBSERVE_OPTS);
    }
    draining = false;
    if (work.length > 0) {
      yieldThen(() => {
        if (work.length > 0) {
          drainQueue();
        }
      });
    }
  };

  // Is `el` (even partially) within the current viewport? Theme ABOVE-THE-FOLD
  // content FIRST. In jsdom every rect is 0×0 at (0,0) → in-viewport, so the split
  // is a no-op there (DOM order preserved; unit tests unaffected).
  const vh = (): number =>
    window.innerHeight || document.documentElement.clientHeight || 0;
  const vw = (): number =>
    window.innerWidth || document.documentElement.clientWidth || 0;
  const inViewport = (el: HTMLElement, margin = 0): boolean => {
    let r: DOMRect;
    try {
      r = el.getBoundingClientRect();
    } catch {
      return true;
    }
    const h = vh();
    const w2 = vw();
    if (r.width === 0 && r.height === 0 && r.top === 0 && r.left === 0) {
      return true;
    }
    // `margin` expands the band so content just below the fold (about to scroll
    // into view) is themed BEFORE it paints — fast scroll can't outrun it.
    return (
      r.bottom >= -margin && r.right >= 0 && r.top <= h + margin && r.left <= w2
    );
  };

  const enqueue = (rootEl: HTMLElement, prioritizeViewport = false): void => {
    if (doneSet.has(rootEl) && rootEl.querySelectorAll("*").length === 0) {
      return;
    }
    const els = expand(rootEl);
    if (!prioritizeViewport || els.length < 200) {
      work.push({ els, i: 0 });
      return;
    }
    const visible: HTMLElement[] = [];
    const rest: HTMLElement[] = [];
    for (const el of els) {
      (inViewport(el) ? visible : rest).push(el);
    }
    if (visible.length > 0) {
      work.push({ els: visible, i: 0 });
    }
    if (rest.length > 0) {
      work.push({ els: rest, i: 0 });
    }
  };

  // ---- PRE-PAINT tagging (the anti-flash path for virtualized content) ----
  // A MutationObserver callback is a MICROTASK that runs AFTER nodes are inserted
  // but BEFORE the browser paints that frame. So we SYNCHRONOUSLY theme the
  // newly-added (or recycled) IN-/NEAR-VIEWPORT surfaces RIGHT THERE — they are
  // themed the instant they exist, even during fast scroll, with NO white flash.
  // OFF-SCREEN new nodes (invisible → no flash) and any OVERFLOW past the
  // per-callback cap go to the deferred/idle path, so a huge burst can't jank.
  //
  // VIEWPORT MARGIN: theme a band ~1 viewport beyond the fold, so content about to
  // scroll in is already themed. CAP: bound the synchronous work per callback.
  // Theme a band ~2 viewports beyond the fold so a virtualized grid's pre-rendered
  // overscan rows (just below what's visible) are themed BEFORE they scroll in —
  // 1vh wasn't enough and left ~2 rows of un-themed cards on fast scroll.
  const SYNC_VIEWPORT_MARGIN = (): number => vh() * 2;
  const SYNC_CAP = 600;

  // Process `roots` (added/recycled subtrees) NOW for their in-/near-viewport
  // surfaces, appending their rules synchronously (pre-paint). Returns the
  // OFF-SCREEN / overflow roots that should be handled by the deferred path.
  const processNowInViewport = (roots: HTMLElement[]): HTMLElement[] => {
    const margin = SYNC_VIEWPORT_MARGIN();
    const rules: string[] = [];
    const deferred: HTMLElement[] = [];
    let budget = SYNC_CAP;
    for (const root of roots) {
      // Never theme inside an editable region (typing churns it; its text
      // inherits the right color anyway) — keeps the compose box flicker-free.
      if (root.closest(EDITABLE_SEL)) {
        continue;
      }
      if (budget <= 0) {
        deferred.push(root);
        continue;
      }
      const els = expand(root);
      let anyDeferred = false;
      for (const el of els) {
        if (budget <= 0) {
          anyDeferred = true;
          break;
        }
        if (!inViewport(el, margin)) {
          anyDeferred = true; // off-screen → leave for the deferred walk
          continue;
        }
        const rule = processElement(el);
        budget -= 1;
        if (rule !== null) {
          rules.push(rule);
        }
      }
      // If any element in this subtree was off-screen or hit the cap, re-enqueue
      // the WHOLE subtree to the deferred path; `doneSet` makes the already-themed
      // ones cheap no-ops, so only the leftover (off-screen) surfaces do work.
      if (anyDeferred) {
        deferred.push(root);
      }
    }
    appendRules(rules);
    return deferred;
  };

  // Write the base rules now, then kick off the (time-sliced) surface walk. The
  // first slice runs synchronously inside this call, ABOVE-THE-FOLD first.
  appendRules(baseParts);
  if (document.body) {
    enqueue(document.body, true);
    if (!draining) {
      drainQueue();
    }
  }

  // ---- per-tag custom overrides: a SEPARATE CSS layer ON TOP ---------------
  // `options.overrides` maps `<tag>|<prop>` → exact hex. Emit a sibling
  // <style id="themeMakerOverrides"> AFTER the main one so it wins.
  //  - BACKGROUND on a real tag → `tag[data-thememaker]` (0,1,1) beats the
  //    engine's per-element `[data-thememaker="N"]` (0,1,0).
  //  - TEXT on a real tag → ROOT-SCOPED `[data-thememaker] tag` (mirrors the
  //    engine's role rules) + a per-surface variant, so it TIES the engine's
  //    specificity and WINS by later source order, clearing site single-class.
  //  - `page` → bare `html, body`; html/body → bare tag.
  const OVR_ID = "themeMakerOverrides";
  const ovr = options.overrides || {};
  const ovrKeys = Object.keys(ovr);
  let ovrStyle = document.getElementById(OVR_ID) as HTMLStyleElement | null;
  if (ovrKeys.length === 0) {
    if (ovrStyle) {
      ovrStyle.remove();
    }
  } else {
    const rules: string[] = [];
    for (const key of ovrKeys) {
      const val = ovr[key];
      if (!val || !/^#[0-9a-fA-F]{6}$/.test(val)) {
        continue;
      }
      const bar = key.indexOf("|");
      const tag = (bar >= 0 ? key.slice(0, bar) : key).toLowerCase();
      const prop = bar >= 0 ? key.slice(bar + 1) : "background";
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
        for (const surfKey of ["card", "code", "banner", "comp"]) {
          rules.push(
            `[data-thememaker] [data-tm-surf="${surfKey}"] ${tag}{${cssProp}:${val} !important}`,
          );
        }
      }
    }
    if (!ovrStyle) {
      ovrStyle = document.createElement("style");
      ovrStyle.id = OVR_ID;
    }
    head.appendChild(ovrStyle);
    ovrStyle.textContent = rules.join("\n");
  }

  // ---- MutationObserver: PRE-PAINT in-viewport + DEFERRED off-screen --------
  // The observer callback is a MICROTASK (runs after DOM insertion, BEFORE paint),
  // so it SYNCHRONOUSLY themes the newly-added / recycled IN-VIEWPORT surfaces
  // right there → no white flash on virtualized grids/lists, even during fast
  // scroll. OFF-SCREEN new nodes + any overflow past the per-callback cap are
  // COALESCED into one trailing-edge flush ~250ms after the last mutation
  // (anti-flicker) and streamed through the same time-sliced drainer. We also
  // watch class/style ATTRIBUTE changes so a RECYCLED node (a virtualized list
  // swapping a row's bg class) is re-evaluated — a node that was not a surface but
  // now owns a background gets themed (it was never frozen, only surfaces are).
  const DEBOUNCE_MS = 250;
  if (w.__themeMakerObserver) {
    w.__themeMakerObserver.disconnect();
  }
  w.__themeMakerArgs = [palette, options];

  let pending = new Set<HTMLElement>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  // True when `el` is one of the engine's OWN elements — never re-theme our output.
  const isOwnElement = (el: HTMLElement): boolean =>
    el.id === STYLE_ID ||
    el.id === "themeMakerOverrides" ||
    el.id === "themeMakerEarly";

  const flush = (): void => {
    timer = null;
    for (const el of pending) {
      if (!el.isConnected || isOwnElement(el) || el.closest(EDITABLE_SEL)) {
        continue;
      }
      enqueue(el, true);
    }
    pending = new Set<HTMLElement>();
    if (work.length > 0 && !draining) {
      drainQueue();
    }
  };

  const schedule = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
    }
    timer = setTimeout(flush, DEBOUNCE_MS);
  };

  const observer = new MutationObserver((mutations) => {
    // Collect the roots this batch touched: added subtrees, plus elements whose
    // class/style changed (recycled rows whose bg may now differ). Dedupe.
    const roots = new Set<HTMLElement>();
    // Recycled (attribute-mutated, not-yet-themed) elements whose frozen original
    // must be re-captured from the new live style.
    const recaptured = new Set<HTMLElement>();
    for (const mm of mutations) {
      if (mm.type === "childList") {
        mm.addedNodes.forEach((n) => {
          if (n instanceof HTMLElement && !isOwnElement(n)) {
            roots.add(n);
          }
        });
      } else if (mm.type === "attributes") {
        const t = mm.target;
        if (
          t instanceof HTMLElement &&
          !isOwnElement(t) &&
          // A frozen, already-themed surface never changes color — skip it (this
          // also ignores our OWN attribute writes, which only touch surfaces).
          !doneSet.has(t)
        ) {
          roots.add(t);
          // A class/style swap on a NON-themed element means it was RECYCLED — its
          // original background may now differ (e.g. a transparent row reused as an
          // opaque one). Drop its FROZEN original so it is RE-CAPTURED from the live
          // (new) computed style; otherwise the stale transparent original would
          // keep it classified as a non-surface and it would stay un-themed. Safe:
          // it is not a themed surface, so no idempotent surface state is lost.
          recaptured.add(t);
        }
      }
    }
    if (roots.size === 0) {
      return;
    }
    for (const el of recaptured) {
      originals.delete(el);
    }
    // Disconnect across our synchronous pre-paint writes so they don't re-enter
    // the observer queue; reconnect right after.
    observer.disconnect();
    // PRE-PAINT: theme the in-/near-viewport surfaces NOW (before this frame
    // paints). Defer the off-screen / overflow remainder.
    const rootList = [...roots].filter((el) => el.isConnected);
    const deferred = processNowInViewport(rootList);
    if (document.body) {
      observer.observe(document.body, OBSERVE_OPTS);
    }
    // Off-screen / overflow → the debounced, time-sliced deferred path.
    if (deferred.length > 0) {
      for (const el of deferred) {
        pending.add(el);
      }
      schedule();
    }
  });
  if (document.body) {
    observer.observe(document.body, OBSERVE_OPTS);
  }
  w.__themeMakerObserver = observer;

  return true;
}
