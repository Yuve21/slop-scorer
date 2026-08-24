import { describe, expect, it } from "vitest";
import {
  analyzeAudioArtifact,
  AUDIO_AMBIGUOUS,
  AUDIO_CONFIG,
  AUDIO_CORPUS,
  AUDIO_LAUNDERED,
  AUDIO_NEGATIVES,
  AUDIO_POSITIVES,
  AUDIO_RULES,
  ingestAudio,
  neutralAudio,
} from "@slop/detectors-audio";
import type { AudioArtifact } from "@slop/detectors-audio";
import { assertNegativeCorpus, buildReport, checkNegativeCorpus, formatCalibration, runCalibration } from "@slop/core";
import type { Report } from "@slop/core";
import { mediaClaimViolations, synthMp3 } from "@slop/provenance";
import { formatAbstention, MEDIA_ABSTENTION_CODES, summariseAbstention } from "../../provenance/test/abstention.js";

const input = (id: string) => ({ kind: "file", path: `calibration://${id}`, mediaType: "audio/wav" }) as const;
const score = (artifact: AudioArtifact, id: string): Report =>
  buildReport([analyzeAudioArtifact(artifact, input(id))], { config: AUDIO_CONFIG });

const calibration = runCalibration(AUDIO_CONFIG.corpusVersion, AUDIO_CORPUS, score);
const reports = AUDIO_CORPUS.map((c) => score(c.artifact, c.id));
const BASE_RATE = buildReport([analyzeAudioArtifact(neutralAudio(), input("base-rate"), { rules: [] })], {
  config: AUDIO_CONFIG,
}).receipt.priorPoints;

describe("calibration against the structural audio corpus", () => {
  it("prints the distribution and the abstention accounting", () => {
    // eslint-disable-next-line no-console -- the tables are the point of the run
    console.log(`\n${formatCalibration(calibration)}\n${formatAbstention("audio", summariseAbstention(reports))}\n`);
    expect(calibration.rows).toHaveLength(AUDIO_CORPUS.length);
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

  it("a workstation named in the writer field is not treated as a tell", () => {
    const report = score(AUDIO_NEGATIVES.find((c) => c.id === "daw-export")!.artifact, "daw-export");
    expect(report.score ?? 0).toBeLessThanOrEqual(BASE_RATE);
    expect(report.receipt.lines.filter((l) => l.polarity === "signal")).toEqual([]);
  });
});

describe("discrimination and the gate", () => {
  it("every declared positive is scored above the base rate", () => {
    for (const c of AUDIO_POSITIVES) {
      const report = score(c.artifact, c.id);
      expect(report.status, `${c.id}: ${report.abstention.map((a) => a.code).join(", ")}`).toBe("assessed");
      expect(report.score ?? 0, c.id).toBeGreaterThan(BASE_RATE);
    }
  });

  it("a file that named two encoders is inconclusive with the artifact_re_encoded code", () => {
    for (const c of AUDIO_LAUNDERED) {
      const report = score(c.artifact, c.id);
      expect(report.status, c.id).toBe("inconclusive");
      expect(report.score, c.id).toBeNull();
      expect(report.abstention.map((a) => a.code), c.id).toContain("artifact_re_encoded");
      expect(analyzeAudioArtifact(c.artifact, input(c.id)).rulesEvaluated, c.id).toEqual([]);
    }
  });

  it("the gate suppressed a declaration this file actually carries, and we can prove it", () => {
    // The double-encoded MP3's ID3 tag names a synthesis service. We decline to report it
    // because the bytes were rewritten, and this proves the decline is a decision rather than
    // a rule that stopped working.
    const bypassed = analyzeAudioArtifact(AUDIO_LAUNDERED[0]!.artifact, input("bypass"), {
      bypassLaunderingGateForTesting: true,
    });
    expect(bypassed.findings.map((f) => f.ruleId)).toContain("prov.encoder-declares-generative-tool");
  });

  it("a plain lossy file is readable rather than gated", () => {
    // An MP3 is lossy, but lossy is not the same as re-encoded, and its tags survive intact.
    // Gating every MP3 would abstain on most of the audio anyone will ever submit.
    const plain = ingestAudio(synthMp3({ id3: { TIT2: "a take" }, lame: "LAME3.100" }), {
      locator: "calibration://plain-lossy.mp3",
      mediaType: "audio/mpeg",
    });
    expect(plain.laundering.laundered).toBe(false);
  });

  it("every rule fires on at least one member", () => {
    const fired = new Set(
      AUDIO_CORPUS.flatMap((c) => analyzeAudioArtifact(c.artifact, input(c.id)).findings.map((f) => f.ruleId)),
    );
    const dead = AUDIO_RULES.filter((r) => !fired.has(r.id)).map((r) => r.id);
    expect(dead, `these rules fire on nothing in the whole corpus: ${dead.join(", ")}`).toEqual([]);
  });
});

describe("abstention accounting", () => {
  const summary = summariseAbstention(reports);

  it("abstains with coded reasons throughout", () => {
    expect(summary.rate).toBeGreaterThan(0);
    for (const report of reports) {
      for (const reason of report.abstention) {
        expect(MEDIA_ABSTENTION_CODES, reason.code).toContain(reason.code);
        expect(mediaClaimViolations(reason.detail), reason.detail).toEqual([]);
      }
      expect(mediaClaimViolations(report.verdict), report.verdict).toEqual([]);
    }
  });

  it("an untagged recording abstains rather than scoring low", () => {
    const report = score(AUDIO_NEGATIVES[0]!.artifact, AUDIO_NEGATIVES[0]!.id);
    expect(report.status).toBe("inconclusive");
    expect(report.abstention.map((a) => a.code)).toContain("no_declared_provenance");
  });

  it("an ambiguous declaration is carried as ambiguous, not resolved", () => {
    for (const c of AUDIO_AMBIGUOUS) {
      const report = score(c.artifact, c.id);
      if (report.status === "assessed") expect(report.score ?? 0, c.id).toBeLessThan(60);
    }
  });

  it("every member states how its label is known and disclaims being a rate", () => {
    for (const c of AUDIO_CORPUS) {
      expect(c.provenance.length, c.id).toBeGreaterThan(120);
      expect(c.provenance, c.id).toMatch(/is a false-positive rate/);
    }
  });
});
