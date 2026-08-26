/**
 * `node scripts/sync-public-mcp.mjs` — regenerate the PUBLIC MCP repository from this one.
 *
 * This repository is authoritative. The public repository at github.com/Yuve21/slop-scorer-mcp
 * is a projection of it: four packages, copied verbatim except for a short, exact list of
 * comment scrubs, and then audited for leaks before anything is written.
 *
 * WHY A SCRIPT AND NOT A FORK. A fork drifts, and the direction it drifts in is the dangerous
 * one: somebody fixes a rule in the public copy, the private corpus stops matching it, and the
 * calibration baseline that gates every rule change is now measuring a different product. So
 * the public tree is REGENERATED, never edited, for everything under `packages/` except the
 * files this script deliberately does not own (see PUBLIC_OWNED).
 *
 * WHAT IT REFUSES TO DO. The scrub list is exact-match and every entry must hit. A comment
 * that gets reworded upstream makes this script FAIL rather than silently ship the original
 * wording, because the whole value of a scrub list is that it cannot go quiet. The leak audit
 * is the same shape: it runs over the generated tree and aborts before the tree is usable.
 *
 *   node scripts/sync-public-mcp.mjs              # sync, audit, report
 *   node scripts/sync-public-mcp.mjs --check      # audit only, write nothing (exit 1 on drift)
 *   node scripts/sync-public-mcp.mjs --out DIR    # target a different checkout
 *
 * After a sync, in the public checkout: `npm install && npm run build && npm test`, then commit.
 */

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

const PRIVATE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const outFlag = args.indexOf("--out");
const PUBLIC_ROOT =
  outFlag !== -1 && args[outFlag + 1]
    ? path.resolve(args[outFlag + 1])
    : path.resolve(PRIVATE_ROOT, "..", "slop-scorer-mcp");

/**
 * The packages that go public, and nothing else.
 *
 * This is the MCP server's real runtime closure minus one link, and the exception is the
 * point of the whole exercise, so it is written down here rather than discovered later:
 * `@slop/detectors-web` imports `recoverText` from `@slop/ocr-text`, which imports the PNG
 * decoder and the bitmap-font OCR out of `@slop/reproduce`. Both of those are private. So the
 * public repository carries its OWN `@slop/ocr-text`: same module contract, every call an
 * honest abstention with a stated reason, no private code behind it. That package is
 * PUBLIC_OWNED below and this script never touches it.
 */
const PACKAGES = ["core", "detectors-code", "detectors-web", "mcp-server"];

/** Copied per package. Anything not named here does not travel. */
const PACKAGE_ENTRIES = {
  core: ["src", "test", "package.json", "tsconfig.json"],
  "detectors-code": ["src", "test", "package.json", "tsconfig.json"],
  "detectors-web": ["src", "test", "package.json", "tsconfig.json"],
  "mcp-server": ["src", "test", "scripts", "build.mjs", "install.sh", "install.ps1", "package.json", "tsconfig.json"],
};

/** Never copied, whatever directory it turns up in. */
const SKIP_NAMES = new Set(["node_modules", "dist", ".git", "coverage"]);
const SKIP_EXT = [".tsbuildinfo"];

/**
 * Files in the public tree this script does NOT own, so a sync never clobbers them.
 *
 * Two kinds. Presentation (the READMEs, the licence, the contributing note) is written for a
 * public audience and would be wrong if it were copied from a private repository's prose. And
 * `packages/ocr-text` is the abstaining stand-in described above: it has no private original
 * to be regenerated from.
 */
const PUBLIC_OWNED = [
  "README.md",
  "LICENSE",
  "CONTRIBUTING.md",
  "package.json",
  "package-lock.json",
  "tsconfig.base.json",
  "tsconfig.json",
  "tsconfig.check.json",
  "vitest.config.ts",
  ".gitignore",
  "scripts/backtest.mjs",
  "calibration/baseline.json",
  "packages/ocr-text",
  "packages/mcp-server/README.md",
];

/**
 * Exact comment scrubs, applied after the copy. Each one must hit or this script fails.
 *
 * Every entry here is a comment that cites a private strategy document or a private codebase
 * by name. The code is unchanged; only the citation is rewritten to state the fact directly,
 * so a public reader loses nothing but a filename they could never open.
 */
