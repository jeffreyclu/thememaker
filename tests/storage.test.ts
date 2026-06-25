import { beforeEach, describe, expect, it } from "vitest";

import {
  DEFAULT_SETTINGS,
  KEYS,
  MAX_FAVORITES,
  Storage,
  chromeArea,
  createChromeStorage,
  originFromUrl,
  type Favorite,
  type StorageArea,
} from "../src/lib/storage";
import { getChromeMock } from "./chrome-mock";
import { mockPalette, mockScheme, mockScheme2 } from "./mocks";

/** A trivial in-memory StorageArea fake for direct adapter tests. */
const memoryArea = (): StorageArea => {
  const store: Record<string, unknown> = {};
  return {
    get: async <T>(key: string) => store[key] as T | undefined,
    set: async <T>(key: string, value: T) => {
      store[key] = value;
    },
    remove: async (key: string) => {
      delete store[key];
    },
  };
};

describe("originFromUrl", () => {
  it("extracts the origin from a url", () => {
    expect(originFromUrl("https://example.com/path?q=1")).toBe(
      "https://example.com",
    );
  });
  it("returns null for missing or invalid urls", () => {
    expect(originFromUrl(undefined)).toBeNull();
    expect(originFromUrl("not a url")).toBeNull();
  });
});

describe("Storage", () => {
  let local: StorageArea;
  let sync: StorageArea;
  let storage: Storage;

  beforeEach(() => {
    local = memoryArea();
    sync = memoryArea();
    storage = new Storage(local, sync);
  });

  it("returns an empty history by default", async () => {
    expect(await storage.getHistory()).toStrictEqual([]);
  });

  it("pushHistory appends and bounds, persisting to local", async () => {
    await storage.pushHistory(mockScheme);
    let history = await storage.pushHistory(mockScheme2);
    expect(history).toHaveLength(2);
    expect(history[1]).toStrictEqual(mockScheme2);

    // bound to max
    for (let i = 0; i < 20; i += 1) {
      history = await storage.pushHistory(mockScheme, 10);
    }
    expect(await storage.getHistory()).toHaveLength(10);
  });

  it("clearHistory empties the queue", async () => {
    await storage.pushHistory(mockScheme);
    await storage.clearHistory();
    expect(await storage.getHistory()).toStrictEqual([]);
  });

  it("getSettings merges over defaults", async () => {
    expect(await storage.getSettings()).toStrictEqual(DEFAULT_SETTINGS);
    await storage.setSettings({ mode: "triad" });
    expect(await storage.getSettings()).toStrictEqual({
      ...DEFAULT_SETTINGS,
      mode: "triad",
    });
  });

  it("settings persist to the sync area, history to local", async () => {
    await storage.setSettings({ mode: "complement" });
    await storage.pushHistory(mockScheme);
    expect(await sync.get(KEYS.settings)).toStrictEqual({
      ...DEFAULT_SETTINGS,
      mode: "complement",
    });
    expect(await sync.get(KEYS.history)).toBeUndefined();
    expect(await local.get(KEYS.history)).toBeTruthy();
  });

  it("persists settings (merged over defaults)", async () => {
    await storage.setSettings({ intensity: 80, invert: true });
    const settings = await storage.getSettings();
    expect(settings.intensity).toBe(80);
    expect(settings.invert).toBe(true);
    // unchanged keys keep their defaults
    expect(settings.mode).toBe(DEFAULT_SETTINGS.mode);
  });

  it("per-site state defaults to disabled and merges patches", async () => {
    const origin = "https://example.com";
    expect(await storage.getSiteState(origin)).toStrictEqual({
      enabled: false,
    });
    await storage.setSiteState(origin, { enabled: true });
    expect((await storage.getSiteState(origin)).enabled).toBe(true);
    // remembers a scheme alongside the flag
    await storage.setSiteState(origin, { savedScheme: mockScheme });
    const state = await storage.getSiteState(origin);
    expect(state.enabled).toBe(true);
    expect(state.savedScheme).toStrictEqual(mockScheme);
  });

  it("per-site state is keyed by origin (sites are independent)", async () => {
    await storage.setSiteState("https://a.com", { enabled: true });
    await storage.setSiteState("https://b.com", { enabled: false });
    expect((await storage.getSiteState("https://a.com")).enabled).toBe(true);
    expect((await storage.getSiteState("https://b.com")).enabled).toBe(false);
  });

  it("paletteCacheStore round-trips palettes through the local area", async () => {
    const cache = storage.paletteCacheStore();
    expect(await cache.get("k")).toBeUndefined();
    await cache.set("k", mockPalette);
    expect(await cache.get("k")).toStrictEqual(mockPalette);
    // cache entries live under a prefixed key, not the bare key
    expect(await local.get("k")).toBeUndefined();
  });

  describe("favorites (GLOBAL, stored in sync)", () => {
    const fav = (id: string, name: string): Favorite => ({
      id,
      name,
      scheme: mockScheme,
    });

    it("returns an empty list by default", async () => {
      expect(await storage.getFavorites()).toStrictEqual([]);
    });

    it("saveFavorite appends and persists to the SYNC area", async () => {
      const list = await storage.saveFavorite(fav("a", "Brandy"));
      expect(list).toHaveLength(1);
      expect(list[0]).toStrictEqual(fav("a", "Brandy"));
      // global → sync, never local
      expect(await sync.get(KEYS.favorites)).toHaveLength(1);
      expect(await local.get(KEYS.favorites)).toBeUndefined();
    });

    it("lists favorites in insertion order", async () => {
      await storage.saveFavorite(fav("a", "First"));
      await storage.saveFavorite(fav("b", "Second"));
      const list = await storage.getFavorites();
      expect(list.map((f) => f.id)).toStrictEqual(["a", "b"]);
    });

    it("re-saving an existing id REPLACES (rename/overwrite is idempotent)", async () => {
      await storage.saveFavorite(fav("a", "Old name"));
      const list = await storage.saveFavorite(fav("a", "New name"));
      expect(list).toHaveLength(1);
      expect(list[0].name).toBe("New name");
    });

    it("deleteFavorite removes by id and persists the result", async () => {
      await storage.saveFavorite(fav("a", "A"));
      await storage.saveFavorite(fav("b", "B"));
      const list = await storage.deleteFavorite("a");
      expect(list.map((f) => f.id)).toStrictEqual(["b"]);
      expect(await storage.getFavorites()).toHaveLength(1);
    });

    it("deleteFavorite is a no-op for an unknown id", async () => {
      await storage.saveFavorite(fav("a", "A"));
      const list = await storage.deleteFavorite("missing");
      expect(list.map((f) => f.id)).toStrictEqual(["a"]);
    });

    it("bounds the list to the cap (oldest dropped)", async () => {
      for (let i = 0; i < MAX_FAVORITES + 5; i += 1) {
        await storage.saveFavorite(fav(`id-${i}`, `Fav ${i}`));
      }
      const list = await storage.getFavorites();
      expect(list).toHaveLength(MAX_FAVORITES);
      // the first 5 ids were evicted; the newest is last
      expect(list[0].id).toBe("id-5");
      expect(list[list.length - 1].id).toBe(`id-${MAX_FAVORITES + 4}`);
    });

    it("honors a custom cap", async () => {
      await storage.saveFavorite(fav("a", "A"), 2);
      await storage.saveFavorite(fav("b", "B"), 2);
      const list = await storage.saveFavorite(fav("c", "C"), 2);
      expect(list.map((f) => f.id)).toStrictEqual(["b", "c"]);
    });
  });
});

