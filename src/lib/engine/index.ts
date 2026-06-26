/**
 * The adaptive theming engine — the `Engine` class, the sole in-page entry point
 * for all page-theming logic.
 *
 * Runs in the content-script isolated world and is pure DOM-in/styles-out (no
 * `chrome.*`). It inspects the live page (`getComputedStyle`, `:root` custom
 * properties) and recolors every themed surface as
 * `mix(frozenOriginal, fixedTheme, factor)`, `factor = intensity/100`.
 *
 *  - `fixedTheme` is a pure function of the element's role/structure, never of its
 *    original color, so recycled SPA nodes never drift.
 *  - `frozenOriginal` is each surface's original bg captured once in the
 *    `originals` WeakMap and frozen; it only feeds the blend.
 *
 * This class is the orchestrator: it owns the page state (the `originals` WeakMap,
 * the `doneSet`, the id/count/cap `state`, the MutationObserver, the `<style>`
 * handle) and the lifecycle (apply / reset / flash). The heavy per-step logic
 * lives in the sub-domains it composes — `roles/` resolves + classifies, `paint/`
 * paints surfaces and runs the time-sliced {@link PaintScheduler}, `dom/` owns the
 * style element + flash. `apply()` and the observer both feed roots to the one
 * scheduler; the observer pre-paints in-viewport nodes synchronously before paint.
 */
import {
  OVERRIDE_STYLE_ID,
  ROOT_MARKER_ATTR,
  STYLE_ELEMENT_ID,
} from "./dom/owned-attributes";
import {
  baseBackgroundFor,
  clearBaseCache,
  clearEarlyBaseStyle,
  paintEarlyBaseStyle,
  readBaseCache,
} from "./dom/early-paint";
import { ensureStyleEl } from "./dom/style-element";
import { resolveApply } from "./apply-resolution";
import { OBSERVE_OPTS } from "./paint/viewport-geometry";
import { createSurfaceObserver } from "./paint/mutation-parser";
import { PaintScheduler } from "./paint/paint-scheduler";
import { applyOverrideLayer } from "./paint/override-layer";
import type { EngineState, OriginalStyle } from "./value-types";
import type { Palette } from "../palette";
import type { ApplyOptions } from "../../types";

/**
 * The adaptive theming engine. ONE long-lived instance owns ALL page state and is
 * the SOLE entry point for theming the page.
 *
 * PUBLIC API (what each method does, at a glance):
 *  - `apply(palette, options)`     — theme the page right now.
 *  - `applyWhenReady(...)`         — theme the page as soon as the <body> exists.
 *  - `reset()`                     — remove the theme entirely.
 *  - `isApplied()`                 — is the page currently themed?
 *  - `preventReloadFlash()`        — on a fresh load, instantly repaint the last
 *                                    themed background so there's no white flash.
 *  - `cancelReloadFlash()`         — undo that placeholder (page won't be themed).
 *  - `dispose()`                   — stop background work without un-theming.
 */
export class Engine {
  // Each surface's frozen original bg/fg, captured once; persists across applies so
  // re-apply is idempotent (blend from the cached original, never re-read our own
  // drifted themed output).
  private originals = new WeakMap<Element, OriginalStyle>();
  // Surfaces already tagged + frozen — never re-walk/re-theme them. Reset per apply.
  private doneSet = new WeakSet<Element>();
  // The monotonic id (never rewound) + the per-apply themed counter / cap flag.
  private state: EngineState = { nextId: 0, themedCount: 0, capped: false };

  // The live MutationObserver (so reset can disconnect it).
  private observer: MutationObserver | null = null;
  // Whether the reload-flash placeholder is currently showing this load (so the
  // body-ready apply only paints a fallback base when none was restored).
  private flashPlaceholderShown = false;

  // The time-sliced paint pump: it reads the live done-set and pauses/resumes the
  // observer around each slice (our writes must not re-enter the observer's queue).
  private scheduler = new PaintScheduler(
    () => this.doneSet,
    () => this.observer?.disconnect(),
    () => {
      if (this.observer && document.body) {
        this.observer.observe(document.body, OBSERVE_OPTS);
      }
    },
  );

