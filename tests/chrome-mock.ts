/**
 * Fake `chrome.*` for unit tests. No real browser APIs are touched.
 *
 * Provides an in-memory `chrome.storage` (local + sync), and stubbable
 * `chrome.runtime`, `chrome.scripting`, and `chrome.tabs`. Install with
 * `installChromeMock()` (done globally in `setup.ts`); reset between tests with
 * `resetChromeMock()`.
 */
import { vi, type Mock } from "vitest";

interface MemArea {
  store: Record<string, unknown>;
  get: Mock;
  set: Mock;
  remove: Mock;
  clear: Mock;
}

const makeArea = (): MemArea => {
  const store: Record<string, unknown> = {};
  return {
    store,
    get: vi.fn((key: string, cb: (items: Record<string, unknown>) => void) => {
      cb({ [key]: store[key] });
    }),
    set: vi.fn((items: Record<string, unknown>, cb?: () => void) => {
      Object.assign(store, items);
      cb?.();
    }),
    remove: vi.fn((key: string, cb?: () => void) => {
      delete store[key];
      cb?.();
    }),
    clear: vi.fn((cb?: () => void) => {
      for (const k of Object.keys(store)) {
        delete store[k];
      }
      cb?.();
    }),
  };
};

export interface ChromeMock {
  storage: { local: MemArea; sync: MemArea };
  runtime: {
    lastError: { message: string } | undefined;
    sendMessage: Mock;
    onInstalled: { addListener: Mock };
    onMessage: { addListener: Mock };
  };
  scripting: { executeScript: Mock };
  tabs: { query: Mock; sendMessage: Mock };
}

export const createChromeMock = (): ChromeMock => ({
  storage: { local: makeArea(), sync: makeArea() },
  runtime: {
    lastError: undefined,
    sendMessage: vi.fn(),
    onInstalled: { addListener: vi.fn() },
    onMessage: { addListener: vi.fn() },
  },
  scripting: { executeScript: vi.fn() },
  tabs: { query: vi.fn(), sendMessage: vi.fn() },
});

let current: ChromeMock = createChromeMock();

/** Installs a fresh chrome mock on `globalThis` and returns it. */
export const installChromeMock = (): ChromeMock => {
  current = createChromeMock();
  (globalThis as unknown as { chrome: unknown }).chrome = current;
  return current;
};

/** @returns the currently installed chrome mock. */
export const getChromeMock = (): ChromeMock => current;

/** Re-installs a clean chrome mock (call in `beforeEach`). */
export const resetChromeMock = (): ChromeMock => installChromeMock();
