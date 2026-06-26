/**
 * Marketing-asset generation (not part of the assertion suite).
 *
 * Composes store/promo images from the REAL product screenshots in `screenshots/`
 * (run `SHOTS=1 npx playwright test e2e/specs/screenshots.spec.ts` first) plus
 * clean text + branding — rendered as HTML and captured at the Chrome Web Store's
 * exact sizes. No AI, so the real UI pixels stay intact. Run explicitly:
 *
 *   SHOTS=1 npx playwright test e2e/specs/screenshots.spec.ts   # inputs
 *   MKT=1   npx playwright test e2e/specs/marketing.spec.ts     # outputs → marketing/
 */
import { test, REPO_ROOT } from "../support/fixtures";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

test.skip(!process.env.MKT, "marketing-asset generation — run with MKT=1");

const OUT = resolve(REPO_ROOT, "marketing");
const shot = (n: string) => `file://${resolve(REPO_ROOT, "screenshots", n)}`;
const FONT = `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;

const STYLE = `
  * { margin: 0; box-sizing: border-box; }
  .mark { border-radius: 8px; background: linear-gradient(135deg, #6366f1, #a855f7);
    box-shadow: 0 6px 18px rgba(124, 58, 237, 0.5); }
  .accent { background: linear-gradient(90deg, #818cf8, #c084fc);
    -webkit-background-clip: text; background-clip: text; color: transparent; }
`;

/** A captioned store screenshot (1280x800): real shot full-bleed + a top scrim. */
const captioned = (
  img: string,
  headline: string,
  sub: string,
) => `<!doctype html>
<html><head><meta charset="utf-8" /><style>${STYLE}
  .canvas { width: 1280px; height: 800px; position: relative; overflow: hidden; font-family: ${FONT}; }
  .shot { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .scrim { position: absolute; inset: 0;
    background: linear-gradient(160deg, rgba(9,9,20,.95) 0%, rgba(9,9,20,.72) 26%, rgba(9,9,20,0) 50%); }
  .head { position: absolute; top: 64px; left: 78px; right: 78px; }
  .brand { display: flex; align-items: center; gap: 11px; font-weight: 700; font-size: 18px;
    color: #cdd0ea; margin-bottom: 30px; }
  .brand .mark { width: 28px; height: 28px; }
  h1 { font-size: 54px; line-height: 1.04; letter-spacing: -.03em; color: #fff; font-weight: 800;
    max-width: 800px; margin-bottom: 16px; }
  .sub { font-size: 22px; line-height: 1.45; color: #c4c7e0; max-width: 660px; }
</style></head><body><div class="canvas">
  <img class="shot" src="${img}" />
  <div class="scrim"></div>
  <div class="head">
    <div class="brand"><span class="mark"></span> Thememaker</div>
    <h1>${headline}</h1>
    <div class="sub">${sub}</div>
  </div>
</div></body></html>`;

/** The marquee promo tile (1400x560): copy on the left, a tilted framed shot bleeding off the right. */
const marquee = `<!doctype html>
<html><head><meta charset="utf-8" /><style>${STYLE}
  .mq { width: 1400px; height: 560px; position: relative; overflow: hidden; font-family: ${FONT};
    background: radial-gradient(120% 140% at 12% 18%, #211a44 0%, #14132a 46%, #0c0c18 100%); }
  .left { position: absolute; left: 88px; top: 0; bottom: 0; width: 600px;
    display: flex; flex-direction: column; justify-content: center; }
  .brand { display: flex; align-items: center; gap: 12px; font-weight: 700; font-size: 19px;
    color: #cdd0ea; margin-bottom: 26px; }
  .brand .mark { width: 30px; height: 30px; }
  h1 { font-size: 58px; line-height: 1.03; letter-spacing: -.035em; color: #fff; font-weight: 800; margin-bottom: 18px; }
  .sub { font-size: 23px; line-height: 1.45; color: #c0c3dd; max-width: 520px; }
  .right { position: absolute; right: -70px; top: 70px; width: 780px;
    border-radius: 16px; overflow: hidden; border: 1px solid rgba(255,255,255,.09);
    box-shadow: 0 50px 120px rgba(0,0,0,.6); transform: perspective(1800px) rotateY(-13deg); }
  .right img { display: block; width: 100%; }
</style></head><body><div class="mq">
  <div class="left">
    <div class="brand"><span class="mark"></span> Thememaker</div>
    <h1>Recolor <span class="accent">any</span> website.</h1>
    <div class="sub">Dark mode, custom palettes, exact per-element colors — one click, and it sticks for every visit.</div>
  </div>
  <div class="right"><img src="${shot("dark-dashboard.png")}" /></div>
</div></body></html>`;

/** The small promo tile (440x280): compact brand mark + tagline. */
const small = `<!doctype html>
<html><head><meta charset="utf-8" /><style>${STYLE}
  .sm { width: 440px; height: 280px; position: relative; overflow: hidden; font-family: ${FONT};
    background: radial-gradient(130% 130% at 80% 10%, #2a1f55 0%, #16142e 50%, #0d0d1a 100%);
    padding: 36px 38px; display: flex; flex-direction: column; justify-content: space-between; }
  .mark { width: 46px; height: 46px; }
  h1 { font-size: 34px; letter-spacing: -.03em; color: #fff; font-weight: 800; line-height: 1.05; }
  .sub { font-size: 16px; color: #b9bcd8; margin-top: 8px; }
</style></head><body><div class="sm">
  <span class="mark"></span>
  <div><h1>Thememaker</h1><div class="sub">Your colors, every website.</div></div>
</div></body></html>`;

test("generate marketing assets", async ({ context }) => {
  mkdirSync(OUT, { recursive: true });
  const pieces = [
    {
      name: "feature-dark",
      w: 1280,
      h: 800,
      html: captioned(
        shot("dark-dashboard.png"),
        `Dark mode for <span class="accent">any</span> website`,
        `Turn a blinding white site dark — or any palette you like — with one click.`,
      ),
    },
    {
      name: "feature-color",
      w: 1280,
      h: 800,
      html: captioned(
        shot("themed-blog.png"),
        `Or any color you can <span class="accent">dream up</span>`,
        `Generate fresh schemes instantly. Every theme keeps text readable, contrast intact.`,
      ),
    },
    {
      name: "feature-popup",
      w: 1280,
      h: 800,
      html: captioned(
        shot("popup-framed.png"),
        `It lives in your <span class="accent">toolbar</span>`,
        `Generate, tune intensity, flip to dark, or pick exact colors — right where you browse.`,
      ),
    },
    {
      name: "feature-persist",
      w: 1280,
      h: 800,
      html: captioned(
        shot("dark-blog.png"),
        `Set it once. It <span class="accent">remembers</span>.`,
        `Themes persist per site and reapply the instant the page loads — no white flash.`,
      ),
    },
    { name: "promo-marquee-1400x560", w: 1400, h: 560, html: marquee },
    { name: "promo-small-440x280", w: 440, h: 280, html: small },
  ];
  for (const p of pieces) {
    const f = resolve(OUT, `${p.name}.html`);
    writeFileSync(f, p.html);
    const page = await context.newPage();
    await page.setViewportSize({ width: p.w, height: p.h });
    await page.goto(`file://${f}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(250);
    await page.screenshot({
      path: resolve(OUT, `${p.name}.png`),
      clip: { x: 0, y: 0, width: p.w, height: p.h },
    });
    await page.close();
  }
});
