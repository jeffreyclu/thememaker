/**
 * Promotional screen-capture VIDEO of the extension in action (not part of the
 * assertion suite). Records a short silent clip with Playwright's built-in video
 * recorder: a white demo page snapping into DARK mode live + in place (no
 * reload), a beat on the themed page, then the popup control surface.
 *
 * Output: `promo/thememaker-demo.webm` (+ `.mp4` when ffmpeg is present). Drop it
 * into an editor as a store / YouTube promo base. Run explicitly:
 *
 *   npm run build
 *   VIDEO=1 npx playwright test e2e/specs/promo-video.spec.ts
 *
 * Why its OWN persistent context (not the `context` test fixture): video
 * recording is a context-creation option (`recordVideo`), so the recorder has to
 * be configured when the context is launched. The extension-load args, the temp
 * `userDataDir`, the `chromium` channel + new headless, and the extension-id
 * resolution from the service worker all mirror `e2e/support/fixtures.ts`.
 */
import { test, expect, chromium, type Worker } from "@playwright/test";
import { REPO_ROOT, DIST_DIR, FIXTURES_DIR } from "../support/fixtures";
import {
  makePalette,
  openExtensionPage,
  waitForThemeApplied,
  enableSite,
} from "../support/apply";
import { schemeFromPalette } from "../../src/lib/scheme";
import { startStaticServer } from "../support/static-server";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

test.skip(!process.env.VIDEO, "promo-video capture — run with VIDEO=1");

const OUT_DIR = resolve(REPO_ROOT, "promo");
const SIZE = { width: 1280, height: 720 };

/** Resolves the extension id from the MV3 background service worker (mirrors fixtures.ts). */
const resolveExtensionId = async (
  serviceWorkers: Worker[],
  waitForWorker: () => Promise<Worker>,
): Promise<string> => {
  const fromWorker = (w: Worker): string | null => {
    const match = /^chrome-extension:\/\/([a-z]{32})\//.exec(w.url());
    return match ? match[1] : null;
  };
  for (const w of serviceWorkers) {
    const id = fromWorker(w);
    if (id) {
      return id;
    }
  }
  const worker = await waitForWorker();
  const id = fromWorker(worker);
  if (!id) {
    throw new Error(
      `service worker URL did not match chrome-extension://<id>/: ${worker.url()}`,
    );
  }
  return id;
};

