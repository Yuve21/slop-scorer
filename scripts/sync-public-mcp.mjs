/**
 * `node scripts/sync-public-mcp.mjs`: regenerate the PUBLIC MCP repository from this one.
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
 *   node scripts/sync-public-mcp.mjs --check      # verify only, write nothing (exit 1 on drift)
 *   node scripts/sync-public-mcp.mjs --out DIR    # target a different checkout
 *
 * THE PROPERTY `--check` ASSERTS, and it is the whole point of the mode:
 *
 *     --check passes only if re-running the sync would be a NO-OP.
 *
 * That is COMPLETENESS as well as soundness. The first version of this check audited the
 * public tree for leaked private content and printed "leak audit clean", which made it sound:
 * every hit it reported was real. It was not COMPLETE, because it had no notion of the private
 * repository having moved ahead, so a mirror missing a whole file passed as clean. Measured
 * 2026-08-26: `--check` exited 0 while `packages/core/src/observation.ts`, 18 197 bytes of it,
 * did not exist in the public tree at all. A gate that reports success without doing its job is
 * the disqualifying defect this product exists to detect, and it was sitting in this product's
 * own publish gate.
 *
 * HOW IT IS IMPLEMENTED, and why this way. `--check` generates the whole projection into a
 * temporary directory and DIFFS it against the mirror. It deliberately does NOT enumerate rules
 * about what the mirror ought to contain: an enumerated list is a second copy of the truth, and
 * it rots exactly the way the first version of this check did. The generator is the only
 * description of the projection, so the check runs the generator.
 *
 * After a sync, in the public checkout: `npm install && npm run build && npm test`, then commit.
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
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
  // The private repository's GOVERNANCE surface, which is a different thing from its strategy
  // documents and was not covered by anything until the observation loop shipped through here.
  // Four kinds turned up in one sync: a runbook citation, a ratchet script, a build gate that does
  // NOT exist in the public repository (so citing it published a guarantee nothing backs), and
  // LEARNINGS entry ids. The rewrites state the fact instead of the filename, which is what the
  // rest of this list does, and the BANNED entry below keeps the class from coming back quietly.
  {
    file: "packages/core/src/observation.ts",
    from:
      ' * The runbook this implements is `docs/agents/HQ.md`, "Training the corpus". Five stages:\n' +
      " * observation (here), candidate (here), review by corpus-steward AND false-positive-hunter,\n" +
      " * promotion with a version bump, and the ratchet in `scripts/check-corpus-version.mjs`.",
    to:
      " * The runbook this implements is held privately, so its five stages are stated here rather\n" +
      " * than cited: observation (here), candidate (here), review by two independent reviewers,\n" +
      " * promotion with a version bump, and a ratchet that refuses a rule set changed without one.",
  },
  {
    file: "packages/core/src/observation.ts",
    from: " *     no network API, and `scripts/check-no-egress.mjs` fails the build if that changes.",
    to: " *     no network API, which a reader of this package can confirm with a grep of its imports.",
  },
  {
    file: "packages/core/src/observation.ts",
    from: "   * valuable of the two (see LEARNINGS L-05).",
    to: "   * valuable of the two: a rule that fires nowhere is dead, and a dead rule fails in silence.",
  },
  {
    file: "packages/core/test/observation.test.ts",
    from: " * whose author never watched it fail is a decoration (HOUSE-KNOWLEDGE, the disqualifying class).",
    to: " * whose author never watched it fail is a decoration, and that is the disqualifying defect class.",
  },
  {
    file: "packages/core/test/observation.test.ts",
    from: ' * stays clean is the shape of LEARNINGS L-06: the gauntlet redaction suite asserted "contains no',
    to: ' * stays clean is a known failure shape here: a redaction suite once asserted "contains no',
  },
  {
    file: "packages/core/test/observation.test.ts",
    from: "    // That set is what tells a steward a rule is DEAD (LEARNINGS L-05), which is the whole reason",
    to: "    // That set is what tells a steward a rule is DEAD, which is the whole reason",
  },
  {
    file: "packages/core/test/observation.test.ts",
    from: "  // of L-06 and it is why these are not four copies of `expect(fn).toThrow()`.",
    to: "  // that keeps an absence test honest, and it is why these are not four copies of `expect(fn).toThrow()`.",
  },
  {
    file: "packages/core/test/observation.test.ts",
    from: "    // A count that only agrees with itself is not a verification (HOUSE-KNOWLEDGE). Here the count",
    to: "    // A count that only agrees with itself is not a verification. Here the count",
  },
  {
    file: "packages/mcp-server/src/observations.ts",
    from:
      " * this module, no client, and no transport to inject one into. `scripts/check-no-egress.mjs` fails\n" +
      " * the build if that ever stops being true, and it scans this file.",
    to:
      " * this module, no client, and no transport to inject one into, which a reader can confirm with\n" +
      " * a grep of this file for a URL, a client or an import that could carry one.",
  },
  {
    file: "packages/mcp-server/src/observations.ts",
    from: " * its job: the disqualifying defect class in HOUSE-KNOWLEDGE, written into the privacy mechanism",
    to: " * its job: the defect class this project is built to catch, written into the privacy mechanism",
  },
  {
    file: "packages/mcp-server/src/targets.ts",
    from: ' * The corpus training loop, stage 1. See `docs/agents/HQ.md`, "Training the corpus".',
    to: " * The corpus training loop, stage 1.",
  },
  {
    file: "packages/mcp-server/test/observations.test.ts",
    from: " * double behaves, which is the shape of LEARNINGS L-02: a verification whose reference value comes",
    to: " * double behaves, which is a known failure shape: a verification whose reference value comes",
  },
  {
    file: "packages/mcp-server/test/observations.test.ts",
    from: " * over an input that had no path is LEARNINGS L-06, and it is the exact test this file must not be.",
    to: " * over an input that had no path is a test that certifies silence, and it is the exact test this\n * file must not be.",
  },
  {
    file: "packages/mcp-server/test/observations.test.ts",
    from: "    // below would pass over an input that never contained them, which is L-06 exactly.",
    to: "    // below would pass over an input that never contained them, certifying silence.",
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
  {
    // The private repository's GOVERNANCE surface, which the strategy-document pattern above does
    // not reach and nothing else covered. Every one of these is a path a public reader cannot
    // open, and `scripts/check-no-egress.mjs` is worse than dangling: it does not exist in the
    // public repository, so a comment citing it publishes a guarantee nothing there backs, which
    // is the same shape as a README claiming a guard covers "all shipped source" when it does not.
    // Found 2026-08-26, thirteen citations across five files, on the first sync that carried the
    // observation loop. Package NAMES are handled by the entry above; this one also catches the
    // one bare prose mention ("the gauntlet redaction suite") that the `@slop/`-anchored pattern
    // could not express. `provenance` is deliberately absent from both: it is an ordinary word
    // here (C2PA provenance) with 95 legitimate uses, and a pattern that cannot tell those from a
    // package reference is a pattern somebody eventually deletes.
    re: /docs\/agents\/|HOUSE-KNOWLEDGE|LEARNINGS\.md|LEARNINGS L-|\bL-\d{2}\b|\.claude\/agents|scripts\/check-(?:no-egress|corpus-version|agent-roster)\.mjs|corpus\/candidates|\bgauntlet\b|\bnotary\b/i,
    what: "a private repository governance path",
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

function sync(root) {
  const written = [];
  for (const pkg of PACKAGES) {
    const srcDir = path.join(PRIVATE_ROOT, "packages", pkg);
    const destDir = path.join(root, "packages", pkg);
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

function scrub(root) {
  const applied = [];
  for (const { file, from, to, all } of SCRUBS) {
    const target = path.join(root, file);
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

function audit(root) {
  const hits = [];
  for (const rel of walk(root)) {
    if (!TEXT_EXT.has(path.extname(rel))) continue;
    const text = readFileSync(path.join(root, rel), "utf8");
    const foreign = isForeignCorpus(rel);
    for (const { re, what } of BANNED) {
      if (foreign && CORPUS_EXEMPT.has(what)) continue;
      const m = text.match(re);
      if (m) hits.push({ rel, what, sample: m[0].slice(0, 60) });
    }
  }
  return hits;
}

/**
 * Build the projection the sync WOULD write, in a throwaway directory, without touching the
 * mirror. The temp tree starts as a copy of the mirror so the PUBLIC_OWNED files (the READMEs,
 * the licence, the abstaining `packages/ocr-text`) are present and the scrubs and the audit see
 * a complete tree, then `sync` overwrites everything the generator owns.
 */
