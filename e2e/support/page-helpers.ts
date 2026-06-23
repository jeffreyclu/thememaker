/**
 * Page-side helpers, executed via `page.evaluate` in the REAL browser so they see
 * the actual rendered/computed styles after the engine has run.
 *
 * The contrast math is the canonical WCAG 2.x relative-luminance formula — the
 * same one the engine enforces — recomputed INDEPENDENTLY here from the browser's
 * own `getComputedStyle`. That independence is the point: the spec must verify
 * readability against what the browser actually renders, not trust the engine.
 */
import type { Page } from "@playwright/test";

export interface ContrastSample {
  selector: string;
  color: string;
  background: string;
  ratio: number;
  /** AA threshold that applies (3 for large text, else 4.5). */
  threshold: number;
  passes: boolean;
  large: boolean;
}

/**
 * Samples each selector's text color vs. its EFFECTIVE background (walking up the
 * ancestor chain past transparent backgrounds, falling back to the body), and
 * computes the WCAG contrast ratio + whether it meets AA. Runs entirely in-page.
 */
export const sampleContrast = (
  page: Page,
  selectors: string[],
): Promise<ContrastSample[]> =>
  page.evaluate((sels: string[]) => {
    const parse = (input: string): [number, number, number, number] | null => {
      const s = (input || "").trim().toLowerCase();
      if (!s || s === "transparent") {
        return null;
      }
      const m = s.match(
        /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/,
      );
      if (m) {
        const a = m[4] === undefined ? 1 : parseFloat(m[4]);
        return [Number(m[1]), Number(m[2]), Number(m[3]), a];
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
        return [
          parseInt(h.slice(0, 2), 16),
          parseInt(h.slice(2, 4), 16),
          parseInt(h.slice(4, 6), 16),
          1,
        ];
      }
      return null;
    };

    const linear = (c: number): number => {
      const x = c / 255;
      return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    };
    const lum = (rgb: [number, number, number]): number =>
      0.2126 * linear(rgb[0]) +
      0.7152 * linear(rgb[1]) +
      0.0722 * linear(rgb[2]);
    const ratio = (
      a: [number, number, number],
      b: [number, number, number],
    ): number => {
      const la = lum(a);
      const lb = lum(b);
      const hi = Math.max(la, lb);
      const lo = Math.min(la, lb);
      return (hi + 0.05) / (lo + 0.05);
    };

    /** Effective background: first opaque background up the ancestor chain. */
    const effectiveBg = (el: Element): [number, number, number] => {
      let cursor: Element | null = el;
      while (cursor) {
        const bg = parse(getComputedStyle(cursor).backgroundColor);
        if (bg && bg[3] > 0) {
          return [bg[0], bg[1], bg[2]];
        }
        cursor = cursor.parentElement;
      }
      // Default browser canvas is white.
      return [255, 255, 255];
    };

    /** Large text per WCAG: >=24px, or >=18.66px (14pt) when bold. */
    const isLarge = (el: Element): boolean => {
      const cs = getComputedStyle(el);
      const px = parseFloat(cs.fontSize);
      const weight = parseInt(cs.fontWeight, 10) || 400;
      return px >= 24 || (px >= 18.66 && weight >= 700);
    };

    interface ContrastSampleRaw {
      selector: string;
      color: string;
      background: string;
      ratio: number;
      threshold: number;
      passes: boolean;
      large: boolean;
    }
    const out: ContrastSampleRaw[] = [];

    for (const sel of sels) {
      const el = document.querySelector(sel);
      if (!el) {
        continue;
      }
      const fg = parse(getComputedStyle(el).color);
      if (!fg) {
        continue;
      }
      const fgRgb: [number, number, number] = [fg[0], fg[1], fg[2]];
      const bgRgb = effectiveBg(el);
      const large = isLarge(el);
      const r = ratio(fgRgb, bgRgb);
      const threshold = large ? 3 : 4.5;
      out.push({
        selector: sel,
        color: `rgb(${fgRgb.join(", ")})`,
        background: `rgb(${bgRgb.join(", ")})`,
        ratio: Math.round(r * 100) / 100,
        threshold,
        passes: r >= threshold - 0.05, // tiny epsilon for rounding at the boundary
        large,
      });
    }
    return out;
  }, selectors);

/** Reads the computed `background-color` of an element (default `body`). */
export const backgroundColorOf = (
  page: Page,
  selector = "body",
): Promise<string> =>
  page.evaluate(
    (sel: string) =>
      getComputedStyle(document.querySelector(sel)!).backgroundColor,
    selector,
  );

/** Counts the Thememaker `<style id="themeMaker">` elements present. */
export const themeStyleCount = (page: Page): Promise<number> =>
  page.evaluate(() => document.querySelectorAll("style#themeMaker").length);

/** Reads a resolved `:root` CSS custom property value (computed). */
export const rootVar = (page: Page, name: string): Promise<string> =>
  page.evaluate(
    (n: string) =>
      getComputedStyle(document.documentElement).getPropertyValue(n).trim(),
    name,
  );
