/**
 * `npm run backtest` — replay every frozen corpus against the CURRENT rules and print the
 * per-artifact delta against the committed baseline.
 *
 * A new or reweighted rule does not ship until this has been run and read. It fails on the
 * two outcomes that must never ship quietly: a human negative moving up a band or over the
 * base rate, and a generated positive falling a band. See `packages/core/src/calibration/
 * backtest.ts` for why those two and not "nothing may move".
 *
 *   node scripts/backtest.mjs            # compare and exit non-zero on a regression
 *   node scripts/backtest.mjs --update   # accept the current numbers as the new baseline
 *
 * It runs against `dist/`, deliberately: the backtest is a statement about what would ship,
 * and the test suite already covers the source.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { backtest, buildReport, formatBacktest, makeBaseline, runCalibration, toBaselineEntries } from "@slop/core";
import { analyzeArtifact, CORPUS_VERSION, NEGATIVE_CORPUS } from "@slop/detectors-web";
import { analyzeRepoArtifact, CODE_CONFIG } from "@slop/detectors-code";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE = path.join(ROOT, "calibration", "baseline.json");
const CODE_CORPUS_DIR = path.join(ROOT, "packages", "detectors-code", "test", "corpus");

const read = (p) => JSON.parse(readFileSync(p, "utf8"));

// ---- web -------------------------------------------------------------------------------
const webReport = (artifact, id) =>
  buildReport([analyzeArtifact(artifact, { kind: "url", url: `https://calibration.invalid/${id}` })]);
const web = runCalibration(CORPUS_VERSION, NEGATIVE_CORPUS, webReport);

// ---- code ------------------------------------------------------------------------------
const index = read(path.join(CODE_CORPUS_DIR, "code-corpus.index.json"));
const codeCases = index.map((entry) => ({
  id: entry.id,
  label: entry.label,
  source: entry.source,
  provenance: entry.provenance,
  capturedAt: entry.capturedAt,
  artifact: read(path.join(CODE_CORPUS_DIR, `${entry.id}.artifact.json`)),
}));
const codeReport = (artifact, id) =>
  buildReport([analyzeRepoArtifact(artifact, { kind: "repo", path: `calibration://${id}` })], { config: CODE_CONFIG });
const code = runCalibration(CODE_CONFIG.corpusVersion, codeCases, codeReport);

const baseRate = (report) => report.receipt.priorPoints;
const entries = [...toBaselineEntries("web", web), ...toBaselineEntries("code", code)];
const corpusVersions = { web: CORPUS_VERSION, code: CODE_CONFIG.corpusVersion };
const baseRates = {
  web: baseRate(webReport(NEGATIVE_CORPUS[0].artifact, "base-rate")),
  code: baseRate(codeReport(codeCases[0].artifact, "base-rate")),
};

const fresh = makeBaseline(new Date().toISOString(), corpusVersions, baseRates, entries);

if (process.argv.includes("--update") || !existsSync(BASELINE)) {
  writeFileSync(BASELINE, `${JSON.stringify(fresh, null, 2)}\n`, "utf8");
  console.log(
    `${existsSync(BASELINE) ? "Updated" : "Created"} ${path.relative(ROOT, BASELINE)} with ${entries.length} entries.`,
  );
  console.log("Commit it in the same change as the rule, so the diff shows what the rule did.");
  process.exit(0);
}

const previous = read(BASELINE);
const result = backtest(previous, entries);
console.log(formatBacktest(result, previous));
process.exit(result.verdict === "pass" ? 0 : 1);
