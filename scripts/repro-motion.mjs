/**
 * IS THERE MOTION, AND CAN A HUMAN SEE IT?
 *
 * The founder's report was "there are no transitions", against a repo whose previous agent had
 * reported five animation beats shipped and verified. Both were true: the beats existed and
 * three of the five had nothing on the landing route to run on, while the two that did ran in
 * the fold as a rewind of content the reader was already looking at.
 *
 * This measures what a person actually experiences: load, then scroll, and record every element
 * that moves, when, and for how long. Throwaway diagnostic; not a gate.
 */
import { chromium } from "playwright";

const URL = process.argv[2] ?? "http://localhost:3000/";
const REDUCED = process.argv[3] === "reduced";

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  reducedMotion: REDUCED ? "reduce" : "no-preference",
});

await page.addInitScript(() => {
  window.__m = [];
  window.__t0 = performance.now();
  const t = () => Math.round(performance.now() - window.__t0);
  const seen = new Map();
  const watch = () => {
    // Everything the timelines touch leaves a fingerprint: an inline clip-path, an inline
    // opacity/transform, a --read or --feed custom property, or a data-* lifecycle attribute.
    for (const el of document.querySelectorAll(
      "[data-reveal-read],[data-reveal-feed],[data-reveal-panel],[data-reveal-row],[data-reveal-elapsed],[data-reading],[data-feeding]",
    )) {
      const cs = getComputedStyle(el);
      const key = el.getAttribute("data-reveal-read") !== null
        ? "read-sweep"
        : el.getAttribute("data-reveal-feed") !== null
          ? "print-feed"
          : el.getAttribute("data-reveal-panel") !== null
            ? "panel-wipe"
            : el.getAttribute("data-reveal-row") !== null
              ? "row-resolve"
              : "elapsed";
      const moving =
        el.hasAttribute("data-reading") ||
        el.hasAttribute("data-feeding") ||
        (cs.clipPath !== "none" && cs.clipPath !== "") ||
        Number(cs.opacity) < 0.995;
      const rec = seen.get(key) ?? { beat: key, first: null, last: null, frames: 0 };
      if (moving) {
        if (rec.first === null) rec.first = t();
        rec.last = t();
        rec.frames += 1;
      }
      seen.set(key, rec);
    }
    window.__m = [...seen.values()];
    requestAnimationFrame(watch);
  };
  requestAnimationFrame(watch);
});

await page.goto(URL, { waitUntil: "load" });
await page.waitForTimeout(2500);

// Now scroll the page the way a person does, in steps, pausing at each.
const height = await page.evaluate(() => document.body.scrollHeight);
for (let y = 0; y < height; y += 700) {
  await page.evaluate((to) => window.scrollTo({ top: to, behavior: "instant" }), y);
  await page.waitForTimeout(700);
}
await page.waitForTimeout(1500);

const m = await page.evaluate(() => window.__m);
console.log(`\n=== ${URL}  reducedMotion=${REDUCED} ===`);
for (const r of m) {
  console.log(
    r.first === null
      ? `  ${r.beat.padEnd(12)} NEVER MOVED`
      : `  ${r.beat.padEnd(12)} moved ${r.first}ms -> ${r.last}ms  (${r.last - r.first}ms, ${r.frames} frames)`,
  );
}
if (m.length === 0) console.log("  no beat-bearing elements found on this route at all");

await browser.close();
