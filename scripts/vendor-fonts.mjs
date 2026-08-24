#!/usr/bin/env node
/**
 * vendor-fonts.mjs — rebuild apps/web/public/fonts from the upstream IBM Plex packages.
 *
 * The four woff2 files in apps/web/public/fonts are COMMITTED, so this script is not part of
 * the build. It exists so that the files in the repository are reproducible rather than
 * mysterious: anyone can re-run it and byte-compare, and anyone can see exactly which
 * upstream release and which unicode range produced them.
 *
 * Source: the official @ibm/plex-sans and @ibm/plex-mono npm packages, at pinned versions,
 * pulled with `npm pack` (i.e. straight from the registry, no vendored blob of unknown
 * provenance). IBM Plex is SIL OFL 1.1; the licence text is copied next to the fonts.
 *
 * Subsetting: the unicode range below is MEASURED, not guessed. It is the union of
 *   - Latin-1 plus the two Latin-Extended-A letters Plex's kerning expects (U+0131, U+0152-3),
 *   - General Punctuation (U+2000-206F): the en/us dashes, the curly quotes, the bullet,
 *     the ellipsis and the single guillemets this site actually sets,
 *   - U+20AC, U+2122,
 *   - U+2190-2193: the arrows. Note U+2192 "→" appears 10 times in this codebase and is NOT
 *     in Google Fonts' "latin" subset (which carries only U+2191 and U+2193). Shipping the
 *     @fontsource latin build would have dropped every "→" on the site to a fallback face at
 *     a different width. That is exactly the class of defect this product sells detection of,
 *     so the range is derived from a scan of the source rather than copied from a CDN.
 *
 * Deliberately NOT covered: emoji and CJK. They appear in this repo only as detector *inputs*
 * (rules that fire on emoji headers, on a page setting 宋体), never as UI chrome. The OS
 * supplies them, and packing them would multiply the font payload for glyphs we never set.
 *
 * Requires: python with fonttools + brotli  (python -m pip install fonttools brotli).
 * Run from anywhere: node scripts/vendor-fonts.mjs
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(REPO, "apps", "web", "public", "fonts");

/** Pinned upstream releases. Bumping these is a deliberate act; record it in design/DESIGN.md. */
const PACKAGES = {
  sans: "@ibm/plex-sans@1.1.0",
  mono: "@ibm/plex-mono@2.5.0",
};

/** Measured from the source tree; see the header. */
const UNICODES = [
  "U+0000-00FF",
  "U+0131",
  "U+0152-0153",
  "U+2000-206F",
  "U+20AC",
  "U+2122",
  "U+2190-2193",
  "U+2212",
  "U+2219",
].join(",");

/**
 * Two weights per face, no italics, no variable axis. The design calls for Regular 400 and
 * Medium 500 and nothing else: the largest type on this site is also its lightest, so there
 * is no bold to ship. A variable file carrying an axis we never interpolate would be larger
 * than the static pair.
 */
const FILES = [
  { pkg: "sans", src: "IBMPlexSans-Regular.woff2", out: "IBMPlexSans-Regular.subset.woff2" },
  { pkg: "sans", src: "IBMPlexSans-Medium.woff2", out: "IBMPlexSans-Medium.subset.woff2" },
  { pkg: "mono", src: "IBMPlexMono-Regular.woff2", out: "IBMPlexMono-Regular.subset.woff2" },
  { pkg: "mono", src: "IBMPlexMono-Medium.woff2", out: "IBMPlexMono-Medium.subset.woff2" },
];

function python(args) {
  return execFileSync("python", args, { stdio: ["ignore", "pipe", "pipe"] }).toString();
}

function requireFontTools() {
  try {
    python(["-c", "import fontTools, brotli"]);
  } catch {
    console.error(
      "fonttools + brotli are required.\n  python -m pip install fonttools brotli\n" +
        "(The committed woff2 files are unaffected; this script only regenerates them.)",
    );
    process.exit(1);
  }
}

function unpack(work, spec) {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const packed = execFileSync(npm, ["pack", spec, "--silent"], { cwd: work })
    .toString()
    .trim()
    .split(/\r?\n/)
    .pop();
  const dir = path.join(work, path.basename(packed, ".tgz"));
  mkdirSync(dir, { recursive: true });
  execFileSync("tar", ["xzf", packed, "-C", dir], { cwd: work });
  return path.join(dir, "package");
}

function main() {
  requireFontTools();
  const work = mkdtempSync(path.join(tmpdir(), "slop-fonts-"));
  try {
    const roots = {
      sans: unpack(work, PACKAGES.sans),
      mono: unpack(work, PACKAGES.mono),
    };
    mkdirSync(OUT, { recursive: true });

    const rows = [];
    for (const file of FILES) {
      const src = path.join(roots[file.pkg], "fonts", "complete", "woff2", file.src);
      const dest = path.join(OUT, file.out);
      python([
        "-m",
        "fontTools.subset",
        src,
        `--output-file=${dest}`,
        "--flavor=woff2",
        // kern and calt are why we bought into a real family; tnum and frac are why the
        // arithmetic table's columns line up. Hinting is KEPT (it costs ~5 KB a file) because
        // most of this site is 13-16px text on Windows, where DirectWrite uses it.
        "--layout-features=kern,liga,calt,tnum,frac",
        `--unicodes=${UNICODES}`,
        "--drop-tables+=DSIG",
      ]);
      rows.push([file.out, statSync(src).size, statSync(dest).size]);
    }

    copyFileSync(path.join(roots.sans, "fonts", "complete", "woff2", "license.txt"), path.join(OUT, "LICENSE-OFL.txt"));

    let total = 0;
    console.log("file                                 upstream    shipped");
    for (const [name, before, after] of rows) {
      total += after;
      console.log(`${name.padEnd(36)} ${String(before).padStart(8)}   ${String(after).padStart(8)}`);
    }
    console.log(`${"TOTAL".padEnd(36)} ${"".padStart(8)}   ${String(total).padStart(8)} bytes  (${(total / 1024).toFixed(1)} KB)`);
    if (total > 120 * 1024) {
      console.error("Over the 120 KB budget in design/DESIGN.md §1.");
      process.exit(1);
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

main();