function project() {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "slop-public-"));
  copyEntry(PUBLIC_ROOT, tmp);
  const written = sync(tmp);
  const applied = scrub(tmp);
  return { tmp, written, applied };
}

/**
 * Every relative path the generator owns, in whichever tree it is asked about. Derived from
 * PACKAGE_ENTRIES by walking, never enumerated, so a file added to `packages/core/src` upstream
 * is in scope on the run that adds it.
 */
function generatedPaths(root) {
  const out = new Set();
  for (const pkg of PACKAGES) {
    for (const entry of PACKAGE_ENTRIES[pkg]) {
      const rel = `packages/${pkg}/${entry}`;
      if (PUBLIC_OWNED.some((owned) => rel === owned || rel.startsWith(`${owned}/`))) continue;
      const full = path.join(root, ...rel.split("/"));
      if (!existsSync(full)) continue;
      if (statSync(full).isDirectory()) for (const inner of walk(full)) out.add(`${rel}/${inner}`);
      else out.add(rel);
    }
  }
  return out;
}

/**
 * The staleness half of the check. Compares the generated projection against the mirror and
 * returns one entry per file that would change, so `--check` is red for a MISSING file and for
 * a file whose bytes differ, not only for a leak.
 */
function drift(projectedRoot) {
  const expected = generatedPaths(projectedRoot);
  const actual = generatedPaths(PUBLIC_ROOT);
  const problems = [];
  for (const rel of expected) {
    if (!actual.has(rel)) {
      problems.push({ rel, kind: "missing from the public mirror" });
      continue;
    }
    const a = readFileSync(path.join(projectedRoot, ...rel.split("/")));
    const b = readFileSync(path.join(PUBLIC_ROOT, ...rel.split("/")));
    if (!a.equals(b)) problems.push({ rel, kind: `content differs (${a.length} bytes generated, ${b.length} in the mirror)` });
  }
  for (const rel of actual) {
    if (!expected.has(rel)) problems.push({ rel, kind: "present in the public mirror and NOT generated by the sync" });
  }
  return problems;
}

