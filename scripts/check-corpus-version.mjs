#!/usr/bin/env node
// The corpus version is a promise about a set. This is what keeps the promise.
//
//   node scripts/check-corpus-version.mjs           check against docs/agents/corpus.lock.json
//   node scripts/check-corpus-version.mjs --write   re-record the lock (do this WITH a version bump)
//
// Three things it enforces, per corpus:
//
//   1. THE DIGEST. A hash over every rule's scoring-relevant fields (id, family, polarity,
//      baseWeight, maxHits, severity, evidenceKind, since). If that set changes and the declared
//      version does not, this fails. A receipt prints `corpus <version>` on its face
//      (packages/core/src/receipt.ts:32) and the verdict sentence names it again
//      (assessment.ts:174), so a version that does not describe the rules that ran is published as
//      a fact about the artifact. That is a lie of exactly the kind this product sells the
//      detection of.
//
//   2. THE `since` DRIFT. No rule may declare a `since` newer than the version its corpus declares.
//      Today twelve web rules say "corpus-2026.10" while CORPUS_VERSION is "corpus-2026.09"
//      (LEARNINGS L-11), so the drift is NOT zero and this reports it against a recorded baseline
//      instead of pretending. A move in EITHER direction is a finding.
//
//      Why a baseline and not a hard zero: bumping the web corpus version regenerates
//      apps/web/lib/corpus.json, apps/web/lib/gauntlet/pool.json (which embeds the version inside
//      more than twenty frozen verdict sentences) and the backtest baseline, all of which need the
//      capture scripts and a browser. A gate that is quietly waived is worse than one that reports
//      its own debt on every run. This one prints the debt every run and fails if it moves.
//
//   3. THE MANDATORY FIELDS. Every rule must carry a non-empty falsePositiveNote and a `since`.
//      The note is the published condition under which the rule is WRONG, and attachRemedies
//      injects it as the rebuttal on every patch the rule proposes, so a missing or empty note
//      travels attached to an edit somebody is about to apply.
//
// It reads the BUILT corpora rather than grepping the source, because a regex over source is a
// guess about the input and this repository has already shipped that defect (L-05, L-11). Run
// `npm run build` first; if dist is stale, this checks a stale corpus and says so is impossible,
// which is why the mtime comparison below exists.

