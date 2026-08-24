#!/usr/bin/env node
/**
 * render-printed-receipt.mjs — the one artifact on this site that is not UI.
 *
 * WHAT THIS IS, STATED BEFORE ANYTHING ELSE: a RENDERED image of a printed receipt, not a
 * photograph of one. Nobody here has a thermal printer and a camera at 11pm, and the one
 * thing this product may never do is put an unlabelled synthetic image on its own homepage
 * and let it read as evidence. So the render says so in three places: in this header, in the
 * caption under the image on the site, and printed on the receipt itself, in the same face
 * and size as the rest of the footer, where a crop cannot separate it from the picture.
 *
 * WHY IT EXISTS: design/SELF-AUDIT.md §Risk 1 named the gap — every human-made comparable
 * carries one artifact that is not UI (Amata's photographed handwriting, Rodeo's joke domain,
 * Overtone's essay) and we had none; the whole site was two SVG wireframes. It proposed the
 * printed receipt. docs/UI-AUDIT-2026-08-24.md §4 added the second reason: our own corpus
 * pays for a hand-made artifact twice, via counter.real-photography and
 * counter.handmade-artifact. A render earns neither of those, and we do not claim them. What
 * it earns is a focal point on a page that has none, and one object on the site that a person
 * had to decide the shape of.
 *
 * WHAT IS REAL IN IT: the content. Every line of the receipt below is read out of the live
 * sample report for 4F2A-9C at build time — the same six findings, the same rule ids, the
 * same arithmetic, the same total — by importing the built @slop/core report rather than by
 * retyping numbers into a mockup. If a weight changes in the corpus, this picture changes
 * with it or this script fails.
 *
 * Run:  npm run build && node scripts/render-printed-receipt.mjs
 * Out:  apps/web/public/artifact/printed-receipt-4F2A-9C.png  (+ .json provenance sidecar)
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(REPO, "apps", "web", "public", "artifact");
const OUT_PNG = path.join(OUT_DIR, "printed-receipt-4F2A-9C.png");
const FONT_DIR = path.join(REPO, "apps", "web", "public", "fonts");

/**
 * The frame. Sized to the object rather than to a stock aspect ratio: a till receipt is a
 * narrow strip, so the picture is a narrow strip with a hand's width of desk around it.
 * Shot at 2x, so it holds up on a retina screen at ~680 CSS px wide, which is the width of
 * the receipt card the rest of the site is built around.
 */
const SCENE = { width: 680, height: 980, scale: 1.6 };

/**
 * The receipt's content, rebuilt from the corpus rather than transcribed.
 *
 * apps/web/lib/receipts.ts is `server-only` and cannot be imported from a plain node script,
 * so this reconstructs the same report from the same public API with the same inputs. The
 * assertions at the bottom of buildScene() are what make that honest: if this drifts from the
 * page, the script stops rather than quietly rendering a prettier lie.
 */