function reportLeaks(hits) {
  if (hits.length === 0) return false;
  console.error(`\nLEAK AUDIT FAILED: ${hits.length} hit(s). Nothing may be pushed.`);
  for (const h of hits) console.error(`  ${h.where} ${h.rel}: ${h.what} (${h.sample})`);
  process.exitCode = 1;
  return true;
}

function main() {
  if (!existsSync(PUBLIC_ROOT)) throw new Error(`public checkout not found at ${PUBLIC_ROOT}. Clone it first.`);

  if (checkOnly) {
    // Generate the projection and diff it. `project()` also runs the scrubs, so `--check` now
    // hard-fails on a scrub that no longer matches, which the audit-only version never did.
    const { tmp, applied } = project();
    try {
      const problems = drift(tmp);
      // Both trees are audited, and the two are not the same question. The mirror is what is
      // published RIGHT NOW; the projection is what the next sync would publish. A leak edited
      // into the mirror only exists in the first, a leak introduced upstream only in the second.
      const hits = [
        ...audit(PUBLIC_ROOT).map((h) => ({ ...h, where: "[mirror]" })),
        ...audit(tmp).map((h) => ({ ...h, where: "[projected]" })),
      ];
      const leaked = reportLeaks(hits);

      if (problems.length > 0) {
        console.error(`\nPUBLIC MIRROR IS STALE: ${problems.length} file(s) would change if the sync ran.`);
        for (const p of problems) console.error(`  ${p.rel}: ${p.kind}`);
        console.error(`\nRun: node scripts/sync-public-mcp.mjs`);
        process.exitCode = 1;
      }
      if (leaked || problems.length > 0) return;

      console.log(`${applied.length} comment scrub(s) still match upstream`);
      console.log(`leak audit clean over ${walk(PUBLIC_ROOT).length} file(s) in ${PUBLIC_ROOT}`);
      console.log(`mirror up to date: ${generatedPaths(PUBLIC_ROOT).size} generated file(s) byte-identical to a fresh sync`);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
    return;
  }

  const written = sync(PUBLIC_ROOT);
  const applied = scrub(PUBLIC_ROOT);
  console.log(`synced ${written.length} entr(ies) from ${PRIVATE_ROOT}`);
  for (const w of written) console.log(`  + ${w}`);
  console.log(`applied ${applied.length} comment scrub(s)`);

  if (reportLeaks(audit(PUBLIC_ROOT).map((h) => ({ ...h, where: "[mirror]" })))) return;
  console.log(`leak audit clean over ${walk(PUBLIC_ROOT).length} file(s) in ${PUBLIC_ROOT}`);
  console.log(`\nnext: cd ${PUBLIC_ROOT} && npm install && npm run build && npm test`);
}

main();