describe("chromeArea / createChromeStorage (against the chrome mock)", () => {
  it("chromeArea adapts the callback API to promises", async () => {
    const area = chromeArea(
      getChromeMock().storage.local as unknown as chrome.storage.StorageArea,
    );
    await area.set("k", { v: 1 });
    expect(await area.get("k")).toStrictEqual({ v: 1 });
    await area.remove("k");
    expect(await area.get("k")).toBeUndefined();
  });

  it("createChromeStorage round-trips history through chrome.storage.local", async () => {
    const storage = createChromeStorage();
    await storage.pushHistory(mockScheme);
    expect(getChromeMock().storage.local.store[KEYS.history]).toBeTruthy();
    expect(await storage.getHistory()).toHaveLength(1);
  });

  it("createChromeStorage writes settings to chrome.storage.sync", async () => {
    const storage = createChromeStorage();
    await storage.setSettings({ mode: "quad" });
    expect(getChromeMock().storage.sync.store[KEYS.settings]).toStrictEqual({
      ...DEFAULT_SETTINGS,
      mode: "quad",
    });
  });

  it("createChromeStorage round-trips favorites through chrome.storage.sync", async () => {
    const storage = createChromeStorage();
    await storage.saveFavorite({ id: "a", name: "A", scheme: mockScheme });
    expect(getChromeMock().storage.sync.store[KEYS.favorites]).toHaveLength(1);
    // favorites are global → never in the local area
    expect(getChromeMock().storage.local.store[KEYS.favorites]).toBeUndefined();
    expect(await storage.getFavorites()).toHaveLength(1);
  });
});
