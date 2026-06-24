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

/**
 * Samples the computed `background-color` of EVERY element matching `selector`,
 * in DOM order. Used to assert a virtualized list's row SURFACE backgrounds are
 * all the SAME themed color (no "2 colors", none left un-themed).
 */
export const backgroundColorsOf = (
  page: Page,
  selector: string,
): Promise<string[]> =>
  page.evaluate(
    (sel: string) =>
      Array.from(document.querySelectorAll(sel)).map(
        (el) => getComputedStyle(el).backgroundColor,
      ),
    selector,
  );

/**
 * Samples the EFFECTIVE rendered background of EVERY element matching `selector`
 * — the first OPAQUE background walking up the ancestor chain (incl. self). This
 * is the color the user actually SEES behind the element: a themed surface for an
 * opaque row, or the themed backdrop a TRANSPARENT row inherits (so a transparent
 * row reads as themed, not "light"). Returns `rgb(r, g, b)` strings in DOM order.
 */
export const effectiveBackgroundsOf = (
  page: Page,
  selector: string,
): Promise<string[]> =>
  page.evaluate((sel: string) => {
    const parse = (input: string): [number, number, number] | null => {
      const s = (input || "").trim().toLowerCase();
      if (!s || s === "transparent") {
        return null;
      }
      const m = s.match(
        /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/,
      );
      if (m) {
        const a = m[4] === undefined ? 1 : parseFloat(m[4]);
        if (a === 0) {
          return null; // fully transparent → keep walking up
        }
        return [Number(m[1]), Number(m[2]), Number(m[3])];
      }
      return null;
    };
    const effectiveBg = (el: Element): [number, number, number] => {
      let cursor: Element | null = el;
      while (cursor) {
        const bg = parse(getComputedStyle(cursor).backgroundColor);
        if (bg) {
          return bg;
        }
        cursor = cursor.parentElement;
      }
      return [255, 255, 255];
    };
    return Array.from(document.querySelectorAll(sel)).map((el) => {
      const bg = effectiveBg(el);
      return `rgb(${bg[0]}, ${bg[1]}, ${bg[2]})`;
    });
  }, selector);

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

/** Reads the computed `color` (text color) of an element. */
export const textColorOf = (page: Page, selector: string): Promise<string> =>
  page.evaluate((sel: string) => {
    const el = document.querySelector(sel);
    return el ? getComputedStyle(el).color : "";
  }, selector);

/**
 * Samples the computed text color of EVERY element matching `selector`, in DOM
 * order. Used to assert a churny list's row colors are stable / identical.
 */
export const textColorsOf = (page: Page, selector: string): Promise<string[]> =>
  page.evaluate(
    (sel: string) =>
      Array.from(document.querySelectorAll(sel)).map(
        (el) => getComputedStyle(el).color,
      ),
    selector,
  );

/**
 * Computes the WCAG contrast ratio of one element's text color against its OWN
 * computed (rendered) background — NOT walking up the ancestor chain. This is
 * what a class-driven row-bg swap actually changes, so it is the right bg to
 * verify a hover/selected row against. Returns the ratio + the colors used.
 */
export interface SelfBgContrast {
  selector: string;
  color: string;
  background: string;
  ratio: number;
}
export const contrastAgainstOwnBg = (
  page: Page,
  selector: string,
): Promise<SelfBgContrast[]> =>
  page.evaluate((sel: string) => {
    const parse = (input: string): [number, number, number] | null => {
      const s = (input || "").trim().toLowerCase();
      if (!s || s === "transparent") {
        return null;
      }
      const m = s.match(
        /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/,
      );
      if (m) {
        const a = m[4] === undefined ? 1 : parseFloat(m[4]);
        if (a === 0) {
          return null;
        }
        return [Number(m[1]), Number(m[2]), Number(m[3])];
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
    /** First opaque background up the ancestor chain (incl. self). */
    const effectiveBg = (el: Element): [number, number, number] => {
      let cursor: Element | null = el;
      while (cursor) {
        const bg = parse(getComputedStyle(cursor).backgroundColor);
        if (bg) {
          return bg;
        }
        cursor = cursor.parentElement;
      }
      return [255, 255, 255];
    };
    return Array.from(document.querySelectorAll(sel)).map((el) => {
      const fg = parse(getComputedStyle(el).color) ?? [0, 0, 0];
      const bg = effectiveBg(el);
      return {
        selector: sel,
        color: `rgb(${fg.join(", ")})`,
        background: `rgb(${bg.join(", ")})`,
        ratio: Math.round(ratio(fg, bg) * 100) / 100,
      };
    });
  }, selector);

/**
 * Waits for the engine's debounced MutationObserver to settle: the engine
 * coalesces a burst of DOM mutations into ONE re-theme ~250ms after the last
 * mutation. We poll the engine's <style> textContent until it stops changing for
 * a few consecutive frames, so assertions run on a quiesced page.
 */
export const waitForThemeSettled = async (page: Page): Promise<void> => {
  await page.waitForFunction(
    () => {
      const w = window as unknown as {
        __tmLastCss?: string;
        __tmStable?: number;
      };
      const css =
        document.getElementById("themeMaker")?.textContent ?? "__none__";
      if (css === w.__tmLastCss) {
        w.__tmStable = (w.__tmStable ?? 0) + 1;
      } else {
        w.__tmStable = 0;
        w.__tmLastCss = css;
      }
      // Stable across enough polls (~5 * 100ms = 500ms > the 250ms debounce).
      return (w.__tmStable ?? 0) >= 5;
    },
    undefined,
    { timeout: 15_000, polling: 100 },
  );
  // Clear the probe state so a later call to this helper starts fresh.
  await page.evaluate(() => {
    const w = window as unknown as {
      __tmLastCss?: string;
      __tmStable?: number;
    };
    w.__tmLastCss = undefined;
    w.__tmStable = undefined;
  });
};
