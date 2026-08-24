import { describe, expect, it } from "vitest";
import {
  analyzeVideoArtifact,
  neutralVideo,
  PROBABILISTIC_NOTE_PREFIX,
  PROBABILISTIC_TITLE_PREFIX,
  reportForPlatformUrl,
  VIDEO_CONFIG,
  VIDEO_PROBE_WEIGHTS,
  VIDEO_RULE_DESCRIPTORS,
  VIDEO_RULES,
  videoDetector,
  withStreamMeasurement,
} from "@slop/detectors-video";
import type { VideoArtifact, VideoProbeId, VideoRule } from "@slop/detectors-video";
import type { DetectorResult } from "@slop/core";
import { assertWellFormedResult, buildReport } from "@slop/core";
import { mediaClaimViolations } from "@slop/provenance";
import {
  expectDescriptorsAreComplete,
  expectNeutralSilence,
  expectProbeRegistryIsHonest,
  expectRuleIsAlive,
  expectStaleProbeFailsLoudly,
  zeroed,
} from "../../core/test/meta.js";
import type { CorpusUnderTest } from "../../core/test/meta.js";

const input = { kind: "file", path: "/tmp/x.mp4", mediaType: "video/mp4" } as const;

const corpus: CorpusUnderTest<VideoArtifact, VideoProbeId> = {
  name: "video corpus",
  rules: VIDEO_RULES,
  neutral: () => neutralVideo(),
  probeIds: Object.keys(VIDEO_PROBE_WEIGHTS) as VideoProbeId[],
  analyze: (artifact, rules): DetectorResult =>
    analyzeVideoArtifact(artifact, input, { ...(rules ? { rules: rules as readonly VideoRule[] } : {}) }),
  zeroProbe: (artifact, probe) => ({ ...artifact, probes: zeroed(artifact.probes, probe) }),
};

describe("the video corpus is honest about itself", () => {
  it("the neutral phone recording fires nothing at all", () => expectNeutralSilence(corpus));
  it("every declared probe is read by at least one rule", () => expectProbeRegistryIsHonest(corpus));
  it("every rule ships an explanation, a rebuttal and a version", () => expectDescriptorsAreComplete(corpus));

  it("the published descriptors match the live rules exactly", () => {
    expect(VIDEO_RULE_DESCRIPTORS.map((r) => r.id).sort()).toEqual(VIDEO_RULES.map((r) => r.id).sort());
    expect(videoDetector.rules.length).toBe(VIDEO_RULES.length);
  });

  it("does not carry the EXIF-only rule that no ISO base media file can satisfy", () => {
    // The `inapplicable` map, checked from the outside. A rule that can never fire anywhere is
    // indistinguishable from one that has gone stale, so it is excluded rather than carried.
    expect(VIDEO_RULES.map((r) => r.id)).not.toContain("prov.camera-capture-metadata");
  });

  it("every sentence any rule can emit passes the media claim guard", () => {
    for (const rule of VIDEO_RULES) {
      for (const text of [rule.title, rule.explanation, rule.falsePositiveNote, rule.prevention ?? ""]) {
        expect(mediaClaimViolations(text), `${rule.id}: ${text}`).toEqual([]);
      }
    }
  });
});

describe.each(VIDEO_RULES.map((r) => [r.id, r] as const))("%s", (_id, rule) => {
  it("fires on its positive fixture, dies on its mutation, and cites something followable", () =>
    expectRuleIsAlive(corpus, rule));
  it("disappears loudly when the probe it depends on collects nothing", () =>
    expectStaleProbeFailsLoudly(corpus, rule));
});

