/**
 * `node scripts/build-gauntlet-pool.mjs` — freeze the gauntlet's pool for the web app.
 *
 * WHY A SNAPSHOT AND NOT A RUNTIME READ. The corpora live in `packages/*&#47;test/corpus` as JSON
 * the capture scripts wrote, and `apps/web` cannot read them at request time: on a serverless
 * runtime the files are outside the traced bundle, and a page whose data depends on the shape of
 * a deploy is a page that works locally and 500s in production. So the pool is built here, once,
 * from the same loaders `scripts/backtest.mjs` uses, and committed. A test re-runs this build and
 * compares, so a snapshot that has gone stale against the corpus fails the suite rather than
 * quietly serving last month's cards.
 *
 * WHAT IS IN THE SNAPSHOT, and why each part:
 *
 *  - `presentation` — the redacted card the player sees, built by `presentRepo` / `presentWeb`.
 *  - `label`, `source`, `provenance` — the answer key and its stated basis. SERVER ONLY. The
 *    file is imported exclusively from modules that carry `import "server-only"`, and the
 *    round view the browser receives is built by naming fields, never by deleting them.
 *  - `report` — a REAL detector run over the same artifact, through the same `buildReport` the
 *    product ships, so the reveal can say what our own detector made of each card instead of
 *    asserting it. `elapsedMs` is the measured duration of that run.
 *
 * The second output, `pool-ids.json`, carries ids and nothing else. `generateStaticParams` runs
 * in a worker of its own and must not pull in a file that holds the answers; the same partition
 * `lib/sample-ids.ts` exists for.
 *
 * The third, `corpus.json`, is the rule membership of both corpora: version and rule ids. It
 * exists because importing `@slop/detectors-code` into `apps/web` just to count its rules pulls
 * `scan.js` into the bundle, whose `readFile(path.join(root, candidate))` makes Turbopack trace
 * THE WHOLE PROJECT into the serverless output. A repository scanner has no business in a web
 * request; a list of rule ids does. `apps/web/test/corpus-manifest.test.ts` re-derives it.
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildReport } from "@slop/core";
import { analyzeArtifact, CORPUS_VERSION, NEGATIVE_CORPUS, RULE_DESCRIPTORS } from "@slop/detectors-web";
import { analyzeRepoArtifact, CODE_CONFIG, CODE_RULE_DESCRIPTORS } from "@slop/detectors-code";
import { poolRowsFromCorpus, presentRepo, presentWeb } from "@slop/gauntlet";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CODE_CORPUS_DIR = path.join(ROOT, "packages", "detectors-code", "test", "corpus");
const WEB_CORPUS_DIR = path.join(ROOT, "packages", "detectors-web", "test", "corpus");
const OUT_DIR = path.join(ROOT, "apps", "web", "lib", "gauntlet");

const read = (p) => JSON.parse(readFileSync(p, "utf8"));

/** Identical to the reader in `scripts/backtest.mjs`: index first, so a gap fails here. */
const fromDisk = (dir, indexName) =>
  read(path.join(dir, indexName)).map((entry) => ({
    id: entry.id,
    label: entry.label,
    source: entry.source,
    provenance: entry.provenance,
    capturedAt: entry.capturedAt,
    artifact: read(path.join(dir, `${entry.id}.artifact.json`)),
  }));

/**
 * The date the pool rows carry.
 *
 * Fixed rather than `new Date()`: `addedAt` lands inside the committed snapshot, and a
 * timestamp that moves on every run makes the staleness test a diff of the clock.
 */
const ADDED_AT = "2026-08-24T00:00:00.000Z";

const codeCases = fromDisk(CODE_CORPUS_DIR, "code-corpus.index.json");
const webCases = [...NEGATIVE_CORPUS, ...fromDisk(WEB_CORPUS_DIR, "web-corpus.index.json")];

