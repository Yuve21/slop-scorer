/**
 * Reproduce the founder's "refreshing the page glitches" report on localhost.
 *
 * Usage: node scripts/repro-glitch.mjs [baseUrl] [runs]   (needs the site running)
 *
 * KEPT RATHER THAN THROWN AWAY, because the viewport rule at the top of
 * `apps/web/components/receipt/reveal.tsx` cites the numbers this produced as its whole
 * justification, and a comment that cites a measurement nobody can re-take is an assertion.
 * Not a gate: it needs a server, so `npm test` cannot run it. Run it after touching any beat.
 *
 * What it prints per run: cumulative layout shift, and a timeline of every change to the fold's
 * elapsed figure, card geometry and the number of evidence rows below full opacity. The bug it
 * was written for showed up as `hiddenRows` going 0 -> 4 several hundred ms after first paint.
 */
import { chromium } from "playwright";

const URL = process.argv[2] ?? "http://localhost:3000/";
const RUNS = Number(process.argv[3] ?? 3);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const logs = [];
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") logs.push(`${m.type()}: ${m.text()}`);
});
page.on("pageerror", (e) => logs.push(`pageerror: ${e.message}`));

await page.addInitScript(() => {
  window.__cls = 0;
  window.__ev = [];
  window.__t0 = performance.now();
  const t = () => Math.round(performance.now() - window.__t0);
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.hadRecentInput) continue;
      window.__cls += entry.value;
      window.__ev.push({
        t: Math.round(entry.startTime),
        kind: "SHIFT",
        value: Number(entry.value.toFixed(4)),
        src: entry.sources?.map((s) => (s.node?.nodeName ?? "?") + ":" + (s.node?.textContent ?? "").trim().slice(0, 40)).slice(0, 3),
      });
    }
  }).observe({ type: "layout-shift", buffered: true });

  document.addEventListener("DOMContentLoaded", () => window.__ev.push({ t: t(), kind: "DOMContentLoaded" }));
  window.addEventListener("load", () => window.__ev.push({ t: t(), kind: "load" }));
  if (document.fonts) {
    document.fonts.ready.then(() => window.__ev.push({ t: t(), kind: "fonts.ready", loaded: [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family) }));
    document.fonts.addEventListener("loadingdone", (e) =>
      window.__ev.push({ t: t(), kind: "fontsLoaded", faces: e.fontfaces.map((f) => f.family + "/" + f.weight) }),
    );
  }
  // Watch the meta line (the one whose text changes when `age` is computed) and the card top.
  const poll = () => {
    const meta = document.querySelector("[data-reveal-elapsed]")?.closest("div");
    const card = document.querySelector("[data-doc]");
    const rows = [...document.querySelectorAll("[data-reveal-row]")];
    const snap = {
      metaText: meta?.textContent?.trim().slice(0, 80) ?? null,
      metaH: meta ? Math.round(meta.getBoundingClientRect().height) : null,
      cardTop: card ? Math.round(card.getBoundingClientRect().top) : null,
      cardH: card ? Math.round(card.getBoundingClientRect().height) : null,
      rowsHidden: rows.filter((r) => Number(getComputedStyle(r).opacity) < 0.99).length,
    };
    const key = JSON.stringify(snap);
    if (key !== window.__last) {
      window.__last = key;
      window.__ev.push({ t: t(), kind: "DOM", ...snap });
    }
    if (performance.now() - window.__t0 < 6000) requestAnimationFrame(poll);
  };
  requestAnimationFrame(poll);
});

for (let i = 0; i < RUNS; i++) {
  logs.length = 0;
  await page.goto(URL, { waitUntil: "load" });
  await page.waitForTimeout(6200);
  const data = await page.evaluate(() => ({ cls: Number(window.__cls.toFixed(4)), ev: window.__ev }));
  console.log(`\n===== RUN ${i + 1} =====  CLS=${data.cls}`);
  for (const e of data.ev.sort((a, b) => a.t - b.t)) {
    if (e.kind === "DOM") {
      console.log(`  ${String(e.t).padStart(5)}  DOM   cardTop=${e.cardTop} cardH=${e.cardH} metaH=${e.metaH} hiddenRows=${e.rowsHidden}  meta="${e.metaText}"`);
    } else if (e.kind === "SHIFT") {
      console.log(`  ${String(e.t).padStart(5)}  SHIFT ${e.value}  <- ${JSON.stringify(e.src)}`);
    } else {
      console.log(`  ${String(e.t).padStart(5)}  ${e.kind} ${JSON.stringify(e.loaded ?? e.faces ?? "")}`);
    }
  }
  console.log("  console:", logs.length ? logs : "clean");
}

await browser.close();
