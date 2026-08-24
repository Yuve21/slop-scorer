import { describe, expect, it } from "vitest";
import {
  analyzeVideoArtifact,
  VIDEO_AMBIGUOUS,
  VIDEO_CONFIG,
  VIDEO_CORPUS,
  VIDEO_LAUNDERED,
  VIDEO_NEGATIVES,
  VIDEO_POSITIVES,
  VIDEO_RULES,
  VIDEO_SILENT,
  neutralVideo,
  withStreamMeasurement,
} from "@slop/detectors-video";
import type { VideoArtifact } from "@slop/detectors-video";
import { assertNegativeCorpus, buildReport, checkNegativeCorpus, formatCalibration, runCalibration } from "@slop/core";
import type { Report } from "@slop/core";
import { mediaClaimViolations } from "@slop/provenance";
import { formatAbstention, MEDIA_ABSTENTION_CODES, summariseAbstention } from "../../provenance/test/abstention.js";

const input = (id: string) => ({ kind: "file", path: `calibration://${id}`, mediaType: "video/mp4" }) as const;
const score = (artifact: VideoArtifact, id: string): Report =>
  buildReport([analyzeVideoArtifact(artifact, input(id))], { config: VIDEO_CONFIG });

const calibration = runCalibration(VIDEO_CONFIG.corpusVersion, VIDEO_CORPUS, score);
const reports = VIDEO_CORPUS.map((c) => score(c.artifact, c.id));
const BASE_RATE = buildReport([analyzeVideoArtifact(neutralVideo(), input("base-rate"), { rules: [] })], {
  config: VIDEO_CONFIG,
}).receipt.priorPoints;

describe("calibration against the structural video corpus", () => {
  it("prints the distribution and the abstention accounting", () => {
    // eslint-disable-next-line no-console -- the tables are the point of the run
    console.log(`\n${formatCalibration(calibration)}\n${formatAbstention("video", summariseAbstention(reports))}\n`);
    expect(calibration.rows).toHaveLength(VIDEO_CORPUS.length);
  });

  it("no member that declares a capture, or declares nothing, is flagged", () => {
    expect(checkNegativeCorpus(calibration, "some-signals").map((v) => v.message)).toEqual([]);
    expect(() => assertNegativeCorpus(calibration, "some-signals")).not.toThrow();
  });

  it("every scored negative sits at or below the base rate", () => {
    for (const row of calibration.rows.filter((r) => r.label === "human" && r.status === "assessed")) {
      expect(row.score ?? 0, `${row.id} fired: ${row.firedRules.join(", ") || "(none)"}`).toBeLessThanOrEqual(BASE_RATE);
    }
  });

  it("standard capture resolutions are never read as a screen geometry", () => {
    for (const id of ["phone-recording", "camera-recording-4k"]) {
      const c = VIDEO_CORPUS.find((x) => x.id === id)!;
      expect(c.artifact.laundering.indicators.map((i) => i.code), id).not.toContain("display_resolution_geometry");
      expect(c.artifact.laundering.laundered, id).toBe(false);
    }
  });
});

describe("discrimination and the gate", () => {
  it("every declared positive is scored above the base rate", () => {
    for (const c of VIDEO_POSITIVES) {
      const report = score(c.artifact, c.id);
      expect(report.status, `${c.id}: ${report.abstention.map((a) => a.code).join(", ")}`).toBe("assessed");
      expect(report.score ?? 0, c.id).toBeGreaterThan(BASE_RATE);
    }
  });

  it("every transcoded member is inconclusive with the artifact_re_encoded code", () => {
    for (const c of VIDEO_LAUNDERED) {
      const report = score(c.artifact, c.id);
      expect(report.status, c.id).toBe("inconclusive");
      expect(report.score, c.id).toBeNull();
      expect(report.abstention.map((a) => a.code), c.id).toContain("artifact_re_encoded");
      expect(analyzeVideoArtifact(c.artifact, input(c.id)).rulesEvaluated, c.id).toEqual([]);
    }
  });

  it("the rules are alive underneath the gate", () => {
    const bypassed = analyzeVideoArtifact(VIDEO_LAUNDERED[0]!.artifact, input("bypass"), {
      bypassLaunderingGateForTesting: true,
    });
    expect(bypassed.rulesEvaluated.length).toBeGreaterThan(0);
  });

  it("every rule fires on at least one member, counting the desync rule's own case", () => {
    const withDesync = withStreamMeasurement(neutralVideo(), 520, "the caller's alignment measurer");
    const fired = new Set(
      [...VIDEO_CORPUS.map((c) => c.artifact), withDesync].flatMap((a) =>
        analyzeVideoArtifact(a, input("sweep")).findings.map((f) => f.ruleId),
      ),
    );
    const dead = VIDEO_RULES.filter((r) => !fired.has(r.id)).map((r) => r.id);
    expect(dead, `these rules fire on nothing in the whole corpus: ${dead.join(", ")}`).toEqual([]);
  });

  it("the probabilistic rule cannot turn a silent file into a finding", () => {
    // The fence, measured rather than argued. A file that declares nothing, plus a large
    // measured drift, must still land in the lowest band.
    const silent = VIDEO_CORPUS.find((c) => c.id === "no-declaration")!.artifact;
    const drifting = withStreamMeasurement(silent, 900, "the caller's alignment measurer");
    const report = score(drifting, "silent-plus-drift");
    expect(report.band).toBe("few-signals");
    expect(report.score ?? 0).toBeLessThan(BASE_RATE + 15);
  });
});

describe("abstention accounting", () => {
  const summary = summariseAbstention(reports);

  it("abstains on a substantial share, with coded reasons throughout", () => {
    expect(summary.rate).toBeGreaterThan(0);
    for (const report of reports) {
      for (const reason of report.abstention) {
        expect(MEDIA_ABSTENTION_CODES, reason.code).toContain(reason.code);
        expect(mediaClaimViolations(reason.detail), reason.detail).toEqual([]);
      }
      expect(mediaClaimViolations(report.verdict), report.verdict).toEqual([]);
    }
  });

  it("a file declaring nothing abstains rather than scoring low", () => {
    const report = score(VIDEO_SILENT[0]!.artifact, VIDEO_SILENT[0]!.id);
    expect(report.status).toBe("inconclusive");
    expect(report.abstention.map((a) => a.code)).toContain("no_declared_provenance");
  });

  it("an ambiguous declaration is carried as ambiguous, not resolved", () => {
    for (const c of VIDEO_AMBIGUOUS) {
      const report = score(c.artifact, c.id);
      if (report.status === "assessed") expect(report.score ?? 0, c.id).toBeLessThan(60);
    }
  });

  it("the corpus has members of every kind, so no assertion above is vacuous", () => {
    expect(VIDEO_NEGATIVES.length).toBeGreaterThanOrEqual(5);
    expect(VIDEO_POSITIVES.length).toBeGreaterThanOrEqual(5);
    expect(VIDEO_LAUNDERED.length).toBeGreaterThanOrEqual(3);
    expect(VIDEO_SILENT.length + VIDEO_AMBIGUOUS.length).toBeGreaterThanOrEqual(2);
  });

  it("every member states how its label is known and disclaims being a rate", () => {
    for (const c of VIDEO_CORPUS) {
      expect(c.provenance.length, c.id).toBeGreaterThan(120);
      expect(c.provenance, c.id).toMatch(/is a false-positive rate/);
    }
  });
});
