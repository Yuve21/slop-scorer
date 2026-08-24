#!/usr/bin/env node
/**
 * Publish-shape build.
 *
 * `tsc -b` (run before this script, see package.json) compiles this package and its three
 * workspace dependencies (`@slop/core`, `@slop/detectors-code`, `@slop/detectors-web`) each to
 * their own `dist/`, with bare specifiers like `from "@slop/core"` left untouched: that is how
 * NodeNext module resolution works inside the monorepo, where `node_modules/@slop/*` is a
 * workspace symlink.
 *
 * That import specifier does NOT resolve once this package is installed from the registry:
 * `@slop/core` is `"private": true` and is never published. So this script does the two things
 * `tsc -b` cannot:
 *
 *   1. bundles the two runtime entrypoints (`bin.js`, `index.js`) with esbuild, inlining the
 *      three workspace packages so the published artifact has no unresolvable dependency, while
 *      leaving the real, registry-published dependencies (`@modelcontextprotocol/sdk`, `zod`)
 *      and the optional peer (`playwright`) external, so npm still manages and dedupes them
 *      normally;
 *   2. vendors the *type* declarations of the same three packages into `dist/vendor/` and
 *      rewrites the `@slop/*` specifiers inside every emitted `.d.ts` to a relative path into
 *      that vendor tree, so a consumer's type checker does not go looking for a package that
 *      was never published.
 *
 * Run via `npm run build` (which is `tsc -b && node build.mjs`), not directly: this script
 * assumes `tsc -b` already ran and left workspace dist output on disk to bundle from.
 */

import { build } from "esbuild";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(here, "dist");
const repoRoot = path.resolve(here, "..", "..");

/** The three workspace packages this artifact must not depend on at install time. */
const VENDORED = [
  { specifier: "@slop/core", dir: "core" },
  { specifier: "@slop/detectors-code", dir: "detectors-code" },
  { specifier: "@slop/detectors-web", dir: "detectors-web" },
];

/** Real, registry-published packages. Bundling these would be pointless bloat and would drop
 * the version pin a consumer's own install controls. */
const EXTERNAL = ["@modelcontextprotocol/sdk", "zod", "playwright"];

async function bundle(entry, outfile) {
  await build({
    entryPoints: [path.join(here, "src", entry)],
    outfile: path.join(distDir, outfile),
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    external: EXTERNAL,
    logLevel: "warning",
  });
}

/** Delete the unbundled, non-public intermediate files `tsc -b` left behind. Only the bundled
 * bin.js/index.js and the *.d.ts (kept for the vendoring pass below) are shipped. */
function pruneIntermediates() {
  for (const name of ["format.js", "format.js.map", "server.js", "server.js.map", "bin.js.map", "index.js.map"]) {
    const p = path.join(distDir, name);
    if (existsSync(p)) rmSync(p);
  }
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

/** Copy only the `.d.ts` (+ `.d.ts.map`) of a workspace package's dist into `dist/vendor/<dir>`,
 * skipping its compiled `.js`: the JS is already inlined by esbuild, and shipping it a second
 * time, unbundled, would just be dead weight nothing imports. */
function vendorTypes({ dir }) {
  const src = path.join(repoRoot, "packages", dir, "dist");
  const dest = path.join(distDir, "vendor", dir);
  if (!existsSync(src)) {
    throw new Error(`${src} is missing. Run "tsc -b" (via "npm run build") before build.mjs.`);
  }
  for (const file of walk(src)) {
    if (!file.endsWith(".d.ts") && !file.endsWith(".d.ts.map")) continue;
    const rel = path.relative(src, file);
    const outPath = path.join(dest, rel);
    mkdirSync(path.dirname(outPath), { recursive: true });
    cpSync(file, outPath);
  }
}

/** `from "@slop/core"` / `from "@slop/core/x"` -> a relative specifier into `dist/vendor/core`,
 * computed per-file so it is correct regardless of how deep the `.d.ts` lives. */
function rewriteSpecifiers(file) {
  let text = readFileSync(file, "utf8");
  let changed = false;
  for (const { specifier, dir } of VENDORED) {
    const target = path.join(distDir, "vendor", dir, "index.js");
    let rel = path.relative(path.dirname(file), target).split(path.sep).join("/");
    if (!rel.startsWith(".")) rel = `./${rel}`;
    const pattern = new RegExp(`(["'])${specifier.replace(/[/]/g, "\\/")}\\1`, "g");
    if (pattern.test(text)) {
      text = text.replace(pattern, `$1${rel}$1`);
      changed = true;
    }
  }
  if (changed) writeFileSync(file, text);
}

async function main() {
  await bundle("bin.ts", "bin.js");
  await bundle("index.ts", "index.js");
  pruneIntermediates();

  for (const pkg of VENDORED) vendorTypes(pkg);

  const dtsFiles = walk(distDir).filter((f) => f.endsWith(".d.ts"));
  for (const file of dtsFiles) rewriteSpecifiers(file);

  console.log(`built ${VENDORED.length} vendored type trees, bundled bin.js and index.js`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
