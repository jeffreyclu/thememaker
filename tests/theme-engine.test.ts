import { describe, expect, it } from "vitest";

import {
  buildSchemeStyle,
  calculateTotalColors,
  dequeueScheme,
  enqueueScheme,
  fetchColors,
  generateColorApiUrl,
  generateRandomScheme,
  generateScheme,
  isContainerElement,
  isTextElement,
  randomHexColor,
  randomMode,
  randomNum,
} from "../src/lib/theme-engine";
import { htmlElements, modes } from "../src/config";
import type { Scheme } from "../src/types";
import {
  fakeFetch,
  mockColorArr,
  mockScheme,
  mockSchemeDetails,
  mockJsonUrl,
  mockHtmlUrl,
  mockUrl,
} from "./mocks";

// These tests preserve the intent of the legacy Thememaker unit tests, adapted
// to the extracted pure engine.
describe("theme-engine (pure logic)", () => {
  it("randomNum generates an integer in range", () => {
    for (let i = 0; i < 50; i += 1) {
      const n = randomNum(1, 10);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(10);
    }
  });

  it("randomHexColor generates a 6-char hex string", () => {
    const hex = randomHexColor();
    expect(hex).toHaveLength(6);
    expect(hex).toMatch(/^[0-9a-f]{6}$/);
  });

  it("randomMode returns a mode from the list", () => {
    const mode = randomMode();
    expect(mode).toBeTruthy();
    expect(modes).toContain(mode);
  });

  it("randomMode picks the only mode when the list has one", () => {
    expect(randomMode(["triad"])).toBe("triad");
  });

  it("calculateTotalColors returns the bucket count", () => {
    expect(calculateTotalColors()).toBe(Object.values(htmlElements).length);
  });

  it("generateColorApiUrl builds a valid url (json + html)", () => {
    expect(generateColorApiUrl(mockSchemeDetails, "json")).toBe(mockJsonUrl);
    expect(generateColorApiUrl(mockSchemeDetails, "html")).toBe(mockHtmlUrl);
  });

  it("fetchColors returns the parsed hex array and seed name", async () => {
    const result = await fetchColors(mockUrl, fakeFetch);
    expect(result).toBeTruthy();
    expect(result?.colors).toHaveLength(7);
    expect(result?.rootColorName).toBe("Brandy Rose");
  });

  it("fetchColors returns undefined on bad data (legacy failure mode)", async () => {
    const badFetch = (async () =>
      Promise.resolve({
        json: () => Promise.resolve({}),
      })) as unknown as typeof fetch;
    const result = await fetchColors(mockUrl, badFetch);
    expect(result).toBeUndefined();
  });

  it("fetchColors returns undefined when fetch throws", async () => {
    const throwingFetch = (async () => {
      throw new Error("network");
    }) as unknown as typeof fetch;
    expect(await fetchColors(mockUrl, throwingFetch)).toBeUndefined();
  });

  it("isContainerElement classifies container tags", () => {
    expect(isContainerElement("body")).toBe(true);
    expect(isContainerElement("a")).toBe(false);
  });

  it("isTextElement classifies text tags", () => {
    expect(isTextElement("body")).toBe(false);
    expect(isTextElement("a")).toBe(true);
  });

  it("generateScheme maps colors onto tags (matches legacy fixture)", () => {
    expect(generateScheme(mockColorArr, mockSchemeDetails)).toStrictEqual(
      mockScheme,
    );
  });

  it("buildSchemeStyle produces container + text rules and NO UI hack", () => {
    const css = buildSchemeStyle(mockScheme);
    // container rule uses the body background + p text color
    expect(css).toContain("body { color: #98BE8B !important;");
    expect(css).toContain("background-color: #6F928B !important; }");
    // text rule clears background
    expect(css).toContain(
      "a { color: #A6BC89 !important; background-color: transparent !important;",
    );
    // the hardcoded extension-UI color hack is GONE
    expect(css).not.toContain("#generateSchemeButton");
    expect(css).not.toContain("#schemeDetailsPanel");
  });

  it("enqueueScheme appends without mutating and bounds the queue", () => {
    const start: Scheme[] = [];
    const next = enqueueScheme(start, mockScheme);
    expect(next).toHaveLength(1);
    expect(start).toHaveLength(0); // immutable

    let history: Scheme[] = [];
    for (let i = 0; i < 15; i += 1) {
      history = enqueueScheme(history, mockScheme, 10);
    }
    expect(history).toHaveLength(10);
  });

  it("dequeueScheme returns the scheme at an index, or null", () => {
    expect(dequeueScheme([], 0)).toBeNull();
    const history = [mockScheme];
    expect(dequeueScheme(history, 0)).toStrictEqual(mockScheme);
    expect(dequeueScheme(history, 5)).toBeNull();
    expect(dequeueScheme(history, -1)).toBeNull();
  });

  it("generateRandomScheme orchestrates seed -> api -> scheme", async () => {
    const result = await generateRandomScheme(fakeFetch);
    expect(result).toBeTruthy();
    expect(result?.details.rootColorName).toBe("Brandy Rose");
    // 7 buckets -> the body bucket gets the first color
    expect(result?.scheme.body).toBe("#6F928B");
  });

  it("generateRandomScheme returns undefined when the api fails", async () => {
    const badFetch = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    expect(await generateRandomScheme(badFetch)).toBeUndefined();
  });
});
