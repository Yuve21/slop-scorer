import { describe, expect, it } from "vitest";
import { assertWellFormedResult, buildReport, makeFinding } from "@slop/core";
import type { DetectorResult, Evidence, RuleDescriptor } from "@slop/core";

/**
 * A weaker claim inside a stronger detector.
 *
 * `DetectorResult.evidenceKind` describes a whole modality, and that was enough while every
 * rule in a modality read the same kind of fact. It stopped being enough when the deterministic
 * web corpus grew rules that read text back out of a picture. A computed style and an OCR guess
 * are not the same claim, and a per-result label would have laundered the second under the
 * first: the receipt would have printed "everything here is re-readable in DevTools" over a
 * line that was a decode of some pixels.
 *
 * So a finding may declare its own kind, and the two places that matters are asserted here:
 * the patch gate (a guess may not ship an applicable edit, even surrounded by facts) and the
 * report's `evidenceKinds`, which is what a surface counts to say how much of a reading was
 * inferred.
 */

const evidence: readonly Evidence[] = [{ kind: "text", locator: "text inside /hero.svg", observed: "Your headline here" }];

const rule = (over: Partial<RuleDescriptor> = {}): RuleDescriptor => ({
  id: "imgtext.example",
  family: "image-text",
  title: "A placeholder string, inside an image",
  polarity: "signal",
  baseWeight: 0.6,
  severity: "medium",
  explanation: "x".repeat(50),
  falsePositiveNote: "y".repeat(50),
  since: "corpus-2026.10",
  ...over,
});

const resultWith = (finding: ReturnType<typeof makeFinding>): DetectorResult => ({
  detectorId: "web.render-rules",
  modality: "web",
  evidenceKind: "deterministic",
  corpusVersion: "corpus-2026.10",
  input: { kind: "url", url: "https://example.test/" },
  startedAt: new Date(0).toISOString(),
  finishedAt: new Date(0).toISOString(),
  findings: [finding],
  coverage: { ratio: 1, probes: [{ id: "image-text", ran: true, denominator: 3 }], examined: "one image" },
  rulesEvaluated: [finding.ruleId],
});

describe("a finding may declare a weaker evidence kind than its detector", () => {
  it("carries the kind through makeFinding, and omits it when the rule does not declare one", () => {
    expect(makeFinding(rule({ evidenceKind: "probabilistic" }), evidence).evidenceKind).toBe("probabilistic");
    expect(makeFinding(rule(), evidence).evidenceKind).toBeUndefined();
  });

  it("refuses an applicable patch on the probabilistic line, inside a deterministic result", () => {
    const finding = makeFinding(rule({ evidenceKind: "probabilistic" }), evidence, {
      remediation: [
        {
          kind: "ui_change",
          selector: "img[src='/hero.svg']",
          property: "alt",
          before: "Your headline here",
          after: "The real headline",
          sourceHint: "the component rendering this image",
          summary: "Rewrite the text inside the asset.",
          doNotApplyIf: "the placeholder is the subject of the image itself.",
          blastRadius: "file",
          addresses: ["text inside /hero.svg"],
          rebuttal: "OCR is probabilistic and this read may simply be wrong about the pixels.",
        },
      ],
    });
    expect(() => assertWellFormedResult(resultWith(finding))).toThrow(/probabilistic read/);
  });

  it("allows the same patch when the finding makes the detector's own deterministic claim", () => {
    const finding = makeFinding(rule(), evidence, {
      remediation: [
        {
          kind: "ui_change",
          selector: "img[src='/hero.svg']",
          property: "alt",
          before: "Your headline here",
          after: "The real headline",
          sourceHint: "the component rendering this image",
          summary: "Rewrite the text inside the asset.",
          doNotApplyIf: "the placeholder is the subject of the image itself.",
          blastRadius: "file",
          addresses: ["text inside /hero.svg"],
          rebuttal: "A placeholder can legitimately be the subject of a documentation image.",
        },
      ],
    });
    expect(() => assertWellFormedResult(resultWith(finding))).not.toThrow();
  });

  it("the report says a probabilistic line is in the reading, even on a deterministic detector", () => {
    const report = buildReport([resultWith(makeFinding(rule({ evidenceKind: "probabilistic" }), evidence))]);
    expect(report.evidenceKinds).toContain("deterministic");
    expect(report.evidenceKinds).toContain("probabilistic");

    const plain = buildReport([resultWith(makeFinding(rule(), evidence))]);
    expect(plain.evidenceKinds).toEqual(["deterministic"]);
  });
});
