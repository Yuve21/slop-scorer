import { describe, expect, it } from "vitest";
import {
  analyzeArtifact,
  neutralArtifact,
  PROBE_WEIGHTS,
  RULE_DESCRIPTORS,
  WEB_RULES,
  webDetector,
} from "@slop/detectors-web";
import type { ProbeId, WebArtifact, WebRule } from "@slop/detectors-web";
import type { DetectorResult } from "@slop/core";
import { assertWellFormedResult, buildReport } from "@slop/core";
import {
  expectDescriptorsAreComplete,
  expectNeutralSilence,
  expectProbeRegistryIsHonest,
  expectRuleIsAlive,
  expectStaleProbeFailsLoudly,
  zeroed,
} from "../../core/test/meta.js";
import type { CorpusUnderTest } from "../../core/test/meta.js";

const input = { kind: "url", url: "https://example.test/" } as const;

const corpus: CorpusUnderTest<WebArtifact, ProbeId> = {
  name: "web corpus",
  rules: WEB_RULES,
  neutral: () => neutralArtifact(),
  probeIds: Object.keys(PROBE_WEIGHTS) as ProbeId[],
  analyze: (artifact, rules): DetectorResult =>
    analyzeArtifact(artifact, input, { ...(rules ? { rules: rules as readonly WebRule[] } : {}) }),
  zeroProbe: (artifact, probe) => ({ ...artifact, probes: zeroed(artifact.probes, probe) }),
};

describe("the web corpus is honest about itself", () => {
  it("the neutral artifact fires nothing at all", () => expectNeutralSilence(corpus));
  it("every declared probe is read by at least one rule", () => expectProbeRegistryIsHonest(corpus));
  it("every rule ships an explanation, a rebuttal and a version", () => expectDescriptorsAreComplete(corpus));

  it("the published descriptors match the live rules exactly", () => {
    // A list restated in a second place goes stale in exactly one of them. `list_rules` is
    // that second place, so it is checked against the source of truth rather than trusted.
    expect(RULE_DESCRIPTORS.map((r) => r.id).sort()).toEqual(WEB_RULES.map((r) => r.id).sort());
    expect(webDetector.rules.length).toBe(WEB_RULES.length);
  });

  it("the corpus is not trivially small", () => {
    expect(WEB_RULES.length).toBeGreaterThanOrEqual(20);
    expect(WEB_RULES.filter((r) => r.polarity === "counter").length).toBeGreaterThanOrEqual(4);
  });
});

describe.each(WEB_RULES.map((r) => [r.id, r] as const))("%s", (_id, rule) => {
  it("fires on its positive fixture, dies on its mutation, and cites something followable", () =>
    expectRuleIsAlive(corpus, rule));
  it("disappears loudly when the probe it depends on collects nothing", () =>
    expectStaleProbeFailsLoudly(corpus, rule));
});

describe("the analyze path", () => {
  it("produces a well-formed result on a real-shaped artifact", () => {
    const artifact = neutralArtifact({
      head: { ...neutralArtifact().head, generator: "Lovable", title: "Create Next App" },
    });
    const result = analyzeArtifact(artifact, input);
    expect(() => assertWellFormedResult(result)).not.toThrow();
    expect(result.evidenceKind).toBe("deterministic");
    expect(result.findings.every((f) => f.evidence.length > 0)).toBe(true);
  });

  it("a static (fetch-only) read cannot produce a score", () => {
    const artifact = neutralArtifact({
      tier: "static",
      probes: neutralArtifact().probes.map((p) =>
        ["render", "computed-style", "font-faces", "dom-survey"].includes(p.id)
          ? { ...p, ran: false, denominator: 0 }
          : p,
      ),
    });
    const report = buildReport([analyzeArtifact(artifact, input)]);
    expect(report.status).toBe("inconclusive");
    expect(report.score).toBeNull();
    expect(report.warnings.join(" ")).toContain("Read without a browser");
  });
});
