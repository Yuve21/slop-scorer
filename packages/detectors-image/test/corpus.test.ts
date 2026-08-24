import { describe, expect, it } from "vitest";
import {
  analyzeImageArtifact,
  IMAGE_CONFIG,
  IMAGE_PROBE_WEIGHTS,
  IMAGE_RULE_DESCRIPTORS,
  IMAGE_RULES,
  imageDetector,
  neutralImage,
} from "@slop/detectors-image";
import type { ImageArtifact, ImageProbeId, ImageRule } from "@slop/detectors-image";
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

const input = { kind: "file", path: "/tmp/x.jpg", mediaType: "image/jpeg" } as const;

const corpus: CorpusUnderTest<ImageArtifact, ImageProbeId> = {
  name: "image corpus",
  rules: IMAGE_RULES,
  neutral: () => neutralImage(),
  probeIds: Object.keys(IMAGE_PROBE_WEIGHTS) as ImageProbeId[],
  analyze: (artifact, rules): DetectorResult =>
    analyzeImageArtifact(artifact, input, { ...(rules ? { rules: rules as readonly ImageRule[] } : {}) }),
  zeroProbe: (artifact, probe) => ({ ...artifact, probes: zeroed(artifact.probes, probe) }),
};

describe("the image corpus is honest about itself", () => {
  it("the neutral camera original fires nothing at all", () => expectNeutralSilence(corpus));
  it("every declared probe is read by at least one rule", () => expectProbeRegistryIsHonest(corpus));
  it("every rule ships an explanation, a rebuttal and a version", () => expectDescriptorsAreComplete(corpus));

  it("the published descriptors match the live rules exactly", () => {
    expect(IMAGE_RULE_DESCRIPTORS.map((r) => r.id).sort()).toEqual(IMAGE_RULES.map((r) => r.id).sort());
    expect(imageDetector.rules.length).toBe(IMAGE_RULES.length);
  });

  it("every family a rule declares is registered in the scoring config", () => {
    const registered = new Set(IMAGE_CONFIG.families.map((f) => f.id));
    for (const rule of IMAGE_RULES) {
      expect(registered.has(rule.family), `${rule.id} declares unregistered family "${rule.family}"`).toBe(true);
    }
  });

  it("declares provenance evidence, never deterministic", () => {
    // The single most load-bearing line in this package's contract. "Deterministic" means a
    // reader can go and re-read the fact in a browser or an editor. A metadata field is a
    // DECLARATION somebody made, and the difference is the whole legal posture.
    expect(imageDetector.evidenceKind).toBe("provenance");
    const result = analyzeImageArtifact(neutralImage(), input);
    expect(result.evidenceKind).not.toBe("deterministic");
    expect(result.evidenceKind).toBe("provenance");
  });

  it("contains no rule that reads content rather than a declaration", () => {
    // A structural guard, not a naming convention. Every rule's detect body is stringified and
    // checked for the vocabulary of a pixel read. This is the rule that stops somebody
    // helpfully adding "just a small frequency check" in six months.
    const banned = /\b(pixel|dct|fft|frequency|noise|residual|histogram|entropy|embedding|classif|inference|logits|softmax)\b/i;
    for (const rule of IMAGE_RULES) {
      const body = rule.detect.toString();
      expect(banned.test(body), `${rule.id}'s detect body mentions a content-analysis concept: ${body.slice(0, 200)}`).toBe(
        false,
      );
    }
  });

  it("every sentence any rule can emit passes the media claim guard", () => {
    for (const rule of IMAGE_RULES) {
      for (const text of [rule.title, rule.explanation, rule.falsePositiveNote, rule.prevention ?? ""]) {
        expect(mediaClaimViolations(text), `${rule.id}: ${text}`).toEqual([]);
      }
    }
  });
});

describe.each(IMAGE_RULES.map((r) => [r.id, r] as const))("%s", (_id, rule) => {
  it("fires on its positive fixture, dies on its mutation, and cites something followable", () =>
    expectRuleIsAlive(corpus, rule));
  it("disappears loudly when the probe it depends on collects nothing", () =>
    expectStaleProbeFailsLoudly(corpus, rule));
});

describe("an image whose metadata declares a trained-algorithmic source", () => {
  const declared = IMAGE_RULES.find((r) => r.id === "prov.iptc-digital-source-type")!.fixtures.positive(neutralImage())
    .artifact;
  const report = buildReport([analyzeImageArtifact(declared, input)], { config: IMAGE_CONFIG });

  it("is assessed rather than abstained on, and the receipt reconciles", () => {
    expect(report.status).toBe("assessed");
    const sum = report.receipt.lines.reduce((a, l) => a + l.points, 0);
    expect(report.receipt.priorPoints + sum).toBe(report.receipt.computedScore);
  });

  it("names a byte offset on every citation", () => {
    for (const line of report.receipt.lines) {
      for (const e of line.evidence) {
        expect(e.locator, line.ruleId).toBeTruthy();
        expect(e.observed, line.ruleId).toBeTruthy();
      }
    }
  });

  it("is a well-formed detector result", () => {
    expect(() => assertWellFormedResult(analyzeImageArtifact(declared, input))).not.toThrow();
  });

  it("never reaches certainty", () => {
    expect(report.score ?? 0).toBeLessThanOrEqual(99);
  });
});