test("record promo video", async () => {
  test.setTimeout(120_000);

  if (!existsSync(resolve(DIST_DIR, "manifest.json"))) {
    throw new Error(
      `dist/manifest.json not found at ${DIST_DIR}. Run \`npm run build\` first.`,
    );
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const userDataDir = mkdtempSync(resolve(tmpdir(), "thememaker-video-"));
  const videoDir = mkdtempSync(resolve(tmpdir(), "thememaker-vid-out-"));

  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: "chromium",
    headless: true,
    viewport: SIZE,
    args: [
      `--disable-extensions-except=${DIST_DIR}`,
      `--load-extension=${DIST_DIR}`,
      "--no-first-run",
      "--no-default-browser-check",
    ],
    recordVideo: { dir: videoDir, size: SIZE },
  });

  const server = await startStaticServer(FIXTURES_DIR);

  try {
    const extensionId = await resolveExtensionId(context.serviceWorkers(), () =>
      context.waitForEvent("serviceworker", { timeout: 15_000 }),
    );

    // The DARK theme to apply, built from the same helpers the e2e suite proves.
    const palette = makePalette("#3b82f6", "monochrome-dark");
    const options = { intensity: 92 };
    const scheme = schemeFromPalette(palette, options.intensity);

    // 1) Open the white demo blog at 1280x720 and hold on the ORIGINAL page.
    const page = await context.newPage();
    await page.setViewportSize(SIZE);
    await page.goto(server.url("/demo-blog.html"), {
      waitUntil: "networkidle",
    });
    await page.waitForTimeout(2_000); // ~2s on the original white page

    // 2) Apply the dark theme LIVE, IN PLACE (no reload) via the content script.
    // From an extension page, message the demo tab's content script directly —
    // the production apply path. The shipped extension has only activeTab+storage
    // (no `tabs`/host permission), so `tab.url` is empty and a url filter matches
    // nothing; instead we APPLY_SCHEME to EVERY tab and keep the one whose content
    // script replies `applied` (only the http demo tab has the listener).
    const ext = await openExtensionPage(context, extensionId);
    let liveApplied = false;
    try {
      const sendResult = await ext.evaluate(
        async ({
          palette,
          options,
          scheme,
        }: {
          palette: unknown;
          options: unknown;
          scheme: unknown;
        }) => {
          const tabs = await chrome.tabs.query({});
          const sendOne = (
            tabId: number,
          ): Promise<{ applied?: boolean } | null> =>
            new Promise((resolve) => {
              chrome.tabs.sendMessage(
                tabId,
                { type: "APPLY_SCHEME", palette, options, scheme },
                (r) => {
                  void chrome.runtime.lastError;
                  resolve(r ?? null);
                },
              );
            });
          let applied = false;
          for (const t of tabs) {
            if (typeof t.id !== "number") {
              continue;
            }
            const response = await sendOne(t.id);
            if (response?.applied) {
              applied = true;
            }
          }
          return { ok: applied, tabCount: tabs.length };
        },
        { palette, options, scheme },
      );
      liveApplied = Boolean((sendResult as { ok?: boolean })?.ok);
      // eslint-disable-next-line no-console
      console.log(
        `[promo-video] live APPLY_SCHEME result: ${JSON.stringify(sendResult)}`,
      );
    } finally {
      await ext.close();
    }

    // Fallback if the live sendMessage didn't land: enable the site + reload, the
    // auto-reapply path the e2e proves works (a clean transition, with a reload).
    if (!liveApplied) {
      // eslint-disable-next-line no-console
      console.log(
        "[promo-video] live apply did not land — using enableSite + reload fallback",
      );
      const ext2 = await openExtensionPage(context, extensionId);
      await enableSite(ext2, server.origin, palette, options.intensity);
      await ext2.close();
      await page.bringToFront();
      await page.reload({ waitUntil: "networkidle" });
    }

    // 3) Confirm the theme actually applied: the single <style id="themeMaker">.
    await page.bringToFront();
    await waitForThemeApplied(page);
    const styleReached = await page.evaluate(
      () => document.querySelector("style#themeMaker") !== null,
    );
    // eslint-disable-next-line no-console
    console.log(
      `[promo-video] style#themeMaker reached on demo tab: ${styleReached}`,
    );
    expect(styleReached).toBe(true);

    // 4) Beat on the themed page — let the recolor + time-sliced surface walk land.
    await page.waitForTimeout(2_500);

    // 5) A short beat scrolling the themed page for visual motion, then back up.
    await page.evaluate(() =>
      window.scrollTo({ top: 600, behavior: "smooth" }),
    );
    await page.waitForTimeout(1_500);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
    await page.waitForTimeout(1_200);

    // 6) End on the popup control surface, tight viewport, hold ~2s.
    const popup = await context.newPage();
    await popup.setViewportSize({ width: 340, height: 560 });
    await popup.goto(`chrome-extension://${extensionId}/src/popup/index.html`, {
      waitUntil: "networkidle",
    });
    await popup.waitForTimeout(2_000);

    // The demo page is the "hero" clip — capture its on-disk path before close.
    const demoVideo = page.video();
    const videoSrcPath = demoVideo ? await demoVideo.path() : null;
    await popup.close();
    await page.close();

    // 7) Close the context to FLUSH the videos to disk, then copy the hero clip
    // out of the temp recordVideo dir. (`video.saveAs()` needs the context alive,
    // and the file isn't fully written until close — so copy from disk after.)
    await context.close();

    const webmOut = resolve(OUT_DIR, "thememaker-demo.webm");
    if (videoSrcPath && existsSync(videoSrcPath)) {
      copyFileSync(videoSrcPath, webmOut);
    }
    expect(existsSync(webmOut)).toBe(true);
    const webmSize = statSync(webmOut).size;
    // eslint-disable-next-line no-console
    console.log(`[promo-video] wrote ${webmOut} (${webmSize} bytes)`);
    expect(webmSize).toBeGreaterThan(50_000); // non-trivial

    // 8) Optional .mp4 via ffmpeg, plus duration via ffprobe, when available.
    const has = (bin: string): boolean => {
      try {
        execFileSync("which", [bin], { stdio: "ignore" });
        return true;
      } catch {
        return false;
      }
    };
    if (has("ffmpeg")) {
      const mp4Out = resolve(OUT_DIR, "thememaker-demo.mp4");
      execFileSync(
        "ffmpeg",
        [
          "-y",
          "-i",
          webmOut,
          "-c:v",
          "libx264",
          "-pix_fmt",
          "yuv420p",
          "-movflags",
          "+faststart",
          mp4Out,
        ],
        { stdio: "ignore" },
      );
      // eslint-disable-next-line no-console
      console.log(
        `[promo-video] wrote ${mp4Out} (${statSync(mp4Out).size} bytes)`,
      );
    } else {
      // eslint-disable-next-line no-console
      console.log("[promo-video] ffmpeg not found — skipped .mp4");
    }
    if (has("ffprobe")) {
      const dur = execFileSync(
        "ffprobe",
        [
          "-v",
          "error",
          "-show_entries",
          "format=duration",
          "-of",
          "default=noprint_wrappers=1:nokey=1",
          webmOut,
        ],
        { encoding: "utf8" },
      ).trim();
      // eslint-disable-next-line no-console
      console.log(`[promo-video] duration: ${dur}s`);
    } else {
      // eslint-disable-next-line no-console
      console.log("[promo-video] ffprobe not found — duration unknown");
    }
  } finally {
    await server.close();
    // Context is closed in the happy path; close defensively if an error left it open.
    try {
      await context.close();
    } catch {
      // already closed
    }
    rmSync(userDataDir, { recursive: true, force: true });
    rmSync(videoDir, { recursive: true, force: true });
  }
});