const SCRUBS = [
  {
    file: "packages/core/src/assessment.ts",
    from: "`publicity-defamation-risk.md` supplies the reason this is a type and not a style guide:",
    to: "The reason this is a type and not a style guide, rather than a preference:",
  },
  {
    file: "packages/core/src/assessment.ts",
    from: " * `image-detection-reality.md` is unambiguous: a screenshot replaces the encoding,",
    to: " * The published record is unambiguous: a screenshot replaces the encoding,",
  },
  {
    file: "packages/core/test/meta.ts",
    from: "   - a `[a-z_]+` pattern could not express `wingman_nudge2_sent_at`, so a column-leak check",
    to: "   - a `[a-z_]+` pattern could not express a column name carrying a digit, so a column-leak check",
  },
  {
    file: "packages/detectors-web/src/fixtures/negatives.ts",
    from:
      "every face). The write-ups are `waitlist-competitive-look.md` and\n * `waitlist-new-comparables.md`. The fifth, stripe.com, is included as an unambiguous",
    to:
      "every face). The measurement write-ups are held privately; every field below is a number\n * anybody can re-read off the live page. The fifth, stripe.com, is included as an unambiguous",
  },
  {
    file: "packages/detectors-web/src/fixtures/negatives.ts",
    from: " * names the rule that did it. That failure mode, not a missed generator, is what kills this\n * category: `image-detection-reality.md` documents four people publicly accused of being",
    to: " * names the rule that did it. That failure mode, not a missed generator, is what kills this\n * category: the public record documents four people publicly accused of being",
  },
  {
    file: "packages/detectors-web/src/rules/motion.ts",
    from: "`image-detection-reality.md` documents and the reason the category has a body count. So not",
    to: "the public record documents, and the reason the category has a body count. So not",
  },
  {
    file: "packages/detectors-web/test/calibration.test.ts",
    from: " * `image-detection-reality.md` documents four people publicly accused of being machines, and",
    to: " * The public record documents four people publicly accused of being machines, and",
  },
  {
    file: "packages/mcp-server/install.sh",
    from: "raw.githubusercontent.com/Yuve21/slop-scorer/main/packages/mcp-server/install.sh",
    to: "raw.githubusercontent.com/Yuve21/slop-scorer-mcp/main/packages/mcp-server/install.sh",
  },
  {
    file: "packages/mcp-server/install.ps1",
    from: "raw.githubusercontent.com/Yuve21/slop-scorer/main/packages/mcp-server/install.ps1",
    to: "raw.githubusercontent.com/Yuve21/slop-scorer-mcp/main/packages/mcp-server/install.ps1",
    all: true,
  },
  {
    file: "packages/mcp-server/package.json",
    from: '"url": "git+https://github.com/Yuve21/slop-scorer.git",\n    "directory": "packages/mcp-server"',
    to: '"url": "git+https://github.com/Yuve21/slop-scorer-mcp.git",\n    "directory": "packages/mcp-server"',
  },
  {
    file: "packages/mcp-server/package.json",
    from: '"homepage": "https://github.com/Yuve21/slop-scorer/tree/main/packages/mcp-server#readme",\n  "bugs": "https://github.com/Yuve21/slop-scorer/issues",',
    to: '"homepage": "https://github.com/Yuve21/slop-scorer-mcp#readme",\n  "bugs": "https://github.com/Yuve21/slop-scorer-mcp/issues",',
  },
];

/**
 * The leak audit. Runs over EVERY text file in the generated public tree, including the
 * public-owned ones, because a README is as capable of leaking as a source file.
 *
 * `where` narrows a pattern that has a legitimate home somewhere. Nothing else is exempt.
 */
const BANNED = [
  { re: /yuvra(j)?\.chandyok|yuvrajrobotics|@theguarantors/i, what: "a founder email address" },
  { re: /larkdating|lark[- ]dating|\bwingman\b/i, what: "a reference to the Lark Dating project" },
  { re: /[A-Za-z]:\\Users\\|\/Users\/yuvra/i, what: "an absolute path on the founder's machine" },
  { re: /\bsk-[A-Za-z0-9]{16,}|\bsk_live_|\bpk_live_|SUPABASE_[A-Z_]*KEY|SERVICE_ROLE/i, what: "something shaped like a credential" },
  {
    // Anchored on the FILENAME, not the phrase. `"code-review"` is a legitimate npm keyword on
    // the server's own package.json, and a pattern that cannot tell that from `CODE-REVIEW.md`
    // is a pattern somebody eventually deletes.
    re: /market-research\.md|market-check-reproduction\.md|novel-mechanics\.md|image-detection-reality\.md|publicity-defamation-risk\.md|human-verification-licensing\.md|left-field-additions\.md|product-spec\.md|build-plan-optimized\.md|(?:PRODUCT-CRITIQUE|CODE-REVIEW|UI-AUDIT|SELF-AUDIT)[-.]|waitlist-competitive-look|waitlist-new-comparables|design\/(?:SURFACES|SELF-AUDIT|DESIGN)/,
    what: "a private strategy document",
  },
  {
    re: /@slop\/(reproduce|notary|gauntlet|db|provenance|detectors-image|detectors-video|detectors-audio)|packages\/(reproduce|notary|gauntlet|db|provenance|detectors-image|detectors-video|detectors-audio)/,
    what: "a private package",
  },
  // `.env.local` is deliberately NOT here. It is a generic filename, and the core security
  // suite has to name it to assert the scanner refuses to read it.
  { re: /apps\/web|supabase\/migrations|supabase\/functions/, what: "the private web application or its config" },
];

