import { test, expect } from "../support/fixtures";
import {
  makePalette,
  enableSite,
  openExtensionPage,
  waitForThemeApplied,
} from "../support/apply";
import {
  textColorsOf,
  effectiveBackgroundsOf,
  contrastAgainstOwnBg,
  waitForThemeSettled,
} from "../support/page-helpers";

/**
 * DYNAMIC-SPA STABILITY — the Gmail-flicker regression suite.
 *
 * The fixture (`dynamic-spa.html`) is a churny inbox: a list of email rows whose
 * BACKGROUND class swaps on hover/select, content that is TORN DOWN + REBUILT on
 * "navigate in/out", and rows APPENDED on "load more". Before the fix, row text
 * was colored against the LIVE painted ancestor bg and blended toward each
 * element's current computed color, so a row's text color depended on transient
 * DOM state / paint order / timing — it FLICKERED, was INCONSISTENT after
 * navigating in/out, and changed across reloads.
 *
 * The fix makes text color DETERMINISTIC: a pure function of (palette role,
 * deterministic reference surface, size). These specs assert that guarantee
 * against what the REAL browser renders.
 */

const ROW_TEXT = "#list .row .subject, #list .row .snippet";
const SUBJECTS = "#list .row .subject";

test("DETERMINISM: row text color is identical before vs after a tear-down + rebuild", async ({
  context,
  extensionId,
  server,
}) => {
  const ext = await openExtensionPage(context, extensionId);
  await enableSite(ext, server.origin, makePalette(), 80);

  const page = await context.newPage();
  await page.goto(server.url("/dynamic-spa.html"));
  await waitForThemeApplied(page);
  await waitForThemeSettled(page);

  const before = await textColorsOf(page, SUBJECTS);
  expect(before.length).toBeGreaterThanOrEqual(10);
  // Every subject is the SAME role → the SAME deterministic color (no per-row
  // drift from transient paint order).
  expect(new Set(before).size).toBe(1);

  // "Navigate in" (tear the whole list down) then "navigate out" (rebuild from
  // scratch) — the exact path that made row colors inconsistent.
  await page.evaluate(() => {
    const w = window as unknown as { __inbox: { openDetail(): void } };
    w.__inbox.openDetail();
  });
  await waitForThemeSettled(page);
  await page.evaluate(() => {
    const w = window as unknown as { __inbox: { closeDetail(): void } };
    w.__inbox.closeDetail();
  });
  await waitForThemeSettled(page);

  const after = await textColorsOf(page, SUBJECTS);
  expect(after.length).toBe(before.length);
  // The rebuilt rows get the IDENTICAL color the originals had.
  expect(after).toEqual(before);
});

test("DETERMINISM: row text color is identical after a reload (re-apply)", async ({
  context,
  extensionId,
  server,
}) => {
  const ext = await openExtensionPage(context, extensionId);
  await enableSite(ext, server.origin, makePalette(), 80);

  const page = await context.newPage();
  await page.goto(server.url("/dynamic-spa.html"));
  await waitForThemeApplied(page);
  await waitForThemeSettled(page);
  const before = await textColorsOf(page, ROW_TEXT);
  expect(before.length).toBeGreaterThanOrEqual(20);

  // A reload re-runs the whole content-script + engine path from scratch.
  await page.reload();
  await waitForThemeApplied(page);
  await waitForThemeSettled(page);
  const after = await textColorsOf(page, ROW_TEXT);

  expect(after).toEqual(before);
});

test("NO FLICKER: after a burst of mutations settles, colors stop changing and the style is idempotent", async ({
  context,
  extensionId,
  server,
}) => {
  const ext = await openExtensionPage(context, extensionId);
  await enableSite(ext, server.origin, makePalette(), 80);

  const page = await context.newPage();
  await page.goto(server.url("/dynamic-spa.html"));
  await waitForThemeApplied(page);
  await waitForThemeSettled(page);

  // Fire a heavy burst: load more rows several times in quick succession (the
  // infinite-scroll churn). The debounced observer must coalesce these.
  await page.evaluate(() => {
    const w = window as unknown as { __inbox: { loadMore(n: number): void } };
    for (let i = 0; i < 6; i += 1) {
      w.__inbox.loadMore(5);
    }
  });
  await waitForThemeSettled(page);

  // Sample the engine's <style> twice across a quiet window — it must NOT change
  // on its own (no self-triggering observer loop).
  const css1 = await page.evaluate(
    () => document.getElementById("themeMaker")?.textContent ?? "",
  );
  await page.waitForTimeout(700); // > the 250ms debounce, with margin
  const css2 = await page.evaluate(
    () => document.getElementById("themeMaker")?.textContent ?? "",
  );
  expect(css2).toBe(css1);

  // Colors are frozen too: sampling twice yields identical values.
  const a = await textColorsOf(page, ROW_TEXT);
  await page.waitForTimeout(400);
  const b = await textColorsOf(page, ROW_TEXT);
  expect(b).toEqual(a);
  // All rows still share one deterministic subject color.
  const subjects = await textColorsOf(page, SUBJECTS);
  expect(new Set(subjects).size).toBe(1);
});