const codePool = poolRowsFromCorpus({ corpus: "code", cases: codeCases, present: presentRepo, addedAt: ADDED_AT });
const webPool = poolRowsFromCorpus({ corpus: "web", cases: webCases, present: presentWeb, addedAt: ADDED_AT });

const artifactById = new Map([
  ...codeCases.map((c) => [`code:${c.id}`, { kind: "code", case: c }]),
  ...webCases.map((c) => [`web:${c.id}`, { kind: "web", case: c }]),
]);

/** One real detector run, timed. The duration is the receipt's largest object, so it is measured. */
function reportFor(artifactId) {
  const entry = artifactById.get(artifactId);
  if (entry === undefined) throw new Error(`no artifact behind pool row ${artifactId}`);
  const started = process.hrtime.bigint();
  const report =
    entry.kind === "code"
      ? buildReport([analyzeRepoArtifact(entry.case.artifact, { kind: "repo", path: `corpus://${artifactId}` })], {
          config: CODE_CONFIG,
        })
      : buildReport([analyzeArtifact(entry.case.artifact, { kind: "url", url: `https://corpus.invalid/${artifactId}` })]);
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
  return { report, elapsedMs, corpusVersion: entry.kind === "code" ? CODE_CONFIG.corpusVersion : CORPUS_VERSION };
}

const skipped = [...codePool.skipped, ...webPool.skipped];
const artifacts = [...codePool.rows, ...webPool.rows].map((row) => {
  const { report, elapsedMs } = reportFor(row.artifactId);
  return {
    artifactId: row.artifactId,
    corpus: row.corpus,
    label: row.label,
    source: row.source,
    provenance: row.provenance,
    captureDate: row.captureDate,
    addedAt: row.addedAt,
    retiredAt: row.retiredAt,
    presentation: row.presentation,
    report,
    // Rounded to the tenth of a millisecond: the snapshot is committed, and a full-precision
    // float re-measured on another machine would make every rebuild a diff.
    elapsedMs: Math.round(elapsedMs * 10) / 10,
  };
});

const snapshot = {
  note:
    "Generated by scripts/build-gauntlet-pool.mjs. Do not edit by hand. Holds the gauntlet answer " +
    "key (label, source, provenance) and is therefore imported only from server-only modules.",
  builtWith: { code: CODE_CONFIG.corpusVersion, web: CORPUS_VERSION },
  addedAt: ADDED_AT,
  skipped,
  artifacts,
};

writeFileSync(path.join(OUT_DIR, "pool.json"), `${JSON.stringify(snapshot, null, 2)}\n`);
writeFileSync(
  path.join(OUT_DIR, "pool-ids.json"),
  `${JSON.stringify(
    artifacts.map((a) => ({ artifactId: a.artifactId, corpus: a.corpus, name: a.artifactId.slice(a.corpus.length + 1) })),
    null,
    2,
  )}\n`,
);

writeFileSync(
  path.join(OUT_DIR, "..", "corpus.json"),
  `${JSON.stringify(
    {
      note: "Generated by scripts/build-gauntlet-pool.mjs. Rule membership only: no artifacts, no labels.",
      code: { corpusVersion: CODE_CONFIG.corpusVersion, ruleIds: CODE_RULE_DESCRIPTORS.map((r) => r.id) },
      web: { corpusVersion: CORPUS_VERSION, ruleIds: RULE_DESCRIPTORS.map((r) => r.id) },
    },
    null,
    2,
  )}
`,
);

const bytes = JSON.stringify(snapshot).length;
console.log(
  `gauntlet pool: ${artifacts.length} artifacts ` +
    `(${artifacts.filter((a) => a.label === "human").length} human, ` +
    `${artifacts.filter((a) => a.label === "generated").length} generated), ` +
    `${skipped.length} skipped, ${(bytes / 1024).toFixed(0)} KB`,
);
for (const s of skipped) console.log(`  skipped ${s.id}: ${s.reason}`);
