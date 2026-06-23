/**
 * Playwright test fixtures: load the BUILT MV3 extension into a real Chromium and
 * expose the extension id + a static fixture server to every spec.
 *
 * MV3 loading pattern (the only one that works for a service-worker extension):
 *   - launchPersistentContext (extensions require a persistent profile)
 *   - --disable-extensions-except=<dist> + --load-extension=<dist>
 *   - channel "chromium" + headless: true (Playwright runs the "chromium"
 *     channel in the NEW headless mode, which loads extensions and runs their
 *     MV3 service workers — the old/classic headless mode does not)
 *
 * The extension id is resolved from the background SERVICE WORKER's URL
 * (`chrome-extension://<id>/...`), so specs can drive the popup page directly at
 * `chrome-extension://<id>/src/popup/index.html`.
 */
import {
  test as base,
  chromium,
  type BrowserContext,
  type Worker,
} from "@playwright/test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { startStaticServer, type StaticServer } from "./static-server";

const here = dirname(fileURLToPath(import.meta.url));
/** Repo root is two levels up from e2e/support/. */
export const REPO_ROOT = resolve(here, "..", "..");
/** The loadable unpacked extension produced by `npm run build`. */
export const DIST_DIR = resolve(REPO_ROOT, "dist");
/** Fixture HTML root. */
export const FIXTURES_DIR = resolve(here, "..", "fixtures");

export interface ExtensionFixtures {
  context: BrowserContext;
  extensionId: string;
  server: StaticServer;
}

/**
 * Resolves the extension id from the MV3 background service worker. If the worker
 * hasn't registered yet (cold start), waits for the context's `serviceworker`
 * event. Throws a clear error if no worker ever appears (the usual symptom of an
 * environment that can't run MV3 service workers).
 */
const resolveExtensionId = async (context: BrowserContext): Promise<string> => {
  const fromWorker = (w: Worker): string | null => {
    const match = /^chrome-extension:\/\/([a-z]{32})\//.exec(w.url());
    return match ? match[1] : null;
  };

  for (const w of context.serviceWorkers()) {
    const id = fromWorker(w);
    if (id) {
      return id;
    }
  }

  const worker = await context.waitForEvent("serviceworker", {
    timeout: 15_000,
  });
  const id = fromWorker(worker);
  if (!id) {
    throw new Error(
      `service worker URL did not match chrome-extension://<id>/: ${worker.url()}`,
    );
  }
  return id;
};

export const test = base.extend<ExtensionFixtures>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    if (!existsSync(resolve(DIST_DIR, "manifest.json"))) {
      throw new Error(
        `dist/manifest.json not found at ${DIST_DIR}. Run \`npm run build\` first.`,
      );
    }
    // A REAL temp user-data-dir is required: launching with "" (in-memory) makes
    // an extension-loaded persistent context hang for ~2 min on close. A concrete
    // profile dir closes in ~60ms. Each test gets a fresh profile so per-site
    // storage from one test never leaks into the next.
    const userDataDir = mkdtempSync(resolve(tmpdir(), "thememaker-e2e-"));
    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: "chromium",
      // Playwright maps headless:true to the new headless mode for the
      // "chromium" channel, which is required for MV3 service workers.
      headless: true,
      args: [
        `--disable-extensions-except=${DIST_DIR}`,
        `--load-extension=${DIST_DIR}`,
        "--no-first-run",
        "--no-default-browser-check",
      ],
    });
    await use(context);
    await context.close();
    rmSync(userDataDir, { recursive: true, force: true });
  },

  extensionId: async ({ context }, use) => {
    const id = await resolveExtensionId(context);
    await use(id);
  },

  // eslint-disable-next-line no-empty-pattern
  server: async ({}, use) => {
    const server = await startStaticServer(FIXTURES_DIR);
    await use(server);
    await server.close();
  },
});

export const expect = test.expect;
