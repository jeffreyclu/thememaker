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
 * All page state lives on private instance fields (the `originals` WeakMap, the
 * `doneSet` WeakSet, the id/count/cap `state`, the `observer`, the `<style>`
 * handle, the work `queue`, the `draining` flag). The content script holds one
 * long-lived `Engine`, so re-applies and slider drags reuse the frozen originals.
 *
 * The Engine owns one scheduler: `apply()` and the MutationObserver both enqueue
 * work; a single `drain` loop processes the queue in time-sliced slices
 * (requestIdleCallback) and reschedules itself until drained. The observer's
 * pre-paint path themes in-viewport nodes synchronously before paint.
 *
 * Heavy per-element logic lives in the helper modules it composes (`engine-apply`
 * resolves the palette into base CSS + paint context; `engine-walk` is the
 * stateless slice body; `engine-surface` is the per-element painter;
 * `engine-observe` parses mutation batches; `engine-overrides` is the per-tag
 * layer); this class is the thin scheduler that wires them together.
 */
import {
  OVERRIDE_STYLE_ID,
  ROOT_MARKER_ATTR,
  STYLE_ELEMENT_ID,
} from "./theme-dom-constants";
import {
  baseBackgroundFor,
  clearBaseCache,
  readBaseCache,
} from "../storage/base-cache";
import { ensureStyleEl } from "./theme-style";
import { resolveApply } from "./engine-apply";
import { clearEarlyBaseStyle, paintEarlyBaseStyle } from "./engine-early";
import {
  drainSlice,
  enqueueInto,
  EDITABLE_SEL,
  type WorkItem,
} from "./engine-walk";
import { OBSERVE_OPTS, yieldThen } from "./engine-walk-geom";
import { createSurfaceObserver, isOwnElement } from "./engine-observe";
import { applyOverrideLayer } from "./engine-overrides";
import type { SurfaceContext } from "./engine-surface";
import type { EngineState, OriginalStyle } from "./engine-types";
import type { Palette } from "../palette";
import type { ApplyOptions } from "../../types";

const DEBOUNCE_MS = 250;

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

  // The scheduler's state: the single `<style>`, the work queue, the draining flag,
  // the active surface context, and the debounced-observer flush state.
  private styleEl: HTMLStyleElement | null = null;
  private ctx: SurfaceContext | null = null;
  private queue: WorkItem[] = [];
  private draining = false;
  private pending = new Set<HTMLElement>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  // Whether the reload-flash placeholder is currently showing this load (so the
  // body-ready apply only paints a fallback base when none was restored).
  private flashPlaceholderShown = false;

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
    this.ctx = surfaceCtx;

    // The single <style id="themeMaker">, reused in place (never removed then
    // re-appended). Each apply rebuilds it: start empty, write base, stream
    // surfaces.
    const head = document.head || document.documentElement;
    const style = ensureStyleEl(STYLE_ELEMENT_ID);
    style.textContent = "";
    this.styleEl = style;
    // A bare presence attr on <html> every role-text rule is scoped under, so the
    // engine's text colors clear site single-class specificity.
    if (!document.documentElement.hasAttribute(ROOT_MARKER_ATTR)) {
      document.documentElement.setAttribute(ROOT_MARKER_ATTR, "");
    }

    // Write the base rules now, then kick off the surface walk (above-the-fold
    // first). The first slice runs synchronously inside this call.
    this.appendRules(baseParts);
    if (document.body) {
      enqueueInto(this.queue, this.doneSet, document.body, true);
      if (!this.draining) {
        this.drain();
      }
    }
    // Per-tag overrides: a sibling <style> emitted after the main one so it wins.
    applyOverrideLayer(options.overrides, head);
    // Observe SPA/lazy content (it enqueues into our queue).
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
      this.styleEl = null;
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
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.queue = [];
    this.pending = new Set<HTMLElement>();
    this.draining = false;
  }

  /** Paint the reload-flash placeholder + remember it is showing. */
  private paintFlashPlaceholder(hex: string): void {
    paintEarlyBaseStyle(hex);
    this.flashPlaceholderShown = true;
  }

  /** Append themed rules onto the live <style> (no-op for an empty list). */
  private appendRules(rules: string[]): void {
    if (rules.length === 0 || !this.styleEl) {
      return;
    }
    const existing = this.styleEl.textContent ?? "";
    this.styleEl.textContent = existing
      ? `${existing}\n${rules.join("\n")}`
      : rules.join("\n");
  }

  /**
   * Drain the queue in time-sliced slices, yielding between them and rescheduling
   * until drained. The observer is disconnected across each slice (our
   * attribute/style writes must not re-enter its queue) and reconnected after.
   */
  private drain(): void {
    if (!this.styleEl || !this.ctx) {
      return;
    }
    this.draining = true;
    const obs = this.observer;
    if (obs) {
      obs.disconnect();
    }
    drainSlice(this.queue, this.ctx, (r) => this.appendRules(r));
    if (obs && document.body) {
      obs.observe(document.body, OBSERVE_OPTS);
    }
    this.draining = false;
    if (this.queue.length > 0) {
      yieldThen(() => {
        if (this.queue.length > 0) {
          this.drain();
        }
      });
    }
  }

  /** Queue the observer's off-screen remainder behind a debounce, then drain it. */
  private deferOffscreen(roots: HTMLElement[]): void {
    for (const el of roots) {
      this.pending.add(el);
    }
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
    }
    this.flushTimer = setTimeout(() => this.flush(), DEBOUNCE_MS);
  }

  /** Flush the debounced off-screen remainder into the queue + drain it. */
  private flush(): void {
    this.flushTimer = null;
    for (const el of this.pending) {
      if (!el.isConnected || isOwnElement(el) || el.closest(EDITABLE_SEL)) {
        continue;
      }
      enqueueInto(this.queue, this.doneSet, el, true);
    }
    this.pending = new Set<HTMLElement>();
    if (this.queue.length > 0 && !this.draining) {
      this.drain();
    }
  }

  /**
   * Install the surface MutationObserver (any prior one is disconnected) and begin
   * observing the body. The observer pre-paints in-viewport mutations and hands
   * the off-screen remainder to {@link deferOffscreen}.
   */
  private installObserver(): void {
    if (this.observer) {
      this.observer.disconnect();
    }
    const observer = createSurfaceObserver({
      doneSet: this.doneSet,
      originals: this.originals,
      getCtx: () => this.ctx,
      appendRules: (r) => this.appendRules(r),
      deferOffscreen: (roots) => this.deferOffscreen(roots),
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
