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
import { analyzeImageArtifact, IMAGE_CONFIG, IMAGE_CORPUS } from "@slop/detectors-image";
import { analyzeVideoArtifact, VIDEO_CONFIG, VIDEO_CORPUS } from "@slop/detectors-video";
import { analyzeAudioArtifact, AUDIO_CONFIG, AUDIO_CORPUS } from "@slop/detectors-audio";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE = path.join(ROOT, "calibration", "baseline.json");
const CODE_CORPUS_DIR = path.join(ROOT, "packages", "detectors-code", "test", "corpus");
const WEB_CORPUS_DIR = path.join(ROOT, "packages", "detectors-web", "test", "corpus");

const read = (p) => JSON.parse(readFileSync(p, "utf8"));

/**
 * Read a captured corpus off disk, index first.
 *
 * The index is the membership list the capture script wrote, so a member that was captured but
 * never indexed - or indexed but never captured - fails here rather than silently shrinking the
 * baseline. Both corpora are read this way, from plain Node with no TypeScript step, which is
 * why the artifacts are JSON on disk rather than compiled literals.
 */
const fromDisk = (dir, indexName) =>
  read(path.join(dir, indexName)).map((entry) => ({
    id: entry.id,
    label: entry.label,
    source: entry.source,
    provenance: entry.provenance,
    capturedAt: entry.capturedAt,
    artifact: read(path.join(dir, `${entry.id}.artifact.json`)),
  }));

// ---- web -------------------------------------------------------------------------------
// The five human pages ship inside the package; the four generated ones are pinned browser
// captures under test/corpus, replayed here exactly as the code corpus is. They are in the
// baseline for the reason everything else is: a reweighting that stops moving a page which
// names its own generator in its own head has to appear in a diff, not in a support ticket.
const webReport = (artifact, id) =>
  buildReport([analyzeArtifact(artifact, { kind: "url", url: `https://calibration.invalid/${id}` })]);
const webCases = [...NEGATIVE_CORPUS, ...fromDisk(WEB_CORPUS_DIR, "web-corpus.index.json")];
const web = runCalibration(CORPUS_VERSION, webCases, webReport);

// ---- code ------------------------------------------------------------------------------
const codeCases = fromDisk(CODE_CORPUS_DIR, "code-corpus.index.json");
const codeReport = (artifact, id) =>
  buildReport([analyzeRepoArtifact(artifact, { kind: "repo", path: `calibration://${id}` })], { config: CODE_CONFIG });
const code = runCalibration(CODE_CONFIG.corpusVersion, codeCases, codeReport);

// ---- media ------------------------------------------------------------------------------
// The three media corpora are STRUCTURAL rather than photographic: constructed files whose
// label states what each one declares about itself. See each package's `src/fixtures/corpus.ts`
// for the full account of why there is no real-world negative corpus behind them yet. They
// belong in the backtest anyway, and for the usual reason: a weight change that starts flagging
// a file which declares a capture, or that stops abstaining on a screenshot, has to be visible
// in a diff rather than discovered later.
const mediaReport = (analyze, config, mediaType) => (artifact, id) =>
  buildReport([analyze(artifact, { kind: "file", path: `calibration://${id}`, mediaType })], { config });

const imageReport = mediaReport(analyzeImageArtifact, IMAGE_CONFIG, "image/jpeg");
const videoReport = mediaReport(analyzeVideoArtifact, VIDEO_CONFIG, "video/mp4");
const audioReport = mediaReport(analyzeAudioArtifact, AUDIO_CONFIG, "audio/wav");

const image = runCalibration(IMAGE_CONFIG.corpusVersion, IMAGE_CORPUS, imageReport);
const video = runCalibration(VIDEO_CONFIG.corpusVersion, VIDEO_CORPUS, videoReport);
const audio = runCalibration(AUDIO_CONFIG.corpusVersion, AUDIO_CORPUS, audioReport);

const baseRate = (report) => report.receipt.priorPoints;
const entries = [
  ...toBaselineEntries("web", web),
  ...toBaselineEntries("code", code),
  ...toBaselineEntries("image", image),
  ...toBaselineEntries("video", video),
  ...toBaselineEntries("audio", audio),
];
const corpusVersions = {
  web: CORPUS_VERSION,
  code: CODE_CONFIG.corpusVersion,
  image: IMAGE_CONFIG.corpusVersion,
  video: VIDEO_CONFIG.corpusVersion,
  audio: AUDIO_CONFIG.corpusVersion,
};
const baseRates = {
  web: baseRate(webReport(webCases[0].artifact, "base-rate")),
  code: baseRate(codeReport(codeCases[0].artifact, "base-rate")),
  image: baseRate(imageReport(IMAGE_CORPUS[0].artifact, "base-rate")),
  video: baseRate(videoReport(VIDEO_CORPUS[0].artifact, "base-rate")),
  audio: baseRate(audioReport(AUDIO_CORPUS[0].artifact, "base-rate")),
};

// The abstention rate, computed here so it is printed on every gate run rather than living in
// a document that goes stale. It is a headline product metric for the media modalities.
for (const [name, report] of [["image", image], ["video", video], ["audio", audio]]) {
  const rows = report.rows;
  const abstained = rows.filter((r) => r.status !== "assessed").length;
  console.log(
    `${name}: abstained on ${abstained} of ${rows.length} corpus member(s) ` +
      `(${Math.round((abstained / rows.length) * 1000) / 10}%). Abstention is the advertised behaviour, not a defect.`,
  );
}

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
