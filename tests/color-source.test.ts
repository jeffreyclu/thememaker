import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  apiPalette,
  apiSchemeUrl,
  clearMemoryCache,
  localPalette,
  paletteCacheKey,
  paletteFromApiResponse,
  type PaletteCacheStore,
} from "../src/lib/color-source";
import { isHexColor } from "../src/lib/color";
import type { Palette } from "../src/lib/palette";

const okResponse = (colors: string[]) =>
  ({
    json: async () => ({
      colors: colors.map((value) => ({ hex: { value } })),
      seed: { name: { value: "Test" } },
    }),
  }) as unknown as Response;

const memoryCacheStore = (): PaletteCacheStore & {
  store: Map<string, Palette>;
} => {
  const store = new Map<string, Palette>();
  return {
    store,
    get: async (k) => store.get(k),
    set: async (k, v) => {
      store.set(k, v);
    },
  };
};

describe("paletteCacheKey / apiSchemeUrl", () => {
  it("key is stable + normalized by seed+mode", () => {
    expect(paletteCacheKey("#ABCDEF", "triad")).toBe(
      paletteCacheKey("abcdef", "triad"),
    );
    expect(paletteCacheKey("#abcdef", "triad")).not.toBe(
      paletteCacheKey("#abcdef", "quad"),
    );
  });
  it("builds a valid thecolorapi url", () => {
    expect(apiSchemeUrl("#6f928b", "triad", 6)).toBe(
      "https://www.thecolorapi.com/scheme?hex=6f928b&mode=triad&format=json&count=6",
    );
  });
});

describe("paletteFromApiResponse", () => {
  it("seeds swatches from the API colors, keeps local ramps", () => {
    const p = paletteFromApiResponse("#6f928b", "triad", {
      colors: [{ hex: { value: "#112233" } }, { hex: { value: "#445566" } }],
    });
    expect(p).not.toBeNull();
    expect(p?.swatches).toStrictEqual(["#112233", "#445566"]);
    expect(p?.surfaces.length).toBeGreaterThanOrEqual(3);
  });
  it("returns null for empty/malformed payloads", () => {
    expect(paletteFromApiResponse("#6f928b", "triad", {})).toBeNull();
    expect(
      paletteFromApiResponse("#6f928b", "triad", { colors: [] }),
    ).toBeNull();
    expect(
      paletteFromApiResponse("#6f928b", "triad", {
        colors: [{ hex: { value: "not-a-color" } }],
      }),
    ).toBeNull();
  });
});

describe("localPalette", () => {
  it("never throws and always yields valid hex", () => {
    const p = localPalette("#6f928b", "monochrome");
    expect(p.swatches.every(isHexColor)).toBe(true);
  });
});

describe("apiPalette (cache hit/miss + fallback)", () => {
  beforeEach(() => clearMemoryCache());
  afterEach(() => clearMemoryCache());

  it("MISS: fetches, parses, and warms both caches", async () => {
    const cache = memoryCacheStore();
    const fetchImpl = vi.fn(async () => okResponse(["#112233", "#445566"]));
    const p = await apiPalette("#6f928b", "triad", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      cache,
    });
    expect(p.swatches).toStrictEqual(["#112233", "#445566"]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(cache.store.size).toBe(1);
  });

  it("HIT (memory): a second call does NOT fetch again", async () => {
    const fetchImpl = vi.fn(async () => okResponse(["#112233"]));
    await apiPalette("#6f928b", "triad", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await apiPalette("#6f928b", "triad", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("HIT (persistent): warms memory from the store without fetching", async () => {
    const cache = memoryCacheStore();
    const seeded = localPalette("#6f928b", "triad");
    cache.store.set(paletteCacheKey("#6f928b", "triad"), seeded);
    const fetchImpl = vi.fn(async () => okResponse(["#000000"]));
    const p = await apiPalette("#6f928b", "triad", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      cache,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(p).toStrictEqual(seeded);
  });

  it("FALLBACK: network rejection → local generation (no crash, no undefined)", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("offline");
    });
    const p = await apiPalette("#6f928b", "triad", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(p).toStrictEqual(localPalette("#6f928b", "triad"));
  });

  it("FALLBACK: malformed JSON → local generation", async () => {
    const fetchImpl = vi.fn(
      async () => ({ json: async () => ({}) }) as unknown as Response,
    );
    const p = await apiPalette("#6f928b", "triad", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(p).toStrictEqual(localPalette("#6f928b", "triad"));
  });

  it("FALLBACK is NOT cached (a later retry can still reach the API)", async () => {
    const cache = memoryCacheStore();
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(okResponse(["#abcdef"]));
    // first call: offline → local fallback, nothing cached
    await apiPalette("#6f928b", "triad", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      cache,
    });
    expect(cache.store.size).toBe(0);
    // second call: API now reachable → real palette, cached
    const p = await apiPalette("#6f928b", "triad", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      cache,
    });
    expect(p.swatches).toStrictEqual(["#abcdef"]);
    expect(cache.store.size).toBe(1);
  });

  it("survives a throwing cache store (degrades to network)", async () => {
    const fetchImpl = vi.fn(async () => okResponse(["#010203"]));
    const cache: PaletteCacheStore = {
      get: async () => {
        throw new Error("cache read boom");
      },
      set: async () => {
        throw new Error("cache write boom");
      },
    };
    const p = await apiPalette("#6f928b", "triad", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      cache,
    });
    expect(p.swatches).toStrictEqual(["#010203"]);
  });
});
