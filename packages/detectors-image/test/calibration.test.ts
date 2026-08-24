import { describe, expect, it } from "vitest";
import {
  analyzeImageArtifact,
  IMAGE_AMBIGUOUS,
  IMAGE_CONFIG,
  IMAGE_CORPUS,
  IMAGE_LAUNDERED,
  IMAGE_NEGATIVES,
  IMAGE_POSITIVES,
  IMAGE_RULES,
  neutralImage,
} from "@slop/detectors-image";
import type { ImageArtifact } from "@slop/detectors-image";
import { assertNegativeCorpus, buildReport, checkNegativeCorpus, formatCalibration, runCalibration } from "@slop/core";
import type { Report } from "@slop/core";
import { mediaClaimViolations } from "@slop/provenance";

import { formatAbstention, MEDIA_ABSTENTION_CODES, summariseAbstention } from "../../provenance/test/abstention.js";

/**
 * The image detector's regression tripwire and its abstention accounting.
 *
 * Read `test/corpus/index.ts` before this file. The short version: the corpus is structural
 * rather than photographic, no number here is a false-positive rate, and the detector ships
 * abstaining by default for exactly that reason.
 */

const score = (artifact: ImageArtifact, id: string): Report =>
  buildReport([analyzeImageArtifact(artifact, { kind: "file", path: `calibration://${id}`, mediaType: "image/jpeg" })], {
    config: IMAGE_CONFIG,
  });

const calibration = runCalibration(IMAGE_CONFIG.corpusVersion, IMAGE_CORPUS, score);
const reports = IMAGE_CORPUS.map((c) => score(c.artifact, c.id));

/** What the engine prints for an artifact nothing fired on. A human member above it moved. */
const BASE_RATE = buildReport(
  [
    analyzeImageArtifact(neutralImage(), { kind: "file", path: "base-rate", mediaType: "image/jpeg" }, { rules: [] }),
  ],
  { config: IMAGE_CONFIG },
).receipt.priorPoints;

describe("calibration against the structural image corpus", () => {
  it("prints the distribution and the abstention accounting, so a regression is readable", () => {
    // eslint-disable-next-line no-console -- the tables are the point of the run
    console.log(`\n${formatCalibration(calibration)}\n${formatAbstention("image", summariseAbstention(reports))}\n`);
    expect(calibration.rows).toHaveLength(IMAGE_CORPUS.length);
  });

  it("no member that declares a capture, or declares nothing, is flagged", () => {
    expect(checkNegativeCorpus(calibration, "some-signals").map((v) => v.message)).toEqual([]);
    expect(() => assertNegativeCorpus(calibration, "some-signals")).not.toThrow();
  });

  it("every scored negative sits at or below the base rate", () => {
    for (const row of calibration.rows.filter((r) => r.label === "human" && r.status === "assessed")) {
      expect(
        row.score ?? 0,
        `${row.id} scored ${row.score} against a base rate of ${BASE_RATE}. Rules that fired: ${
          row.firedRules.join(", ") || "(none)"
        }`,
      ).toBeLessThanOrEqual(BASE_RATE);
    }
  });

  it("a negative that abstains is not counted as a failure", () => {
    // Refusing to score a file that declared nothing is the correct behaviour. Punishing it
    // into a low score would be the same dishonesty as punishing a thin read into one.
    const silent = calibration.rows.filter((r) => r.label === "human" && r.status !== "assessed");
    expect(silent.every((r) => r.score === null && r.band === null)).toBe(true);
  });
});

describe("discrimination: the corpus can still fire", () => {
  it("every member that declares a trained-algorithmic source or tool is scored above the base rate", () => {
    for (const c of IMAGE_POSITIVES) {
      const report = score(c.artifact, c.id);
      expect(report.status, `${c.id}: ${report.abstention.map((a) => a.code).join(", ")}`).toBe("assessed");
      expect(report.score ?? 0, c.id).toBeGreaterThan(BASE_RATE);
    }
  });

  it("no score ever reaches certainty", () => {
    for (const report of reports) expect(report.score ?? 0).toBeLessThanOrEqual(99);
  });

  it("every rule in the corpus fires on at least one member", () => {
    // The whole-corpus version of the dead-rule check. A rule that fires on nothing anywhere
    // is indistinguishable from a rule that broke, and it lowers the score of every artifact
    // it would have flagged while the report keeps printing confident citations for the rest.
    const fired = new Set(
      IMAGE_CORPUS.flatMap((c) =>
        analyzeImageArtifact(c.artifact, { kind: "file", path: c.id, mediaType: "image/jpeg" }).findings.map(
          (f) => f.ruleId,
        ),
      ),
    );
    const dead = IMAGE_RULES.filter((r) => !fired.has(r.id)).map((r) => r.id);
    expect(dead, `these rules fire on no member of the corpus: ${dead.join(", ")}`).toEqual([]);
  });

  it("the gap between the scored negatives and the positives is wide", () => {
    const negatives = calibration.rows.filter((r) => r.label === "human" && r.score !== null).map((r) => r.score!);
    const positives = calibration.rows.filter((r) => r.label === "generated" && r.score !== null).map((r) => r.score!);
    expect(positives.length).toBeGreaterThan(0);
    expect(Math.min(...positives) - Math.max(...negatives, 0)).toBeGreaterThan(20);
  });
});

