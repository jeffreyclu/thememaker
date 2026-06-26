/**
 * Typed storage adapter wrapping `chrome.storage`.
 *
 * Design:
 *  - `local` area: history queue + per-site state (larger, device-local).
 *  - `sync` area: settings + favorites scaffolding (small, roams with profile).
 *
 * The adapter is built on a minimal `StorageArea` interface so unit tests inject
 * a fake and never touch real browser APIs. `Storage.chromeArea()` adapts a real
 * `chrome.storage.StorageArea` (callback API) to a promise-based one.
 */
import { MAX_HISTORY } from "../../config";
import { enqueueScheme } from "./history";
import type { PaletteCacheStore } from "../palette";
import type { Palette } from "../palette";
import { DEFAULT_INTENSITY } from "../../types";
import type { ColorMode, Intensity, Scheme } from "../../types";

/** Minimal promise-based key/value area. The seam tests inject a fake behind. */
export interface StorageArea {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
}

/** Storage keys, centralized to avoid stringly-typed drift. */
export const KEYS = {
  history: "history",
  settings: "settings",
  favorites: "favorites",
  /** Per-site state is keyed by `site:<origin>`. */
  sitePrefix: "site:",
} as const;

/** Settings persisted in `sync`. */
export interface Settings {
  /** Last-used color mode, or "random" to pick one each generate. */
  mode: ColorMode | "random";
  /** Surface-coverage dial (0–100) the adaptive engine repaints with. */
  intensity: Intensity;
  /** Whether Generate flips the palette light↔dark (the Invert toggle). */
  invert: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  mode: "random",
  intensity: DEFAULT_INTENSITY,
  invert: false,
};

/**
 * A named, global (not per-site) favorite scheme the user saved. Stored as a
 * bounded list in `sync` under {@link KEYS.favorites} so it roams with the
 * profile.
 */
export interface Favorite {
  /** Stable id (used as the list key + delete target). */
  id: string;
  /** User-facing name (defaults to the scheme's color name + mode). */
  name: string;
  /** The saved scheme (carries its palette + intensity for faithful re-apply). */
  scheme: Scheme;
}

/** Max number of favorites retained (bounds `sync` usage). */
export const MAX_FAVORITES = 50;

/** Storage key prefix for cached palettes (keyed by seed+mode). */
const PALETTE_CACHE_PREFIX = "cache:";

/**
 * Per-site enable state. The always-on content script (`src/content/index.ts`)
 * reads this on every load: when `enabled` and `savedScheme` carries a palette +
 * intensity, it auto-reapplies that scheme. `savedScheme` is kept even while
 * disabled so re-enabling restores the last look.
 */
export interface SiteState {
  /** Whether the user enabled auto-reapply for this origin. */
  enabled: boolean;
  /** The scheme to reapply on this origin (palette + intensity), if any. */
  savedScheme?: Scheme;
}

export const DEFAULT_SITE_STATE: SiteState = { enabled: false };

/**
 * The application storage facade — the sole storage interface.
 *
 * Both areas are injected so tests can supply fakes; production wires the
 * shared {@link storage} singleton over `chrome.storage.local|sync`. All
 * behavior (key derivation, the chrome adapter, the URL→origin helper) lives
 * here as methods rather than free functions, so the class is the one cohesive
 * surface consumers reach for.
 */
export class Storage {
  private readonly local: StorageArea;
  private readonly sync: StorageArea;

  /**
   * By default the class wires itself over real `chrome.storage.local|sync` —
   * callers just do `new Storage()`. Tests inject fake areas to stay off the
   * browser APIs. Either area defaults to its chrome-backed adapter when omitted.
   */
  constructor(local?: StorageArea, sync?: StorageArea) {
    this.local = local ?? Storage.chromeArea("local");
    this.sync = sync ?? Storage.chromeArea("sync");
  }

  /**
   * Adapts a real `chrome.storage` area (callback API) to the promise-based
   * {@link StorageArea}. The area is looked up by name on each op (never
   * captured) so the module-level {@link storage} singleton, built at import,
   * always talks to the current `chrome.storage` — in production the areas are
   * stable, and under unit tests this lets the per-test chrome-mock swap (a fresh
   * `globalThis.chrome` each `beforeEach`) take effect.
   */
  private static chromeArea(name: "local" | "sync"): StorageArea {
    // Reads swallow `chrome.runtime.lastError` and degrade to `undefined` (a
    // torn-down context at document_start is a no-op, not an unhandled rejection).
    // Writes still resolve (callers don't expect a reject) but log on failure —
    // quota-exceeded / torn-down — so a lost persist is diagnosable, not silent.
    const warnWrite = (op: string, key: string): void => {
      const err = chrome.runtime.lastError;
      if (err) {
        // eslint-disable-next-line no-console
        console.warn(`thememaker: storage.${name}.${op}(${key}) failed:`, err);
      }
    };
    return {
      get: <T>(key: string) =>
        new Promise<T | undefined>((done) => {
          try {
            chrome.storage[name].get(key, (items) => {
              void chrome.runtime.lastError;
              done(items?.[key] as T | undefined);
            });
          } catch {
            done(undefined);
          }
        }),
      set: <T>(key: string, value: T) =>
        new Promise<void>((done) => {
          try {
            chrome.storage[name].set({ [key]: value }, () => {
              warnWrite("set", key);
              done();
            });
          } catch {
            done();
          }
        }),
      remove: (key: string) =>
        new Promise<void>((done) => {
          try {
            chrome.storage[name].remove(key, () => {
              warnWrite("remove", key);
              done();
            });
          } catch {
            done();
          }
        }),
    };
  }