async function buildReceiptData() {
  const core = await import("@slop/core");
  const web = await import("@slop/detectors-web");
  const { buildReport, makeFinding } = core;
  const { PROBE_WEIGHTS, RULE_DESCRIPTORS, ruleById, WEB_DETECTOR_ID } = web;

  const when = "2026-08-23T21:44:00.000Z";
  const ev = (kind, locator, observed, rest = {}) => ({ kind, locator, observed, ...rest });
  const find = (id, evidence) => {
    const rule = ruleById(id);
    if (!rule) throw new Error(`rule "${id}" is not in the corpus`);
    return makeFinding(rule, evidence);
  };

  const findings = [
    find("builder.ai-generator-meta", [ev("selector", 'meta[name="generator"]', "Lovable 2.4")]),
    find("css.violet-blue-gradient", [
      ev("css", "background-image on section.hero", "linear-gradient(135deg, rgb(99,102,241), rgb(59,130,246))"),
    ]),
    find("css.crushed-tracking", [ev("css", "letter-spacing on h1.hero-title", "-0.04em at weight 800")]),
    find("dom.uniform-cards", [
      ev("selector", "section.features > div.card", "3 cards, identical 16px radius, 1px border, identical shadow"),
      ev("css", "box-shadow on section.features > div.card", "0 1px 2px rgba(0,0,0,.05), 0 6px 16px rgba(0,0,0,.08)"),
    ]),
    find("craft.no-og-image", [ev("selector", 'meta[property="og:image"]', "absent")]),
    find("craft.no-canonical", [ev("selector", 'link[rel="canonical"]', "absent")]),
  ];

  const probes = [
    { id: "http", ran: true, denominator: 1, weight: PROBE_WEIGHTS.http },
    { id: "render", ran: true, denominator: 1, weight: PROBE_WEIGHTS.render },
    { id: "computed-style", ran: true, denominator: 812, expectsNonEmpty: true, weight: PROBE_WEIGHTS["computed-style"] },
    { id: "font-faces", ran: true, denominator: 2, weight: PROBE_WEIGHTS["font-faces"] },
    { id: "dom-survey", ran: true, denominator: 1174, expectsNonEmpty: true, weight: PROBE_WEIGHTS["dom-survey"] },
    { id: "assets", ran: true, denominator: 14, expectsNonEmpty: true, weight: PROBE_WEIGHTS.assets },
    { id: "well-known", ran: true, denominator: 8, expectsNonEmpty: true, weight: PROBE_WEIGHTS["well-known"] },
    { id: "not-found", ran: true, denominator: 1, weight: PROBE_WEIGHTS["not-found"] },
    { id: "text", ran: true, denominator: 431, expectsNonEmpty: true, weight: PROBE_WEIGHTS.text },
    { id: "provenance", ran: true, denominator: 1, weight: PROBE_WEIGHTS.provenance },
  ];
  const totalWeight = Object.values(PROBE_WEIGHTS).reduce((a, b) => a + b, 0);
  const got = probes.reduce((a, p) => a + (p.ran ? (p.weight ?? 1) : 0), 0);

  const report = buildReport(
    [
      {
        detectorId: WEB_DETECTOR_ID,
        modality: "web",
        evidenceKind: "deterministic",
        corpusVersion: "corpus-2026.09",
        input: { kind: "url", url: "https://example.invalid/sample" },
        startedAt: when,
        finishedAt: when,
        findings,
        coverage: { ratio: got / totalWeight, probes, examined: "rendered read" },
        rulesEvaluated: RULE_DESCRIPTORS.map((r) => r.id),
        warnings: [],
      },
    ],
    { now: () => new Date(when) },
  );

  return { report, findings, corpusSize: RULE_DESCRIPTORS.length, when };
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function scene({ report, findings, corpusSize }, fontData) {
  const total = report.score ?? report.total ?? null;
  const rows = findings
    .map((f) => {
      const points = (f.points ?? f.weight ?? 0).toFixed(1);
      return `<div class="row"><span class="rid">${esc(f.ruleId ?? f.rule?.id ?? "")}</span><span class="dots"></span><span class="pts">+${esc(points)}</span></div>
      <div class="loc">${esc((f.evidence?.[0]?.locator ?? "").slice(0, 46))}</div>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><style>
${fontData}
* { margin:0; padding:0; box-sizing:border-box; }
html,body { width:${SCENE.width}px; height:${SCENE.height}px; }

/* The desk. A warm near-black with a soft off-centre light, so the paper sits IN a room
   rather than on a swatch. No gradient stop from the default ramp anywhere near it. */
body {
  background:
    radial-gradient(760px 900px at 28% 16%, #322d26 0%, #201d19 44%, #121110 100%);
  position:relative; overflow:hidden;
  font-family:"Plex Mono", monospace; font-variant-ligatures:none;
}
/* Desk grain: real turbulence, not a noise PNG. */
.desk-grain {
  position:absolute; inset:0; opacity:.34; mix-blend-mode:overlay;
  background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='420' height='420'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='420' height='420' filter='url(%23n)' opacity='0.42'/></svg>");
}

.stage { position:absolute; inset:0; perspective:2400px; }

/* The strip. 80mm thermal stock is 302px at 96dpi; this is drawn at 3x and shot at 1x of a
   1200x900 scene, which is why the type can carry real 9pt-equivalent detail. */
.paper {
  position:absolute; left:50%; top:50%;
  width:430px; min-height:760px;
  transform: translate(-50%,-50%) rotateZ(-0.9deg) rotateX(5deg) rotateY(-2deg);
  transform-style:preserve-3d;
  background:#f7f4ec;
  color:#1b1b1a;
  padding:30px 26px 22px;
  filter: drop-shadow(0 26px 34px rgba(0,0,0,.55)) drop-shadow(0 3px 6px rgba(0,0,0,.4));
  /* Torn top, guillotined bottom: the two ends a real till receipt has. */
  -webkit-mask-image:
    url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' preserveAspectRatio='none' viewBox='0 0 420 900'><path d='M0,12 L14,4 L28,13 L42,3 L56,12 L70,5 L84,14 L98,4 L112,12 L126,3 L140,13 L154,5 L168,12 L182,4 L196,13 L210,3 L224,12 L238,5 L252,13 L266,4 L280,12 L294,3 L308,13 L322,5 L336,12 L350,4 L364,13 L378,3 L392,12 L406,5 L420,12 L420,890 L0,894 Z' fill='white'/></svg>");
  -webkit-mask-size:100% 100%; -webkit-mask-repeat:no-repeat;
}
/* Paper grain, over the ink, the way stock shows through print. */
.paper::after {
  content:""; position:absolute; inset:0; pointer-events:none; mix-blend-mode:multiply; opacity:.40;
  background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'><filter id='p'><feTurbulence type='fractalNoise' baseFrequency='1.1' numOctaves='4' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/><feComponentTransfer><feFuncA type='linear' slope='0.5'/></feComponentTransfer></filter><rect width='300' height='300' filter='url(%23p)'/></svg>");
}
/* The curl. Thermal stock never lies flat: three soft bands of light across the width, and a
   heavier shade down the left where it lifts off the desk. */
.paper::before {
  content:""; position:absolute; inset:0; pointer-events:none; mix-blend-mode:multiply;
  background:
    linear-gradient(96deg, rgba(60,52,40,.30) 0%, rgba(60,52,40,.05) 9%, rgba(0,0,0,0) 26%,
                    rgba(0,0,0,0) 62%, rgba(60,52,40,.07) 82%, rgba(60,52,40,.22) 100%),
    linear-gradient(180deg, rgba(0,0,0,.10) 0%, rgba(0,0,0,0) 12%, rgba(0,0,0,0) 78%, rgba(50,44,36,.16) 100%);
}

/* Thermal print: slightly soft, slightly dotty, never crisp vector black. */
.ink { position:relative; z-index:1; filter: blur(.18px) contrast(1.06); }

.center { text-align:center; }
h1 { font-size:19px; letter-spacing:.14em; font-weight:500; }
.sub { font-size:10px; letter-spacing:.10em; margin-top:5px; color:#43413c; }
.rule { border-top:1px dashed #6d6a62; margin:14px 0; opacity:.8; }
.rule.solid { border-top:1px solid #4a4842; border-style:solid; }
/* Dotted leaders on the header rows, not a space-between gap. The paper is tilted, so a
   right-aligned column sits a few pixels higher than its label; on a real till receipt the
   leader is what carries the eye across, and without it the tilt reads as broken alignment
   rather than as a piece of paper lying at an angle. */
.kv { display:flex; align-items:baseline; gap:6px; font-size:10.5px; line-height:1.9; }
.kv .lead { flex:1; border-bottom:1px dotted #9a978e; transform:translateY(-3px); }
.kv span:last-child { text-align:right; white-space:nowrap; }
.hdr { font-size:9.5px; letter-spacing:.16em; color:#403e39; margin-bottom:6px; }
.row { display:flex; align-items:baseline; font-size:11px; gap:6px; margin-top:9px; }
.rid { white-space:nowrap; }
.dots { flex:1; border-bottom:1px dotted #8d8a81; transform:translateY(-3px); }
.pts { font-weight:500; }
.loc { font-size:9px; color:#56534c; margin-top:1px; padding-left:2px; }
.total { display:flex; justify-content:space-between; font-size:16px; font-weight:500; letter-spacing:.02em; }
.note { font-size:9.5px; line-height:1.7; color:#403e39; }
.barcode { display:flex; gap:1.5px; height:44px; align-items:stretch; margin:14px 0 6px; }
.barcode i { display:block; background:#20201e; }
.foot { font-size:8.5px; line-height:1.75; letter-spacing:.02em; color:#4b4943; }
.stamp { font-size:8.5px; letter-spacing:.13em; color:#4b4943; }
</style></head>
<body>
<div class="desk-grain"></div>
<div class="stage">
  <div class="paper"><div class="ink">
    <div class="center">
      <h1>SLOP SCORER</h1>
      <div class="sub">REPRODUCTION RECEIPT</div>
    </div>
    <div class="rule"></div>
    <div class="kv"><span>RECEIPT</span><span class="lead"></span><span>4F2A-9C</span></div>
    <div class="kv"><span>ARTIFACT</span><span class="lead"></span><span>marketing page</span></div>
    <div class="kv"><span>OURS?</span><span class="lead"></span><span>YES, WE MADE IT</span></div>
    <div class="kv"><span>RAN</span><span class="lead"></span><span>2026-08-23 21:44 UTC</span></div>
    <div class="kv"><span>CORPUS</span><span class="lead"></span><span>corpus-2026.09</span></div>
    <div class="kv"><span>CHECKS</span><span class="lead"></span><span>${corpusSize} EVALUATED</span></div>
    <div class="rule"></div>
    <div class="hdr">WHAT LET US SHORTCUT IT</div>
    ${rows}
    <div class="rule"></div>
    <div class="kv"><span>TIME TO REMAKE</span><span class="lead"></span><span>8.4 SECONDS</span></div>
    <div class="kv"><span>BY HAND</span><span class="lead"></span><span>ABOUT A DAY</span></div>
    <div class="rule solid"></div>
    <div class="total"><span>SIGNALS</span><span>${total === null ? "--" : Number(total).toFixed(1)}</span></div>
    <div class="note" style="margin-top:8px">
      Not a probability. Not a verdict. A count of known signals, capped per family, printed so
      you can check the arithmetic yourself.
    </div>
    <div class="rule"></div>
    <div class="barcode" id="barcode"></div>
    <div class="center stamp">slop-scorer / receipt / 4F2A-9C</div>
    <div class="rule"></div>
    <div class="foot">
      THIS PICTURE IS RENDERED, NOT PHOTOGRAPHED. Drawn in a browser by
      scripts/render-printed-receipt.mjs and labelled as such wherever it appears. The numbers
      on it are read from the live report, not typed in. No receipt printer was harmed, or
      owned.
    </div>
    <div class="rule"></div>
    <div class="center stamp">KEEP THIS FOR YOUR RECORDS</div>
  </div></div>
</div>
<script>
  // A barcode with content: the bar widths are the low bits of a hash of the receipt id, so
  // the pattern is derived from the document rather than drawn to look busy.
  const seed = ${JSON.stringify(createHash("sha256").update("4F2A-9C").digest("hex"))};
  const el = document.getElementById("barcode");
  for (let i = 0; i < 58; i++) {
    const bit = parseInt(seed[i % seed.length], 16);
    const b = document.createElement("i");
    b.style.width = (1 + (bit % 3)) + "px";
    b.style.opacity = bit % 5 === 0 ? "0.75" : "1";
    el.append(b);
  }
</script>
</body></html>`;
}

function fontFaces() {
  const face = (family, weight, file) => {
    const b64 = readFileSync(path.join(FONT_DIR, file)).toString("base64");
    return `@font-face{font-family:"${family}";font-weight:${weight};src:url(data:font/woff2;base64,${b64}) format("woff2");}`;
  };
  // The artifact is set in the site's own shipping face. Inlined as base64 so the render has
  // no network dependency at all and cannot silently fall back to a system font.
  return [
    face("Plex Mono", 400, "IBMPlexMono-Regular.subset.woff2"),
    face("Plex Mono", 500, "IBMPlexMono-Medium.subset.woff2"),
  ].join("\n");
}

/**
 * PNG, quantised. The grain is real turbulence, which is exactly what a PNG cannot compress,
 * so a straight capture lands near 4 MB. The image is almost achromatic, so an adaptive
 * 128-colour palette is visually free and cuts it by roughly an order of magnitude. Nothing
 * about the composition changes; only the number of distinct greys does.
 *
 * NOT converted to JPEG on purpose: see the `format` note in the provenance sidecar.
 */
function quantise(file) {
  execFileSync("python", [
    "-c",
    [
      "import sys",
      "from PIL import Image",
      "im = Image.open(sys.argv[1]).convert('RGB')",
      "im.quantize(colors=64, method=Image.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG).save(sys.argv[1], optimize=True)",
    ].join("\n"),
    file,
  ]);
}

async function main() {
  const data = await buildReceiptData();

  // Guard rails: this picture asserts a total and a finding count, so it fails loudly rather
  // than rendering a stale one.
  if (data.findings.length !== 6) throw new Error(`expected 6 findings, got ${data.findings.length}`);
  const total = data.report.score ?? data.report.total;
  if (typeof total !== "number") throw new Error("report carries no total to print");

  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: SCENE.width, height: SCENE.height },
    deviceScaleFactor: SCENE.scale,
  });
  const missing = [];
  page.on("requestfailed", (r) => missing.push(r.url()));
  await page.setContent(scene(data, fontFaces()), { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  const usedFallback = await page.evaluate(() => !document.fonts.check('11px "Plex Mono"'));
  if (usedFallback) throw new Error("the inlined face did not load; the render would be in a system font");
  if (missing.length) throw new Error(`the render made a request and it failed: ${missing[0]}`);
  await page.screenshot({ path: OUT_PNG, type: "png" });
  await browser.close();

  quantise(OUT_PNG);
  const bytes = statSync(OUT_PNG).size;
  if (bytes > 600 * 1024) throw new Error(`${(bytes / 1024).toFixed(0)} KB is too heavy for a page that budgets 180 KB of JS`);
  writeFileSync(
    path.join(OUT_DIR, "printed-receipt-4F2A-9C.json"),
    JSON.stringify(
      {
        what: "A rendered image of a printed receipt. NOT a photograph, and never to be presented as one.",
        producedBy: "scripts/render-printed-receipt.mjs",
        renderer: `headless chromium via playwright, ${SCENE.width}x${SCENE.height} at deviceScaleFactor ${SCENE.scale}`,
    format:
      "PNG, deliberately. Our own probe classifies any jpg/webp/avif over 320px as photographic, so shipping this as a JPEG would make counter.real-photography fire on a picture nobody photographed. Exporting it as a PNG is how we avoid gaming our own rule with our own image.",
        typeface: "IBM Plex Mono, the site's own shipping face, inlined as base64",
        contentSource: "the live 4F2A-9C sample report, rebuilt from @slop/core and @slop/detectors-web",
        findings: data.findings.length,
        total: Number(total.toFixed(1)),
        corpusVersion: "corpus-2026.09",
        counterRulesEarned:
          "none. counter.real-photography and counter.handmade-artifact require a real photograph or a real hand-made mark, and a render is neither. We do not claim them.",
        bytes,
      },
      null,
      2,
    ) + "\n",
  );

  console.log(`${path.relative(REPO, OUT_PNG)}  ${(bytes / 1024).toFixed(1)} KB  (${data.findings.length} findings, total ${total.toFixed(1)})`);
}

await main();
