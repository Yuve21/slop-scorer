/**
 * Isolated-browser screenshot sweep for the web surface.
 *
 * Usage: node scripts/ui-shots.mjs <label> [baseUrl]
 * Writes .audit-shots/<label>/<route>-<width>-<scheme>[-rm].png
 *
 * Not a gate and deliberately not wired into `npm test`: it needs a running server. It exists
 * so a "before" and an "after" are the same nine captures taken the same way, rather than two
 * hand-driven sessions that differ in viewport or colour scheme.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const label = process.argv[2] ?? "shots";
const base = process.argv[3] ?? "http://localhost:3877";
const out = join(process.cwd(), ".audit-shots", label);
mkdirSync(out, { recursive: true });

const ROUTES = [
  ["home", "/"],
  ["receipt", "/receipt/4F2A-9C"],
  ["method", "/method"],
];
const WIDTHS = [
  ["1440", 1440, 1000],
  ["390", 390, 844],
];
const MODES = [
  ["light", "light", "no-preference"],
  ["dark", "dark", "no-preference"],
  ["dark-rm", "dark", "reduce"],
];

const browser = await chromium.launch();
for (const [rname, path] of ROUTES) {
  for (const [wname, width, height] of WIDTHS) {
    for (const [mname, colorScheme, reducedMotion] of MODES) {
      if (mname === "dark-rm" && rname === "method") continue;
      const ctx = await browser.newContext({
        viewport: { width, height },
        colorScheme,
        reducedMotion,
        deviceScaleFactor: 1,
      });
      const page = await ctx.newPage();
      const errors = [];
      page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
      page.on("pageerror", (e) => errors.push(String(e)));
      await page.goto(`${base}${path}`, { waitUntil: "load" });
      // Decode every raster before capturing. `decoding="async"` on the printed-receipt PNG
      // means `load` fires with the image still undecoded, and a fullPage screenshot taken
      // then shows an empty bordered box. That is a screenshot artifact, not a site defect,
      // and it wasted a review cycle once already.
      await page.evaluate(() =>
        Promise.all(
          [...document.images].map((i) => (i.decode ? i.decode().catch(() => {}) : null)),
        ).then(() => document.fonts.ready),
      );
      // Past the motion budget, so a capture is never mid-timeline.
      await page.waitForTimeout(1600);
      await page.screenshot({ path: join(out, `${rname}-${wname}-${mname}.png`), fullPage: true });
      if (errors.length) console.log(`  ERRORS ${rname}/${wname}/${mname}:`, errors.slice(0, 3));
      await ctx.close();
    }
  }
}
await browser.close();
console.log(`wrote ${out}`);