/**
 * Corpus artifacts are the scans of OTHER PEOPLE'S repositories, captured by
 * `npm run capture:code-corpus`. They contain those repositories' import lists, and several of
 * them genuinely import `@supabase/supabase-js`. That is somebody else's dependency in a
 * published corpus, not a leak out of this one, so the audit reads them for credentials and
 * founder identifiers and does not read them for the private-package patterns.
 */
const isForeignCorpus = (rel) => /test[\\/]corpus[\\/].*\.artifact\.json$/.test(rel);
const CORPUS_EXEMPT = new Set(["a private package", "the private web application or its config"]);

const TEXT_EXT = new Set([".ts", ".mjs", ".js", ".json", ".md", ".sh", ".ps1", ".yml", ".yaml", ".txt"]);

function walk(dir, base = dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (SKIP_NAMES.has(entry)) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full, base));
    else if (!SKIP_EXT.some((e) => entry.endsWith(e))) out.push(path.relative(base, full).split(path.sep).join("/"));
  }
  return out;
}

function copyEntry(from, to) {
  cpSync(from, to, {
    recursive: true,
    filter: (src) => {
      const name = path.basename(src);
      if (SKIP_NAMES.has(name)) return false;
      if (SKIP_EXT.some((e) => name.endsWith(e))) return false;
      return true;
    },
  });
}

function sync() {
  const written = [];
  for (const pkg of PACKAGES) {
    const srcDir = path.join(PRIVATE_ROOT, "packages", pkg);
    const destDir = path.join(PUBLIC_ROOT, "packages", pkg);
    for (const entry of PACKAGE_ENTRIES[pkg]) {
      const rel = `packages/${pkg}/${entry}`;
      if (PUBLIC_OWNED.some((owned) => rel === owned || rel.startsWith(`${owned}/`))) continue;
      const src = path.join(srcDir, entry);
      if (!existsSync(src)) throw new Error(`${rel} is missing from the private repository.`);
      const dest = path.join(destDir, entry);
      if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
      mkdirSync(path.dirname(dest), { recursive: true });
      copyEntry(src, dest);
      written.push(rel);
    }
    // A package README that is not public-owned would be private prose. None of these have one
    // that travels, so assert that rather than trusting the entry list to stay right.
    const readme = path.join(destDir, "README.md");
    if (pkg !== "mcp-server" && existsSync(readme)) rmSync(readme);
  }
  return written;
}

function scrub() {
  const applied = [];
  for (const { file, from, to, all } of SCRUBS) {
    const target = path.join(PUBLIC_ROOT, file);
    if (!existsSync(target)) throw new Error(`scrub target ${file} does not exist in the public tree.`);
    const text = readFileSync(target, "utf8");
    if (!text.includes(from)) {
      throw new Error(
        `scrub did not apply in ${file}. The upstream wording changed:\n  looked for: ${JSON.stringify(from.slice(0, 90))}\n` +
          `Fix the SCRUBS entry in scripts/sync-public-mcp.mjs. Do NOT delete it: it is there because that comment cites something private.`,
      );
    }
    const next = all ? text.split(from).join(to) : text.replace(from, to);
    writeFileSync(target, next);
    applied.push(`${file}: ${from.trim().slice(0, 60)}...`);
  }
  return applied;
}

function audit() {
  const hits = [];
  for (const rel of walk(PUBLIC_ROOT)) {
    if (!TEXT_EXT.has(path.extname(rel))) continue;
    const text = readFileSync(path.join(PUBLIC_ROOT, rel), "utf8");
    const foreign = isForeignCorpus(rel);
    for (const { re, what } of BANNED) {
      if (foreign && CORPUS_EXEMPT.has(what)) continue;
      const m = text.match(re);
      if (m) hits.push({ rel, what, sample: m[0].slice(0, 60) });
    }
  }
  return hits;
}

function main() {
  if (!existsSync(PUBLIC_ROOT)) throw new Error(`public checkout not found at ${PUBLIC_ROOT}. Clone it first.`);

  if (!checkOnly) {
    const written = sync();
    const applied = scrub();
    console.log(`synced ${written.length} entr(ies) from ${PRIVATE_ROOT}`);
    for (const w of written) console.log(`  + ${w}`);
    console.log(`applied ${applied.length} comment scrub(s)`);
  }

  const hits = audit();
  if (hits.length > 0) {
    console.error(`\nLEAK AUDIT FAILED: ${hits.length} hit(s). Nothing may be pushed.`);
    for (const h of hits) console.error(`  ${h.rel}: ${h.what} (${h.sample})`);
    process.exitCode = 1;
    return;
  }
  console.log(`leak audit clean over ${walk(PUBLIC_ROOT).length} file(s) in ${PUBLIC_ROOT}`);
  console.log(`\nnext: cd ${PUBLIC_ROOT} && npm install && npm run build && npm test`);
}

main();