test("CONTRAST: every row's text meets WCAG AA against its ACTUAL rendered background, including hover/selected", async ({
  context,
  extensionId,
  server,
}) => {
  const ext = await openExtensionPage(context, extensionId);
  await enableSite(ext, server.origin, makePalette(), 80);

  const page = await context.newPage();
  await page.goto(server.url("/dynamic-spa.html"));
  await waitForThemeApplied(page);
  await waitForThemeSettled(page);

  // Put rows into a MIX of background states: row 0 normal, row 1 hovered, row 2
  // selected (the inbox's three row-bg classes). The engine themed these rows
  // against their deterministic role surface, so the text must clear AA against
  // whichever of these backgrounds actually renders.
  await page.evaluate(() => {
    const w = window as unknown as {
      __inbox: { rowState(i: number, s: string): void };
    };
    w.__inbox.rowState(1, "hover");
    w.__inbox.rowState(2, "selected");
  });
  await waitForThemeSettled(page);

  const samples = await contrastAgainstOwnBg(page, ROW_TEXT);
  expect(samples.length).toBeGreaterThanOrEqual(20);
  const failures = samples.filter((s) => s.ratio < 4.5 - 0.05);
  expect(
    failures,
    `AA failures vs rendered bg:\n${failures
      .map((f) => `  ${f.color} on ${f.background} = ${f.ratio}`)
      .join("\n")}`,
  ).toEqual([]);

  // Explicitly verify the SELECTED row (the darkest swapped bg) passes — this is
  // the state the old engine missed (it floored against a different bg than the
  // one that rendered).
  const selectedSubject = await contrastAgainstOwnBg(
    page,
    "#list .row.is-selected .subject",
  );
  expect(selectedSubject.length).toBe(1);
  expect(selectedSubject[0].ratio).toBeGreaterThanOrEqual(4.5 - 0.05);
});

// Contrast must hold across the intensity range. At LOW intensity the surface
// backgrounds are blended closer to the page's ORIGINAL, so the rendered row bg
// differs most from the deterministic reference surface the text was floored
// against — the riskiest case for the stability-first trade-off. We verify the
// REAL rendered contrast at both ends of the dial.
for (const intensity of [10, 100]) {
  test(`CONTRAST: rows stay AA against their rendered bg at intensity ${intensity} (incl. hover/selected)`, async ({
    context,
    extensionId,
    server,
  }) => {
    const ext = await openExtensionPage(context, extensionId);
    await enableSite(ext, server.origin, makePalette(), intensity);

    const page = await context.newPage();
    await page.goto(server.url("/dynamic-spa.html"));
    await waitForThemeApplied(page);
    await waitForThemeSettled(page);

    await page.evaluate(() => {
      const w = window as unknown as {
        __inbox: { rowState(i: number, s: string): void };
      };
      w.__inbox.rowState(1, "hover");
      w.__inbox.rowState(2, "selected");
    });
    await waitForThemeSettled(page);

    const samples = await contrastAgainstOwnBg(page, ROW_TEXT);
    expect(samples.length).toBeGreaterThanOrEqual(20);
    const failures = samples.filter((s) => s.ratio < 4.5 - 0.05);
    expect(
      failures,
      `intensity ${intensity} AA failures vs rendered bg:\n${failures
        .map((f) => `  ${f.color} on ${f.background} = ${f.ratio}`)
        .join("\n")}`,
    ).toEqual([]);
  });
}