import { readFileSync, writeFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

const REPO = path.resolve(import.meta.dirname, "..");
const LOCK = path.join(REPO, "docs", "agents", "corpus.lock.json");
const write = process.argv.includes("--write");
const rel = (f) => path.relative(REPO, f).split(path.sep).join("/");

// The corpora, named by the package that owns them. Adding a modality means adding a line here,
// and a modality with no line is caught by the package sweep at the bottom rather than by memory.
const CORPORA = [
  { id: "web", pkg: "detectors-web", rules: "WEB_RULES", version: "CORPUS_VERSION" },
  { id: "code", pkg: "detectors-code", rules: "CODE_RULES", version: "CODE_CORPUS_VERSION" },
  { id: "image", pkg: "detectors-image", rules: "IMAGE_RULES", version: "IMAGE_CORPUS_VERSION" },
  { id: "video", pkg: "detectors-video", rules: "VIDEO_RULES", version: "VIDEO_CORPUS_VERSION" },
  { id: "audio", pkg: "detectors-audio", rules: "AUDIO_PROVENANCE_RULES", version: "AUDIO_CORPUS_VERSION" },
  { id: "audio-stream", pkg: "detectors-audio", rules: "AUDIO_STREAM_RULES", version: "STREAM_CORPUS_VERSION" },
];

// packages/provenance is deliberately absent, and the reason is named here rather than left as a
// silent gap. `provenanceRules` is a generic FACTORY, not a corpus: it instantiates the shared
// media rules into detectors-image, detectors-video and detectors-audio, each of which declares
// its own version and IS checked above. MEDIA_CORPUS_VERSION is only the fallback default in
// provenance/src/analyze.ts. If provenance ever exports a concrete rule array, it belongs above.
const EXEMPT_PACKAGES = new Set(["provenance"]);

const problems = [];
const fail = (m) => problems.push(m);

// A version string sorts by its own text here ("corpus-2026.09" < "corpus-2026.10"), which is true
// for this scheme and would silently stop being true for another. Assert the shape rather than
// assuming it: an unparseable version is a finding, not a default.
const VERSION_SHAPE = /^[a-z-]*corpus-(\d{4})\.(\d{2})$/;
const ordinal = (v) => {
  const m = VERSION_SHAPE.exec(v);
  return m ? Number(m[1]) * 100 + Number(m[2]) : null;
};

const results = [];

for (const c of CORPORA) {
  const dist = path.join(REPO, "packages", c.pkg, "dist", "index.js");
  if (!existsSync(dist)) {
    fail(`${c.id}: ${rel(dist)} does not exist. Run "npm run build" first; this script reads the built corpus on purpose.`);
    continue;
  }
  // A dist older than its own src is a corpus this script would check while the product ships a
  // different one. Checking the wrong artifact and printing OK is the failure class this repo
  // exists to catch, so it is a hard error rather than a warning.
  //
  // Compare NEWEST src against NEWEST dist, not against dist/index.js. The first version of this
  // check used dist/index.js as the reference and reported detectors-audio stale when it was not:
  // three src files were newer than index.js because they compile to their OWN dist files, which
  // were newer still, and `tsc -b --dry` correctly said "up to date". A guard that fires on a
  // correct state gets edited around rather than obeyed, which is the same reason
  // provenance/src/claims.ts word-boundary-anchors its phrases.
  const srcDir = path.join(REPO, "packages", c.pkg, "src");
  const distDir = path.join(REPO, "packages", c.pkg, "dist");
  const newest = (dir) => {
    let t = 0;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      t = Math.max(t, e.isDirectory() ? newest(p) : statSync(p).mtimeMs);
    }
    return t;
  };
  if (newest(srcDir) > newest(distDir)) {
    fail(`${c.id}: ${rel(distDir)} is older than ${rel(srcDir)}. Run "npm run build"; checking a stale corpus and printing OK is the defect this product detects.`);
    continue;
  }

  const mod = await import(pathToFileURL(dist).href);
  const rules = mod[c.rules];
  const version = mod[c.version];

  if (!Array.isArray(rules)) { fail(`${c.id}: ${c.pkg} does not export an array called ${c.rules}`); continue; }
  if (typeof version !== "string" || !version) { fail(`${c.id}: ${c.pkg} does not export a version string called ${c.version}`); continue; }
  // A corpus of zero rules is a failure, not a pass. Emptying three families is the mutation that
  // proved a tautological test in this repo; a denominator of zero here would hide the same thing.
  if (rules.length === 0) { fail(`${c.id}: the corpus is EMPTY. Zero rules is a failure, not a pass.`); continue; }

  const declared = ordinal(version);
  if (declared === null) fail(`${c.id}: declared version "${version}" does not match the expected shape ${VERSION_SHAPE}`);

  // The digest covers exactly the fields that change what a score MEANS. Prose (title,
  // explanation, prevention) is deliberately excluded: rewording a rationale is not a corpus
  // change and forcing a version bump for it would train everybody to bump without thinking.
  const projected = rules
    .map((r) => ({
      id: r.id,
      family: r.family,
      polarity: r.polarity,
      counterScope: r.counterScope ?? null,
      baseWeight: r.baseWeight,
      maxHits: r.maxHits,
      severity: r.severity,
      evidenceKind: r.evidenceKind ?? null,
      requiresProbe: r.requiresProbe,
      phase: r.phase,
      since: r.since,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  for (const r of projected) {
    if (!r.since) fail(`${c.id}: rule "${r.id}" has no "since"`);
    if (typeof r.baseWeight !== "number" || Number.isNaN(r.baseWeight)) fail(`${c.id}: rule "${r.id}" has a non-numeric baseWeight`);
  }
  for (const r of rules) {
    const note = typeof r.falsePositiveNote === "string" ? r.falsePositiveNote.trim() : "";
    if (!note) fail(`${c.id}: rule "${r.id}" has no falsePositiveNote. It is the published condition under which the rule is WRONG, and it rides on every patch the rule proposes.`);
  }

  const ahead = projected.filter((r) => {
    const o = ordinal(r.since);
    return o !== null && declared !== null && o > declared;
  });
  const unparseable = projected.filter((r) => ordinal(r.since) === null);
  for (const r of unparseable) fail(`${c.id}: rule "${r.id}" has since="${r.since}", which does not match the expected version shape, so its age cannot be compared`);

  results.push({
    id: c.id,
    package: c.pkg,
    declaredVersion: version,
    ruleCount: rules.length,
    digest: createHash("sha256").update(JSON.stringify(projected)).digest("hex").slice(0, 16),
    sinceAheadOfDeclared: ahead.length,
    sinceAheadRules: ahead.map((r) => r.id).sort(),
  });
}

// Any detector package with no entry in CORPORA is a modality this gate does not cover, and a gate
// with an invisible hole is the shape that lets a corpus ship unchecked. Derive the list from the
// filesystem rather than trusting the table above to have kept up.
const packaged = readdirSync(path.join(REPO, "packages")).filter((p) => p.startsWith("detectors-") || p === "provenance");
for (const p of packaged) {
  if (!CORPORA.some((c) => c.pkg === p) && !EXEMPT_PACKAGES.has(p)) {
    fail(`packages/${p} exists but has no entry in this script's CORPORA table and is not in EXEMPT_PACKAGES, so its corpus is unversioned by this gate`);
  }
}

if (results.length === 0 && problems.length === 0) fail("checked zero corpora. A run with no denominator is a failure, not a pass.");

const lockBody =
  JSON.stringify(
    {
      _generated: "node scripts/check-corpus-version.mjs --write   (run this WITH a deliberate version bump, never to make a red run go green)",
      _note:
        "sinceAheadOfDeclared is a recorded DEBT, not a target. It is non-zero today because bumping a corpus version regenerates frozen artifacts that need a browser. A move in either direction is a finding. See LEARNINGS L-11.",
      corpora: results,
    },
    null,
    2,
  ) + "\n";

const print = () => {
  for (const r of results) {
    const drift = r.sinceAheadOfDeclared === 0 ? "0" : `${r.sinceAheadOfDeclared} (${r.sinceAheadRules.slice(0, 3).join(", ")}${r.sinceAheadRules.length > 3 ? ", ..." : ""})`;
    console.log(`  ${r.id.padEnd(6)} ${r.declaredVersion.padEnd(26)} ${String(r.ruleCount).padStart(3)} rules  digest ${r.digest}  since-ahead ${drift}`);
  }
};

if (write) {
  writeFileSync(LOCK, lockBody);
  print();
  if (problems.length) {
    console.error(`\nFAIL: wrote the lock, but ${problems.length} problem(s) remain and a lock does not fix them:`);
    for (const p of problems) console.error("  - " + p);
    process.exit(1);
  }
  console.log(`\nwrote ${rel(LOCK)}: ${results.length} corpora, ${results.reduce((n, r) => n + r.ruleCount, 0)} rules`);
  process.exit(0);
}

if (!existsSync(LOCK)) {
  console.error(`FAIL: ${rel(LOCK)} does not exist. Run: node scripts/check-corpus-version.mjs --write`);
  process.exit(1);
}

const lock = JSON.parse(readFileSync(LOCK, "utf8"));
const byId = new Map((lock.corpora ?? []).map((c) => [c.id, c]));

for (const r of results) {
  const was = byId.get(r.id);
  if (!was) { fail(`${r.id}: no entry in ${rel(LOCK)}. A new corpus must be recorded deliberately.`); continue; }
  if (was.digest !== r.digest) {
    if (was.declaredVersion === r.declaredVersion) {
      fail(
        `${r.id}: the rule set CHANGED (digest ${was.digest} -> ${r.digest}) but the declared version is still "${r.declaredVersion}". ` +
          `Bump the version and regenerate everything that froze the old one, then re-run with --write.`,
      );
    } else {
      fail(`${r.id}: the rule set changed AND the version moved ("${was.declaredVersion}" -> "${r.declaredVersion}"). That is correct; re-run with --write to record it.`);
    }
  }
  if (was.sinceAheadOfDeclared !== r.sinceAheadOfDeclared) {
    fail(
      `${r.id}: since-ahead drift moved ${was.sinceAheadOfDeclared} -> ${r.sinceAheadOfDeclared}. ` +
        `A move in either direction is a finding: say whether rules were added under a future version, or whether the version was bumped to cover them.`,
    );
  }
}
for (const id of byId.keys()) if (!results.some((r) => r.id === id)) fail(`${rel(LOCK)} records corpus "${id}", which no longer exists`);

print();
if (problems.length) {
  console.error(`\nFAIL: ${problems.length} problem(s):`);
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
const totalRules = results.reduce((n, r) => n + r.ruleCount, 0);
const totalDrift = results.reduce((n, r) => n + r.sinceAheadOfDeclared, 0);
console.log(`\nOK: ${results.length} corpora, ${totalRules} rules, all digests match the lock. Recorded since-ahead debt: ${totalDrift} (LEARNINGS L-11).`);