  /**
   * Apply the theme: resolve the palette + options, write the base rules in place
   * (no themeless gap, so no flash), enqueue the body walk, install the observer.
   * Per-apply state (done-set, counter, cap) resets; the frozen originals and the
   * monotonic id persist. Returns `true` once applied.
   */
  apply(palette: Palette, options: ApplyOptions): boolean {
    // An explicit apply rebuilds the sheet from scratch (slider drags must recolor
    // everything), so the done-set + counter + cap flag reset.
    this.doneSet = new WeakSet<Element>();
    this.state.themedCount = 0;
    this.state.capped = false;

    const { baseParts, surfaceCtx } = resolveApply(
      palette,
      options,
      this.state,
      this.originals,
      this.doneSet,
    );

    // The single <style id="themeMaker">, reused in place (never removed then
    // re-appended). Each apply rebuilds it: start empty, write base, stream surfaces.
    const head = document.head || document.documentElement;
    const style = ensureStyleEl(STYLE_ELEMENT_ID);
    style.textContent = "";
    // A bare presence attr on <html> every role-text rule is scoped under, so the
    // engine's text colors clear site single-class specificity.
    if (!document.documentElement.hasAttribute(ROOT_MARKER_ATTR)) {
      document.documentElement.setAttribute(ROOT_MARKER_ATTR, "");
    }

    // Write the base rules now, then kick off the surface walk (above-the-fold
    // first; the first slice runs synchronously inside `enqueue`).
    this.scheduler.begin(style, surfaceCtx);
    this.scheduler.append(baseParts);
    if (document.body) {
      this.scheduler.enqueue(document.body);
    }
    // Per-tag overrides: a sibling <style> emitted after the main one so it wins.
    applyOverrideLayer(options.overrides, head);
    // Observe SPA/lazy content (it feeds roots to the same scheduler).
    this.installObserver();
    // The full theme owns the html/body base now; retire the flash placeholder so
    // there is a single source of truth for the page base.
    this.cancelReloadFlash();
    return true;
  }

  /**
   * Theme the page once a `document.body` exists (deferring to `DOMContentLoaded`
   * otherwise). If the reload-flash placeholder isn't already showing (first themed
   * load, no cache), it paints the palette-derived base now so the page is never
   * left un-themed.
   */
  applyWhenReady(palette: Palette, options: ApplyOptions): void {
    if (!this.flashPlaceholderShown) {
      this.paintFlashPlaceholder(baseBackgroundFor(palette, options));
    }
    const run = (): void => {
      this.apply(palette, options);
    };
    if (document.body) {
      run();
    } else {
      document.addEventListener("DOMContentLoaded", run, { once: true });
    }
  }

  /**
   * Synchronously repaint the exact themed base from the last load onto `<html>` at
   * `document_start`, before any async storage read, so the first frame is already
   * themed instead of the site's un-themed background. Returns `true` if a themed
   * base was remembered (and repainted), else `false`.
   */
  preventReloadFlash(): boolean {
    const remembered = readBaseCache();
    if (remembered) {
      this.paintFlashPlaceholder(remembered);
    }
    return remembered !== null;
  }

  /** Undo the reload-flash placeholder when the page won't be themed after all. */
  cancelReloadFlash(): void {
    clearEarlyBaseStyle();
    this.flashPlaceholderShown = false;
  }

  /** True when a Thememaker theme is currently on the page. */
  isApplied(): boolean {
    return document.getElementById(STYLE_ELEMENT_ID) !== null;
  }

  /**
   * Tear down the observer + work, drop the override layer, the root marker, the
   * base cache, and the main <style>. Frozen originals are dropped so a fresh apply
   * re-captures true originals. Returns `true` if a style was removed.
   */
  reset(): boolean {
    this.dispose();
    this.originals = new WeakMap<Element, OriginalStyle>();
    this.doneSet = new WeakSet<Element>();
    this.state = { nextId: 0, themedCount: 0, capped: false };
    clearBaseCache();
    document.getElementById(OVERRIDE_STYLE_ID)?.remove();
    document.documentElement.removeAttribute(ROOT_MARKER_ATTR);
    const old = document.getElementById(STYLE_ELEMENT_ID);
    if (old) {
      old.remove();
      return true;
    }
    return false;
  }

  /** Disconnect the observer + cancel pending work (without removing the style). */
  dispose(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    this.scheduler.dispose();
  }

  /** Paint the reload-flash placeholder + remember it is showing. */
  private paintFlashPlaceholder(hex: string): void {
    paintEarlyBaseStyle(hex);
    this.flashPlaceholderShown = true;
  }

  /**
   * Install the surface MutationObserver (any prior one is disconnected) and begin
   * observing the body. The observer pre-paints in-viewport mutations and hands the
   * off-screen remainder to the scheduler's debounced defer.
   */
  private installObserver(): void {
    if (this.observer) {
      this.observer.disconnect();
    }
    const observer = createSurfaceObserver({
      doneSet: this.doneSet,
      originals: this.originals,
      getCtx: () => this.scheduler.context,
      appendRules: (r) => this.scheduler.append(r),
      deferOffscreen: (roots) => this.scheduler.deferOffscreen(roots),
    });
    if (document.body) {
      observer.observe(document.body, OBSERVE_OPTS);
    }
    this.observer = observer;
  }
}

/**
 * The single page-wide Engine instance. Shared by the content script and the
 * picker so the engine state and the one `<style id="themeMaker">` stay unified
 * across every theming path.
 */
export const engine = new Engine();