test("NO TYPING FLICKER: new text in a contenteditable is correct on insertion and the style doesn't churn", async ({
  context,
  extensionId,
  server,
}) => {
  const ext = await openExtensionPage(context, extensionId);
  await enableSite(ext, server.origin, makePalette(), 80);

  const page = await context.newPage();
  await page.goto(server.url("/dynamic-spa.html"));
  await waitForThemeApplied(page);
  await waitForThemeSettled(page);

  // The compose box is a themed surface; its inherited text color is set.
  const composeColor = await page.evaluate(
    () => getComputedStyle(document.getElementById("compose")!).color,
  );
  expect(composeColor).toBeTruthy();

  // Snapshot the engine's <style> + the compose element's data-attr BEFORE typing.
  const styleBefore = await page.evaluate(
    () => document.getElementById("themeMaker")?.textContent ?? "",
  );

  // Type 40 "keystrokes" — each appends a text node / span to the compose box.
  // Capture the computed color of the newly appended node IMMEDIATELY (same tick
  // as insertion): it must already equal the compose box's inherited color, with
  // NO transition / re-theme needed.
  const typed = await page.evaluate(() => {
    const w = window as unknown as {
      __inbox: { typeIntoCompose(n: number): string };
    };
    const composeColor = getComputedStyle(
      document.getElementById("compose")!,
    ).color;
    // Append nodes and immediately read the last node's color — no awaiting, so
    // the observer/debounce has NOT had a chance to run.
    const lastColor = w.__inbox.typeIntoCompose(40);
    return { composeColor, lastColor };
  });
  // The freshly inserted span is ALREADY the right (inherited) color — no flash.
  expect(typed.lastColor).toBe(typed.composeColor);

  // Let any (debounced) observer work settle, then assert the engine did NOT
  // re-theme inside the editable region: the compose box is NOT re-tagged, none
  // of its children are tagged, and the <style> is byte-identical (no churn).
  await waitForThemeSettled(page);
  const editableState = await page.evaluate(() => {
    const box = document.getElementById("compose")!;
    return {
      boxTagged: box.hasAttribute("data-thememaker"),
      childrenTagged: box.querySelectorAll("[data-thememaker]").length,
      style: document.getElementById("themeMaker")?.textContent ?? "",
    };
  });
  // The compose box itself is a surface and may be tagged ONCE (its bg), but
  // nothing INSIDE it is ever themed/tagged (editable subtree is skipped).
  expect(editableState.childrenTagged).toBe(0);
  // The stylesheet did not grow from typing (no per-keystroke rules appended).
  expect(editableState.style).toBe(styleBefore);
});