describe("the re-encoding gate, end to end", () => {
  it("every laundered member is inconclusive with the artifact_re_encoded code and no score", () => {
    for (const c of IMAGE_LAUNDERED) {
      const report = score(c.artifact, c.id);
      expect(report.status, c.id).toBe("inconclusive");
      expect(report.score, c.id).toBeNull();
      expect(report.band, c.id).toBeNull();
      expect(report.abstention.map((a) => a.code), c.id).toContain("artifact_re_encoded");
    }
  });

  it("no rule was even evaluated on a laundered member", () => {
    // The gate runs BEFORE the corpus, so the absence of findings is the gate's doing rather
    // than the rules all happening to be quiet. Checked, because those two states look
    // identical in a report and mean opposite things.
    for (const c of IMAGE_LAUNDERED) {
      const result = analyzeImageArtifact(c.artifact, { kind: "file", path: c.id, mediaType: "image/jpeg" });
      expect(result.rulesEvaluated, c.id).toEqual([]);
      expect(result.findings, c.id).toEqual([]);
      expect(result.warnings?.join(" "), c.id).toMatch(/re-encoding gate is closed/);
    }
  });

  it("the rules are alive underneath the gate, proven by bypassing it", () => {
    // The other half. Without this the test above would pass just as well if the corpus were
    // empty. A laundered file that DOES declare something still declares it; we decline to
    // report it, and here we prove the decline is a choice rather than a dead rule.
    const laundered = IMAGE_LAUNDERED.find((c) => c.id === "declared-screen-capture")!;
    const bypassed = analyzeImageArtifact(
      laundered.artifact,
      { kind: "file", path: laundered.id, mediaType: "image/jpeg" },
      { bypassLaunderingGateForTesting: true },
    );
    expect(bypassed.rulesEvaluated.length).toBeGreaterThan(0);
  });

  it("the gate's rationale cites its source and says what WE did", () => {
    const report = score(IMAGE_LAUNDERED[0]!.artifact, IMAGE_LAUNDERED[0]!.id);
    const detail = report.abstention.find((a) => a.code === "artifact_re_encoded")!.detail;
    expect(detail).toMatch(/arXiv/);
    expect(mediaClaimViolations(detail)).toEqual([]);
  });
});

describe("abstention is a first-class outcome with coded reasons", () => {
  const summary = summariseAbstention(reports);

  it("abstains on a substantial share of the corpus, and that is the design", () => {
    expect(summary.total).toBe(IMAGE_CORPUS.length);
    expect(summary.assessed + summary.inconclusive + summary.notAssessed).toBe(summary.total);
    expect(summary.rate).toBeGreaterThan(0);
  });

  it("every abstention carries a code from the known set, never bare prose", () => {
    for (const report of reports) {
      for (const reason of report.abstention) {
        expect(MEDIA_ABSTENTION_CODES, reason.code).toContain(reason.code);
        expect(reason.detail.length, reason.code).toBeGreaterThan(60);
      }
    }
  });

  it("a file that declares nothing abstains with no_declared_provenance rather than scoring low", () => {
    const silent = score(
      IMAGE_NEGATIVES.find((c) => c.id === "camera-original-no-makernote")!.artifact,
      "camera-original-no-makernote",
    );
    expect(silent.status).toBe("inconclusive");
    expect(silent.score).toBeNull();
    expect(silent.abstention.map((a) => a.code)).toContain("no_declared_provenance");
    expect(silent.abstention[0]!.detail).toMatch(/no declaration in either direction/i);
  });

  it("every abstention sentence passes the media claim guard", () => {
    for (const report of reports) {
      for (const reason of report.abstention) expect(mediaClaimViolations(reason.detail), reason.detail).toEqual([]);
      expect(mediaClaimViolations(report.verdict), report.verdict).toEqual([]);
    }
  });

  it("an ambiguous declaration is carried as ambiguous, not resolved", () => {
    for (const c of IMAGE_AMBIGUOUS) {
      const report = score(c.artifact, c.id);
      // A mixed-path tool is a weak signal by design: it may be scored, but never highly.
      if (report.status === "assessed") expect(report.score ?? 0).toBeLessThan(60);
    }
  });
});

describe("the corpus states what it is, and what it is not", () => {
  it("every member states how its label is known and disclaims being a rate", () => {
    for (const c of IMAGE_CORPUS) {
      expect(c.provenance.length, c.id).toBeGreaterThan(120);
      expect(c.provenance, c.id).toMatch(/is a false-positive rate/);
      expect(c.source, c.id).toBeTruthy();
    }
  });

  it("covers both container families the image modality actually receives", () => {
    const formats = new Set(IMAGE_CORPUS.map((c) => c.artifact.container.format));
    expect(formats).toContain("jpeg");
    expect(formats).toContain("png");
  });

  it("contains members of all four kinds, so no assertion above is vacuous", () => {
    expect(IMAGE_NEGATIVES.length).toBeGreaterThanOrEqual(6);
    expect(IMAGE_POSITIVES.length).toBeGreaterThanOrEqual(5);
    expect(IMAGE_LAUNDERED.length).toBeGreaterThanOrEqual(4);
    expect(IMAGE_AMBIGUOUS.length).toBeGreaterThanOrEqual(1);
  });
});