  /** Normalizes a tab URL to an origin used as the per-site storage key. */
  static originFromUrl(url: string | undefined): string | null {
    if (!url) {
      return null;
    }
    try {
      return new URL(url).origin;
    } catch {
      return null;
    }
  }

  /**
   * Drops keys whose value is `undefined` so a partial stored object can't
   * shadow a default when spread over it
   * (`{ ...DEFAULT, ...Storage.definedOnly(stored) }`).
   */
  private static definedOnly<T extends object>(
    stored: T | undefined,
  ): Partial<T> {
    if (!stored) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(stored).filter(([, v]) => v !== undefined),
    ) as Partial<T>;
  }

  /** @returns the persisted scheme history (most-recent last), or `[]`. */
  async getHistory(): Promise<Scheme[]> {
    return (await this.local.get<Scheme[]>(KEYS.history)) ?? [];
  }

  /** Persists `history` verbatim (already bounded by the caller). */
  async setHistory(history: Scheme[]): Promise<void> {
    await this.local.set(KEYS.history, history);
  }

  /**
   * Appends `scheme` to the bounded history queue and persists it.
   * @returns the new history array.
   */
  async pushHistory(
    scheme: Scheme,
    max: number = MAX_HISTORY,
  ): Promise<Scheme[]> {
    const next = enqueueScheme(await this.getHistory(), scheme, max);
    await this.setHistory(next);
    return next;
  }

  /** Clears the persisted history. */
  async clearHistory(): Promise<void> {
    await this.local.remove(KEYS.history);
  }

  /** @returns persisted settings merged over defaults. */
  async getSettings(): Promise<Settings> {
    const stored = await this.sync.get<Partial<Settings>>(KEYS.settings);
    return { ...DEFAULT_SETTINGS, ...Storage.definedOnly(stored) };
  }

  /** Merges `patch` into settings and persists the result. */
  async setSettings(patch: Partial<Settings>): Promise<Settings> {
    const next = { ...(await this.getSettings()), ...patch };
    await this.sync.set(KEYS.settings, next);
    return next;
  }

  /** @returns per-site state for `origin`, defaulted when absent. */
  async getSiteState(origin: string): Promise<SiteState> {
    const stored = await this.local.get<SiteState>(KEYS.sitePrefix + origin);
    return { ...DEFAULT_SITE_STATE, ...Storage.definedOnly(stored) };
  }

  /** Merges `patch` into the per-site state for `origin` and persists it. */
  async setSiteState(
    origin: string,
    patch: Partial<SiteState>,
  ): Promise<SiteState> {
    const next = { ...(await this.getSiteState(origin)), ...patch };
    await this.local.set(KEYS.sitePrefix + origin, next);
    return next;
  }

  /** @returns the persisted GLOBAL favorites (insertion order), or `[]`. */
  async getFavorites(): Promise<Favorite[]> {
    return (await this.sync.get<Favorite[]>(KEYS.favorites)) ?? [];
  }

  /**
   * Appends `favorite` to the bounded favorites list and persists it to `sync`.
   * Re-saving an id replaces the existing entry (so a rename/overwrite is
   * idempotent); the list is capped at {@link MAX_FAVORITES} (oldest dropped).
   * @returns the new favorites array.
   */
  async saveFavorite(
    favorite: Favorite,
    max: number = MAX_FAVORITES,
  ): Promise<Favorite[]> {
    const existing = await this.getFavorites();
    const without = existing.filter((f) => f.id !== favorite.id);
    const next = [...without, favorite];
    while (next.length > max) {
      next.shift();
    }
    await this.sync.set(KEYS.favorites, next);
    return next;
  }

  /**
   * Removes the favorite with `id` and persists the result.
   * @returns the new favorites array (unchanged when `id` is absent).
   */
  async deleteFavorite(id: string): Promise<Favorite[]> {
    const next = (await this.getFavorites()).filter((f) => f.id !== id);
    await this.sync.set(KEYS.favorites, next);
    return next;
  }

  /**
   * A persistent `PaletteCacheStore` (chrome.storage.local) for the API
   * "surprise me" source, so repeated seed+mode lookups skip the network.
   */
  paletteCacheStore(): PaletteCacheStore {
    return {
      get: (key: string) => this.local.get<Palette>(PALETTE_CACHE_PREFIX + key),
      set: (key: string, value: Palette) =>
        this.local.set(PALETTE_CACHE_PREFIX + key, value),
    };
  }
}

/**
 * The application-wide storage singleton. The popup and content script share
 * this one instance; with no args the class wires itself over real
 * `chrome.storage` (lazily), so it is safe to construct at module load and
 * stays correct under the per-test chrome mock.
 */
export const storage = new Storage();
