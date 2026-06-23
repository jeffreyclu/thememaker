/**
 * Typed storage adapter wrapping `chrome.storage`.
 *
 * Design:
 *  - `local` area: history queue + per-site state (larger, device-local).
 *  - `sync` area: settings + favorites scaffolding (small, roams with profile).
 *
 * The adapter is built on a minimal `StorageArea` interface so unit tests inject
 * a fake and never touch real browser APIs. `chromeArea()` adapts a real
 * `chrome.storage.StorageArea` (callback API) to a promise-based one.
 *
 * Replaces ALL prior `localStorage` usage.
 */
import { MAX_HISTORY } from "../config";
import { enqueueScheme } from "./theme-engine";
import type { PaletteCacheStore } from "./color-source";
import type { Palette } from "./palette";
import { DEFAULT_INTENSITY } from "../types";
import type { ColorMode, Intensity, Scheme } from "../types";

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
  /**
   * Transient handoff for the element picker. The content script writes the
   * picked override-key here when the popup has closed (clicking the page
   * focuses it → the popup closes), so the popup can read + consume it on its
   * next open. See `PendingPick`.
   */
  pendingPick: "pendingPick",
  /** Transient live-theme handoff from the action popup to the picker window. */
  pickerHandoff: "pickerHandoff",
} as const;

/** Settings persisted in `sync`. */
export interface Settings {
  /** Last-used color mode, or "random" to pick one each generate. */
  mode: ColorMode | "random";
  /** Surface-coverage dial (0–100) the adaptive engine repaints with. */
  intensity: Intensity;
  /**
   * The user-chosen seed color (normalized `#rrggbb`). Only used when
   * {@link Settings.useRandomSeed} is false; persisted so the picker reopens on
   * the last choice.
   */
  seed: string;
  /**
   * Whether Generate picks a fresh RANDOM seed (the default behavior) instead of
   * honoring the chosen {@link Settings.seed}.
   */
  useRandomSeed: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  mode: "random",
  intensity: DEFAULT_INTENSITY,
  seed: "#4f46e5",
  useRandomSeed: true,
};

/**
 * A named, GLOBAL (not per-site) favorite scheme the user saved. Stored as a
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
 * A transient element-pick result the content script writes when the popup is
 * closed during a pick. The popup reads + clears it on open and applies the
 * override. Scoped by `origin` so a pick on one site doesn't leak to another.
 */
export interface PendingPick {
  /** The origin the pick happened on. */
  origin: string;
  /** The override-key (a `PaletteRoles` key) the user picked. */
  role: string;
  /** When the pick happened (ms epoch), so the popup can ignore stale picks. */
  at: number;
}

/** Picks older than this (ms) are ignored by the popup as stale. */
export const PENDING_PICK_TTL_MS = 60_000;

/**
 * The live theme handed off from the ACTION POPUP to the DETACHED PICKER WINDOW.
 * The picker window is a fresh document that can only see storage, so the popup
 * stashes the current scheme + overrides + intensity here for it to restore —
 * even for a theme that was generated but not yet applied-to-site.
 */
export interface PickerHandoff {
  scheme: Scheme;
  intensity: Intensity;
  overrides: Record<string, string>;
}

/**
 * Adapts a real `chrome.storage.StorageArea` to the promise-based
 * `StorageArea` interface. Not exercised by unit tests (which inject fakes).
 */
export const chromeArea = (area: chrome.storage.StorageArea): StorageArea => ({
  get: <T>(key: string) =>
    new Promise<T | undefined>((resolve) => {
      area.get(key, (items) => resolve(items[key] as T | undefined));
    }),
  set: <T>(key: string, value: T) =>
    new Promise<void>((resolve) => {
      area.set({ [key]: value }, () => resolve());
    }),
  remove: (key: string) =>
    new Promise<void>((resolve) => {
      area.remove(key, () => resolve());
    }),
});

/** Normalizes a tab URL to an origin used as the per-site storage key. */
export const originFromUrl = (url: string | undefined): string | null => {
  if (!url) {
    return null;
  }
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
};

/**
 * The application storage facade. Both areas are injected so tests can supply
 * fakes; production wires `chromeArea(chrome.storage.local|sync)`.
 */
export class ThememakerStorage {
  constructor(
    private readonly local: StorageArea,
    private readonly sync: StorageArea,
  ) {}

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
    return { ...DEFAULT_SETTINGS, ...stored };
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
    return { ...DEFAULT_SITE_STATE, ...stored };
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
   * Re-saving an id REPLACES the existing entry (so a rename/overwrite is
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

  /** Writes the transient element-pick handoff (content script → popup). */
  async setPendingPick(pick: PendingPick): Promise<void> {
    await this.local.set(KEYS.pendingPick, pick);
  }

  /**
   * Reads AND clears the pending pick for `origin`, returning the role if a
   * fresh ({@link PENDING_PICK_TTL_MS}) pick exists for that origin, else null.
   * Consuming-on-read makes the handoff one-shot so a stale pick can't re-fire.
   */
  async consumePendingPick(
    origin: string,
    now: number = Date.now(),
  ): Promise<string | null> {
    const pick = await this.local.get<PendingPick>(KEYS.pendingPick);
    if (!pick) {
      return null;
    }
    await this.local.remove(KEYS.pendingPick);
    if (pick.origin !== origin || now - pick.at > PENDING_PICK_TTL_MS) {
      return null;
    }
    return pick.role;
  }

  /** Stashes the live theme for the detached picker window to restore. */
  async setPickerHandoff(handoff: PickerHandoff): Promise<void> {
    await this.local.set(KEYS.pickerHandoff, handoff);
  }

  /** Reads (without clearing) the picker handoff, if any. */
  async getPickerHandoff(): Promise<PickerHandoff | undefined> {
    return this.local.get<PickerHandoff>(KEYS.pickerHandoff);
  }

  /** Clears the picker handoff (after the window restores it). */
  async clearPickerHandoff(): Promise<void> {
    await this.local.remove(KEYS.pickerHandoff);
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

/** Production-wired storage backed by real `chrome.storage`. */
export const createChromeStorage = (): ThememakerStorage =>
  new ThememakerStorage(
    chromeArea(chrome.storage.local),
    chromeArea(chrome.storage.sync),
  );
