import { beforeEach, describe, expect, it } from "vitest";

import {
  DEFAULT_SETTINGS,
  KEYS,
  ThememakerStorage,
  chromeArea,
  createChromeStorage,
  originFromUrl,
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

describe("ThememakerStorage", () => {
  let local: StorageArea;
  let sync: StorageArea;
  let storage: ThememakerStorage;

  beforeEach(() => {
    local = memoryArea();
    sync = memoryArea();
    storage = new ThememakerStorage(local, sync);
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

  it("persists the intensity + surprise settings", async () => {
    await storage.setSettings({ intensity: 80, surprise: true });
    const settings = await storage.getSettings();
    expect(settings.intensity).toBe(80);
    expect(settings.surprise).toBe(true);
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
});