describe("the one probabilistic rule is fenced in", () => {
  const probabilistic = VIDEO_RULES.filter((r) => r.family === "stream-consistency");

  it("there is exactly one, and it announces itself in its own title", () => {
    expect(probabilistic).toHaveLength(1);
    for (const rule of probabilistic) {
      expect(rule.title.startsWith(PROBABILISTIC_TITLE_PREFIX), rule.title).toBe(true);
      expect(rule.falsePositiveNote.startsWith(PROBABILISTIC_NOTE_PREFIX), rule.falsePositiveNote).toBe(true);
    }
  });

  it("no other rule in the corpus is probabilistic", () => {
    // The structural half of the same guard: any rule outside the fenced family whose title
    // claims to be probabilistic, or which is probabilistic without saying so, fails here.
    for (const rule of VIDEO_RULES.filter((r) => r.family !== "stream-consistency")) {
      expect(rule.title.startsWith(PROBABILISTIC_TITLE_PREFIX), rule.id).toBe(false);
    }
  });

  it("its weight is the smallest positive weight in the corpus", () => {
    const positives = VIDEO_RULES.filter((r) => r.polarity === "signal").map((r) => r.baseWeight);
    expect(Math.min(...positives)).toBe(probabilistic[0]!.baseWeight);
  });

  it("a result containing it is downgraded from provenance to probabilistic", () => {
    const clean = analyzeVideoArtifact(neutralVideo(), input);
    expect(clean.evidenceKind).toBe("provenance");
    const measured = analyzeVideoArtifact(
      withStreamMeasurement(neutralVideo(), 620, "the caller's alignment measurer"),
      input,
    );
    expect(measured.findings.map((f) => f.ruleId)).toContain("vid.audio-video-desync");
    expect(measured.evidenceKind).toBe("probabilistic");
  });

  it("cannot on its own lift an artifact out of the lowest band", () => {
    const measured = analyzeVideoArtifact(
      withStreamMeasurement(neutralVideo(), 620, "the caller's alignment measurer"),
      input,
    );
    const report = buildReport([measured], { config: VIDEO_CONFIG });
    expect(report.band).toBe("few-signals");
    expect(() => assertWellFormedResult(measured)).not.toThrow();
  });

  it("will not fire on a measurement with nobody named as its source", () => {
    const anonymous = neutralVideo();
    const rigged: VideoArtifact = {
      ...anonymous,
      streams: { ...anonymous.streams, audioVideoOffsetMs: 900, measuredBy: null },
    };
    expect(analyzeVideoArtifact(rigged, input).findings.map((f) => f.ruleId)).not.toContain(
      "vid.audio-video-desync",
    );
  });
});

describe("platform URLs get a typed refusal, not a download", () => {
  const platforms = [
    "https://www.tiktok.com/@someone/video/7300000000000000000",
    "https://www.instagram.com/reel/Cabcdefghij/",
    "https://www.youtube.com/shorts/abcdefghijk",
    "https://x.com/someone/status/1700000000000000000",
  ];

  it.each(platforms)("%s is not_assessed with the cannot_fetch code", (url) => {
    const report = reportForPlatformUrl(url);
    expect(report.status).toBe("not_assessed");
    expect(report.score).toBeNull();
    expect(report.band).toBeNull();
    expect(report.abstention.map((a) => a.code)).toEqual(["cannot_fetch"]);
  });

  it("the refusal explains the constraint and asks for the file", () => {
    const detail = reportForPlatformUrl(platforms[0]!).abstention[0]!.detail;
    expect(detail).toMatch(/prohibits automated downloading/i);
    expect(detail).toMatch(/hand it to us directly|save the file/i);
  });

  it("says what WE decided, never what the artifact is", () => {
    for (const url of platforms) {
      expect(mediaClaimViolations(reportForPlatformUrl(url).abstention[0]!.detail)).toEqual([]);
    }
  });

  it("a URL we have no objection to still abstains, because this build has no fetcher", () => {
    const report = reportForPlatformUrl("https://example.org/clip.mp4");
    expect(report.status).toBe("not_assessed");
    expect(report.abstention[0]!.code).toBe("cannot_fetch");
  });

  it("the detector does not advertise a URL input at all", () => {
    expect(videoDetector.accepts).not.toContain("media-url");
    expect(videoDetector.canHandle({ kind: "media-url", url: platforms[0]! })).toBe(false);
  });
});
