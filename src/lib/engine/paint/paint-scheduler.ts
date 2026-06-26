/**
 * The paint pump: drains queued surface roots in time-sliced slices (yielding via
 * requestIdleCallback and rescheduling until drained), and debounces the
 * observer's off-screen remainder before queueing it.
 *
 * Owns the work queue + the live `<style>` it streams rules into. The Engine feeds
 * it roots (`enqueue`), binds the sheet + surface context each apply (`begin`), and
 * supplies the live done-set + observer pause/resume — our own attribute/style
 * writes during a slice must not re-enter the observer's queue, so the observer is
 * disconnected across each slice and reconnected after.
 */
import {
  drainSlice,
  enqueueInto,
  EDITABLE_SEL,
  type WorkItem,
} from "./surface-walk";
import { yieldThen } from "./viewport-geometry";
import { isOwnElement } from "./mutation-parser";
import type { SurfaceContext } from "./index";

const DEBOUNCE_MS = 250;

export class PaintScheduler {
  private queue: WorkItem[] = [];
  private draining = false;
  private pending = new Set<HTMLElement>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private styleEl: HTMLStyleElement | null = null;
  private ctx: SurfaceContext | null = null;

  /**
   * @param doneSet        reads the engine's current done-set (replaced each apply)
   * @param pauseObserver  disconnect the observer for a slice
   * @param resumeObserver reconnect it after the slice
   */
  constructor(
    private readonly doneSet: () => WeakSet<Element>,
    private readonly pauseObserver: () => void,
    private readonly resumeObserver: () => void,
  ) {}

  /** The active surface context (the observer reads this to paint new nodes). */
  get context(): SurfaceContext | null {
    return this.ctx;
  }

  /** Bind the live `<style>` + surface context for the current apply. */
  begin(styleEl: HTMLStyleElement, ctx: SurfaceContext): void {
    this.styleEl = styleEl;
    this.ctx = ctx;
  }

  /** Append themed rules onto the live `<style>` (no-op for an empty list). */
  append(rules: string[]): void {
    if (rules.length === 0 || !this.styleEl) {
      return;
    }
    const existing = this.styleEl.textContent ?? "";
    this.styleEl.textContent = existing
      ? `${existing}\n${rules.join("\n")}`
      : rules.join("\n");
  }

  /** Enqueue a root subtree and start draining if not already. */
  enqueue(root: HTMLElement): void {
    enqueueInto(this.queue, this.doneSet(), root, true);
    if (!this.draining) {
      this.drain();
    }
  }

  /**
   * Drain the queue in time-sliced slices, yielding between them and rescheduling
   * until drained. The observer is paused across each slice (our writes must not
   * re-enter its queue) and resumed after.
   */
  private drain(): void {
    if (!this.styleEl || !this.ctx) {
      return;
    }
    this.draining = true;
    this.pauseObserver();
    drainSlice(this.queue, this.ctx, (r) => this.append(r));
    this.resumeObserver();
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
  deferOffscreen(roots: HTMLElement[]): void {
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
    const doneSet = this.doneSet();
    for (const el of this.pending) {
      if (!el.isConnected || isOwnElement(el) || el.closest(EDITABLE_SEL)) {
        continue;
      }
      enqueueInto(this.queue, doneSet, el, true);
    }
    this.pending = new Set<HTMLElement>();
    if (this.queue.length > 0 && !this.draining) {
      this.drain();
    }
  }

  /** Cancel pending work + the debounce (the Engine's dispose/reset). */
  dispose(): void {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.queue = [];
    this.pending = new Set<HTMLElement>();
    this.draining = false;
  }
}