test("PERF: a large mutation burst stays within the work budget (bounded, no runaway)", async ({
  context,
  extensionId,
  server,
}) => {
  const ext = await openExtensionPage(context, extensionId);
  await enableSite(ext, server.origin, makePalette(), 80);

  const page = await context.newPage();
  await page.goto(server.url("/dynamic-spa.html"));
  await waitForThemeApplied(page);
  await waitForThemeSettled(page);

  // Measure the longest main-thread block (frame-to-frame gap) while a big burst
  // of 2000 rows (6000 nodes) is themed. The engine TIME-SLICES + yields, so no
  // single block should approach the old ~400ms synchronous walk.
  await page.evaluate(() => {
    const w = window as unknown as { __gaps: number[]; __stop?: boolean };
    w.__gaps = [];
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      w.__gaps.push(now - last);
      last = now;
      if (!w.__stop) {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  });

  await page.evaluate(() => {
    const w = window as unknown as { __inbox: { loadMore(n: number): void } };
    w.__inbox.loadMore(2000);
  });
  await waitForThemeSettled(page);
  await page.waitForTimeout(1000);

  const res = await page.evaluate(() => {
    const w = window as unknown as { __gaps: number[]; __stop?: boolean };
    w.__stop = true;
    const gaps = w.__gaps.slice().sort((a, b) => b - a);
    return {
      maxGap: Math.round(gaps[0] ?? 0),
      themedSurfaces: document.querySelectorAll("[data-thememaker]").length,
      cssBytes: (document.getElementById("themeMaker")?.textContent ?? "")
        .length,
    };
  });

  // BUDGET: no single main-thread block exceeds ~120ms (generous CI headroom;
  // locally this is ~50ms — vs the old ~400ms synchronous walk). The key is that
  // the work is SLICED, so the page never freezes for ~half a second.
  expect(
    res.maxGap,
    `longest main-thread block was ${res.maxGap}ms`,
  ).toBeLessThan(120);

  // Work is BOUNDED: only SURFACES are themed (text is tag/inheritance-based), so
  // the themed count is ~the number of rows, not every node, and the <style> grew
  // proportionally (no per-text-node rules).
  expect(res.themedSurfaces).toBeGreaterThan(1000);
  expect(res.themedSurfaces).toBeLessThan(4000);
});

test("PERF: total themed elements are capped (no unbounded growth on a huge DOM)", async ({
  context,
  extensionId,
  server,
}) => {
  const ext = await openExtensionPage(context, extensionId);
  await enableSite(ext, server.origin, makePalette(), 80);

  const page = await context.newPage();
  await page.goto(server.url("/dynamic-spa.html"));
  await waitForThemeApplied(page);
  await waitForThemeSettled(page);

  // Blow WAY past the MAX_THEMED budget (12k): 15000 rows = 45000 nodes, ~15000
  // surfaces. The engine must STOP tagging past the cap (and warn once), so the
  // themed count is bounded and the <style> can't grow without limit. We poll the
  // themed count until it stops climbing (the cap halts further tagging), rather
  // than waiting on style-settle (the huge DOM keeps the observer busy a while).
  await page.evaluate(() => {
    const w = window as unknown as { __inbox: { bulkLoad(n: number): void } };
    w.__inbox.bulkLoad(15000);
  });
  await page
    .waitForFunction(
      () => {
        const w = window as unknown as {
          __tmCount?: number;
          __tmStable2?: number;
        };
        const n = document.querySelectorAll("[data-thememaker]").length;
        if (n === w.__tmCount) {
          w.__tmStable2 = (w.__tmStable2 ?? 0) + 1;
        } else {
          w.__tmStable2 = 0;
          w.__tmCount = n;
        }
        // Reached the cap, OR the count has been stable for ~1s (no more tagging).
        return n >= 12000 || (w.__tmStable2 ?? 0) >= 5;
      },
      undefined,
      { timeout: 30_000, polling: 200 },
    )
    .catch(() => {
      /* fall through to the assertion below, which reports the real count */
    });

  const themed = await page.evaluate(
    () => document.querySelectorAll("[data-thememaker]").length,
  );
  // Bounded at/around the cap (a slice may slightly overrun before the check),
  // and NOT the full ~15000 surfaces (proves the cap stopped further tagging).
  expect(themed).toBeGreaterThan(8000);
  expect(themed).toBeLessThanOrEqual(13000);
});

test("SPECIFICITY: the engine's themed text WINS over the site's !important class colors, across state swaps", async ({
  context,
  extensionId,
  server,
}) => {
  const ext = await openExtensionPage(context, extensionId);
  await enableSite(ext, server.origin, makePalette(), 80);

  const page = await context.newPage();
  await page.goto(server.url("/dynamic-spa.html"));
  await waitForThemeApplied(page);
  await waitForThemeSettled(page);

  // The site colors the row text with `!important` CLASS rules (specificity
  // >= (0,1,0)) that SWAP on hover/selected: subject/snippet are #202124 normal,
  // #0b57d0 hovered, #b3261e selected; the rowlink is #1a73e8 / #b3261e. If the
  // engine's text rules lost to these (the bare-tag-specificity bug), the
  // rendered color would equal one of these and DRIFT as the class swaps.
  const SITE_COLORS = new Set([
    "rgb(32, 33, 36)", // #202124 — c-normal
    "rgb(11, 87, 208)", // #0b57d0 — c-hover
    "rgb(179, 38, 30)", // #b3261e — c-sel
    "rgb(26, 115, 232)", // #1a73e8 — .rowlink
  ]);

  const sampleAll = async () => ({
    subjects: await textColorsOf(page, SUBJECTS),
    snippets: await textColorsOf(page, "#list .row .snippet"),
    links: await textColorsOf(page, "#list .row a.rowlink"),
  });

  // NORMAL state.
  const normal = await sampleAll();
  expect(normal.subjects.length).toBeGreaterThanOrEqual(10);
  for (const c of [...normal.subjects, ...normal.snippets, ...normal.links]) {
    expect(SITE_COLORS.has(c), `themed text lost to a site color: ${c}`).toBe(
      false,
    );
  }
  // All subjects share ONE engine color (deterministic role), not the site's.
  expect(new Set(normal.subjects).size).toBe(1);

  // Put rows into hover / selected — the site swaps its class colors. The
  // engine's rendered color must NOT change and must still beat the site.
  await page.evaluate(() => {
    const w = window as unknown as {
      __inbox: { rowState(i: number, s: string): void };
    };
    w.__inbox.rowState(1, "hover");
    w.__inbox.rowState(2, "selected");
  });
  await waitForThemeSettled(page);

  const swapped = await sampleAll();
  for (const c of [
    ...swapped.subjects,
    ...swapped.snippets,
    ...swapped.links,
  ]) {
    expect(
      SITE_COLORS.has(c),
      `themed text lost to a swapped site color: ${c}`,
    ).toBe(false);
  }
  // The hovered (row 1) and selected (row 2) subjects are the SAME engine color
  // as a normal row — the site's per-state color swap did NOT show through.
  expect(swapped.subjects[1]).toBe(normal.subjects[0]);
  expect(swapped.subjects[2]).toBe(normal.subjects[0]);
  // The link inside the selected row also keeps the engine's link color.
  expect(swapped.links[2]).toBe(normal.links[0]);
});

test("ABOVE THE FOLD: in-viewport rows theme before off-screen ones (perceived speed)", async ({
  context,
  extensionId,
  server,
}) => {
  const ext = await openExtensionPage(context, extensionId);
  await enableSite(ext, server.origin, makePalette(), 80);

  const page = await context.newPage();
  // A small viewport so MOST rows fall below the fold.
  await page.setViewportSize({ width: 900, height: 600 });
  await page.goto(server.url("/dynamic-spa.html"));
  await waitForThemeApplied(page);
  await waitForThemeSettled(page);

  // Lazy-load a BIG chunk of rows in one shot (the realistic infinite-scroll
  // case). The engine's observer enqueues this subtree with VIEWPORT PRIORITY and
  // streams it in time-sliced — so the first themed rows should be the ones the
  // user can actually see, while far-below-the-fold rows fill in afterward.
  await page.evaluate(() => {
    const w = window as unknown as { __inbox: { bulkLoad(n: number): void } };
    w.__inbox.bulkLoad(3000);
  });

  // As soon as ANY of the newly-added rows is themed, snapshot which rows are
  // themed: an in-viewport row must be themed, a far off-screen one must not be
  // (yet) — proving above-the-fold priority. We poll until the first in-viewport
  // new row is tagged, then immediately check a far row.
  const probe = await page.waitForFunction(
    () => {
      const rows = Array.from(
        document.querySelectorAll("#list .row"),
      ) as HTMLElement[];
      // First in-viewport row and a far (>4 viewports down) row.
      let vis = -1;
      let far = -1;
      for (let i = 0; i < rows.length; i += 1) {
        const r = rows[i].getBoundingClientRect();
        if (vis < 0 && r.top < window.innerHeight && r.bottom > 0) {
          vis = i;
        }
        if (far < 0 && r.top > window.innerHeight * 4) {
          far = i;
        }
      }
      if (vis < 0 || far < 0) {
        return false;
      }
      const visThemed = rows[vis].hasAttribute("data-thememaker");
      if (!visThemed) {
        return false; // wait until the visible row is themed
      }
      return {
        visThemed,
        farThemed: rows[far].hasAttribute("data-thememaker"),
        vis,
        far,
      };
    },
    undefined,
    { timeout: 10_000, polling: 16 },
  );
  const snap = (await probe.jsonValue()) as {
    visThemed: boolean;
    farThemed: boolean;
    vis: number;
    far: number;
  };

  // The visible row IS themed; the far off-screen row is DEFERRED (not yet).
  expect(snap.visThemed).toBe(true);
  expect(
    snap.farThemed,
    `far row (${snap.far}) themed at the same time as the visible row (${snap.vis}) — viewport priority not applied`,
  ).toBe(false);

  // Eventually the off-screen rows stream in too (the rest of the queue drains).
  await page.waitForFunction(
    (far: number) => {
      const rows = document.querySelectorAll("#list .row");
      return (rows[far] as HTMLElement)?.hasAttribute("data-thememaker");
    },
    snap.far,
    { timeout: 20_000 },
  );
});

// ---------------------------------------------------------------------------
// SURFACE-COLOR STABILITY — the DJ-mixer fix (the core regression).
//
// A surface's THEME color is now a PURE FUNCTION OF ITS ROLE, never of its
// (volatile, per-node) original background. These specs drive the exact failure
// modes the user saw on real Gmail/Calendar — virtualized RECYCLING of DOM nodes,
// MIXED/transparent original row bgs, and hover/selected bg swaps — and assert
// against what the REAL browser renders.
// ---------------------------------------------------------------------------
const ROWS = "#list .row";

test("(a) FULL intensity: all equivalent rows render ONE themed surface bg, even with MIXED original bgs (no '2 colors', none un-themed)", async ({
  context,
  extensionId,
  server,
}) => {
  const ext = await openExtensionPage(context, extensionId);
  await enableSite(ext, server.origin, makePalette(), 100);

  const page = await context.newPage();
  await page.goto(server.url("/dynamic-spa.html"));
  await waitForThemeApplied(page);
  // Render rows with MIXED original backgrounds (white / gray / striped /
  // transparent) — the read/unread/zebra/transparent mix a real inbox has.
  await page.evaluate(() => {
    const w = window as unknown as {
      __inbox: { renderMixed(n: number): void };
    };
    w.__inbox.renderMixed(12);
  });
  await waitForThemeSettled(page);

  // Every row is a generic surface → ONE fixed theme color, regardless of its
  // (wildly different) original bg. A TRANSPARENT row inherits the themed `#list`
  // backdrop (the same fixed surface), so its EFFECTIVE rendered bg matches too —
  // killing "some rows stay light". So all 12 effective backgrounds are equal.
  const bgs = await effectiveBackgroundsOf(page, ROWS);
  expect(bgs.length).toBe(12);
  expect(
    new Set(bgs).size,
    `rows rendered ${new Set(bgs).size} distinct effective bgs (expected 1): ${[...new Set(bgs)].join(", ")}`,
  ).toBe(1);

  // None left at an original light bg (white/gray/striped) — all are themed.
  const ORIGINALS = new Set([
    "rgb(255, 255, 255)", // bg-white / page default
    "rgb(241, 243, 244)", // bg-gray
    "rgb(250, 250, 250)", // bg-stripe
  ]);
  expect(ORIGINALS.has(bgs[0]), `rows left un-themed at ${bgs[0]}`).toBe(false);
});

test("(b) a RECYCLED node keeps its themed surface bg when reused for new content (no random change on 'scroll')", async ({
  context,
  extensionId,
  server,
}) => {
  const ext = await openExtensionPage(context, extensionId);
  await enableSite(ext, server.origin, makePalette(), 100);

  const page = await context.newPage();
  await page.goto(server.url("/dynamic-spa.html"));
  await waitForThemeApplied(page);
  await page.evaluate(() => {
    const w = window as unknown as {
      __inbox: { renderMixed(n: number): void };
    };
    w.__inbox.renderMixed(12);
  });
  await waitForThemeSettled(page);

  const before = await effectiveBackgroundsOf(page, ROWS);

  // "Scroll": REUSE the same DOM nodes for new content AND swap each row's
  // original-bg class. This is the recycling that made the old engine drift.
  await page.evaluate(() => {
    const w = window as unknown as { __inbox: { recycleScroll(): void } };
    w.__inbox.recycleScroll();
  });
  await waitForThemeSettled(page);

  const after = await effectiveBackgroundsOf(page, ROWS);
  // Same nodes, new content + new original bg → IDENTICAL themed bgs (no random
  // change), still all one color.
  expect(after).toEqual(before);
  expect(new Set(after).size).toBe(1);
});

test("(c) a row's themed surface bg does NOT change when its ORIGINAL bg changes (hover/selected/drag)", async ({
  context,
  extensionId,
  server,
}) => {
  const ext = await openExtensionPage(context, extensionId);
  await enableSite(ext, server.origin, makePalette(), 100);

  const page = await context.newPage();
  await page.goto(server.url("/dynamic-spa.html"));
  await waitForThemeApplied(page);
  await waitForThemeSettled(page);

  const before = await effectiveBackgroundsOf(page, ROWS);

  // Swap row 1 → hover, row 2 → selected (the inbox's bg-class swaps). The
  // ORIGINAL bg of those rows changes; the THEMED bg must not.
  await page.evaluate(() => {
    const w = window as unknown as {
      __inbox: { rowState(i: number, s: string): void };
    };
    w.__inbox.rowState(1, "hover");
    w.__inbox.rowState(2, "selected");
  });
  await waitForThemeSettled(page);

  const after = await effectiveBackgroundsOf(page, ROWS);
  expect(after).toEqual(before);
  // The hovered + selected rows are the SAME themed surface as a normal row.
  expect(after[1]).toBe(before[0]);
  expect(after[2]).toBe(before[0]);
});

test("(d) themed surface bgs are DETERMINISTIC across re-apply + reload (byte-identical)", async ({
  context,
  extensionId,
  server,
}) => {
  const ext = await openExtensionPage(context, extensionId);
  await enableSite(ext, server.origin, makePalette(), 100);

  const page = await context.newPage();
  await page.goto(server.url("/dynamic-spa.html"));
  await waitForThemeApplied(page);
  await page.evaluate(() => {
    const w = window as unknown as {
      __inbox: { renderMixed(n: number): void };
    };
    w.__inbox.renderMixed(12);
  });
  await waitForThemeSettled(page);
  const first = await effectiveBackgroundsOf(page, ROWS);
  const css1 = await page.evaluate(
    () => document.getElementById("themeMaker")?.textContent ?? "",
  );

  // Reload re-runs the whole content-script + engine path from scratch.
  await page.reload();
  await waitForThemeApplied(page);
  await page.evaluate(() => {
    const w = window as unknown as {
      __inbox: { renderMixed(n: number): void };
    };
    w.__inbox.renderMixed(12);
  });
  await waitForThemeSettled(page);
  const after = await effectiveBackgroundsOf(page, ROWS);
  const css2 = await page.evaluate(
    () => document.getElementById("themeMaker")?.textContent ?? "",
  );

  expect(after).toEqual(first);
  // The base + role rules in the <style> are byte-identical across reloads (the
  // per-element surface ids may renumber, but the surface/role COLORS do not).
  const baseRules = (css: string): string =>
    css
      .split("\n")
      .filter((l) => !/^\[data-thememaker="\d+"\]/.test(l))
      .join("\n");
  expect(baseRules(css2)).toBe(baseRules(css1));
});

test("(e) AA holds: every row's text is AA against the FIXED themed surface, across mixed bgs + hover/selected", async ({
  context,
  extensionId,
  server,
}) => {
  const ext = await openExtensionPage(context, extensionId);
  await enableSite(ext, server.origin, makePalette(), 100);

  const page = await context.newPage();
  await page.goto(server.url("/dynamic-spa.html"));
  await waitForThemeApplied(page);
  await page.evaluate(() => {
    const w = window as unknown as {
      __inbox: {
        renderMixed(n: number): void;
        rowState(i: number, s: string): void;
      };
    };
    w.__inbox.renderMixed(12);
    w.__inbox.rowState(1, "hover");
    w.__inbox.rowState(2, "selected");
  });
  await waitForThemeSettled(page);

  const samples = await contrastAgainstOwnBg(page, ROW_TEXT);
  expect(samples.length).toBeGreaterThanOrEqual(20);
  const failures = samples.filter((s) => s.ratio < 4.5 - 0.05);
  expect(
    failures,
    `AA failures vs rendered bg:\n${failures
      .map((f) => `  ${f.color} on ${f.background} = ${f.ratio}`)
      .join("\n")}`,
  ).toEqual([]);
});

// ---------------------------------------------------------------------------
// PRE-PAINT TAGGING + IMAGE-BACKGROUND PRESERVATION (virtualized real sites).
//
// 1. A virtualized grid appends cards on "scroll". A newly-added IN-VIEWPORT card
//    must be themed in the SAME tick it is inserted (the observer microtask runs
//    before paint), so it never flashes white. Off-screen cards still theme later.
// 2. Elements whose background IS a real image (`url(...)`) must be PRESERVED: the
//    engine must NOT set `background-image: none` or paint a solid color over them.
// ---------------------------------------------------------------------------

test("(pre-paint) a newly-inserted IN-VIEWPORT card is themed in the SAME tick (no white flash), before any timer/idle runs", async ({
  context,
  extensionId,
  server,
}) => {
  const ext = await openExtensionPage(context, extensionId);
  await enableSite(ext, server.origin, makePalette(), 100);

  const page = await context.newPage();
  await page.goto(server.url("/dynamic-spa.html"));
  await waitForThemeApplied(page);
  await waitForThemeSettled(page);

  // The deterministic themed generic-surface color (an existing card already on
  // the page shares it — generic surfaces all map to one fixed color).
  await page.evaluate(() => {
    const w = window as unknown as {
      __inbox: { addCards(n: number): string[] };
    };
    w.__inbox.addCards(1);
  });
  await waitForThemeSettled(page);
  const themedSurface = await page.evaluate(
    () =>
      getComputedStyle(document.querySelector("#grid .card") as HTMLElement)
        .backgroundColor,
  );

  // Now insert a card and read its computed bg after ONLY a microtask drain — the
  // MutationObserver callback (a microtask, pre-paint) must have themed it. NO
  // setTimeout / requestAnimationFrame / requestIdleCallback is allowed to run, so
  // this proves the card is themed the instant it exists (no flash).
  const result = await page.evaluate(async () => {
    const w = window as unknown as {
      __inbox: { addCards(n: number): string[] };
    };
    const [sel] = w.__inbox.addCards(1);
    // Drain microtasks (the observer callback runs here) WITHOUT yielding to any
    // timer/raf/idle.
    await Promise.resolve();
    await Promise.resolve();
    const el = document.querySelector(sel) as HTMLElement;
    return {
      bg: getComputedStyle(el).backgroundColor,
      tagged: el.hasAttribute("data-thememaker"),
    };
  });

  expect(result.tagged, "new in-viewport card was not themed pre-paint").toBe(
    true,
  );
  expect(result.bg).toBe(themedSurface);
  // And it is NOT its original white (the flash color).
  expect(result.bg).not.toBe("rgb(255, 255, 255)");
});

test("(pre-paint) off-screen new cards are still themed eventually (deferred path)", async ({
  context,
  extensionId,
  server,
}) => {
  const ext = await openExtensionPage(context, extensionId);
  await enableSite(ext, server.origin, makePalette(), 100);

  const page = await context.newPage();
  await page.setViewportSize({ width: 900, height: 500 });
  await page.goto(server.url("/dynamic-spa.html"));
  await waitForThemeApplied(page);
  await waitForThemeSettled(page);

  // Append a BIG batch of cards — most fall far below the fold. The pre-paint path
  // themes the visible band synchronously; the rest stream in via the deferred
  // path. Eventually ALL cards are themed (none left white).
  await page.evaluate(() => {
    const w = window as unknown as {
      __inbox: { addCards(n: number): string[] };
    };
    w.__inbox.addCards(400);
  });
  await waitForThemeSettled(page);

  const allThemed = await page.evaluate(() => {
    const cards = Array.from(
      document.querySelectorAll("#grid .card"),
    ) as HTMLElement[];
    return cards.every((c) => c.hasAttribute("data-thememaker"));
  });
  expect(allThemed, "some off-screen cards never got themed").toBe(true);
});

test("(image bg) elements with a real url() background are PRESERVED (image not stripped, no solid color painted over it)", async ({
  context,
  extensionId,
  server,
}) => {
  const ext = await openExtensionPage(context, extensionId);
  await enableSite(ext, server.origin, makePalette(), 100);

  const page = await context.newPage();
  await page.goto(server.url("/dynamic-spa.html"));
  await waitForThemeApplied(page);
  await waitForThemeSettled(page);

  const imageEls = await page.evaluate(() => {
    const read = (sel: string) => {
      const el = document.querySelector(sel) as HTMLElement;
      const cs = getComputedStyle(el);
      return {
        backgroundImage: cs.backgroundImage,
        tagged: el.hasAttribute("data-thememaker"),
      };
    };
    return { photo: read("#photo"), banner: read("#banner") };
  });

  // The url() image survives (not "none") and the element is NOT tagged as a
  // painted surface (so no solid themed color is layered over the photo).
  for (const el of [imageEls.photo, imageEls.banner]) {
    expect(el.backgroundImage).toContain("url(");
    expect(el.backgroundImage).not.toBe("none");
    expect(el.tagged, "an image-bg element was painted over").toBe(false);
  }

  // A decorative GRADIENT (no url) is NOT preserved — it is a normal surface the
  // engine themes (image replaced with the solid themed bg). This guards against
  // over-preserving and regressing normal solid surfaces.
  const grad = await page.evaluate(() => {
    const el = document.querySelector("#grad") as HTMLElement;
    return {
      backgroundImage: getComputedStyle(el).backgroundImage,
      tagged: el.hasAttribute("data-thememaker"),
    };
  });
  expect(grad.tagged).toBe(true);
  expect(grad.backgroundImage).toBe("none");
});
