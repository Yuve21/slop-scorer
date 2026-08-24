import { describe, expect, it } from "vitest";
import {
  buildReport,
  DEFAULT_CONFIG,
  FORBIDDEN_VERDICT_PHRASES,
  makeFinding,
  MAX_SCORE,
  notAssessed,
  assertWellFormedResult,
  MalformedResultError,
  VacuousProbeError,
  formatReceipt,
} from "@slop/core";
import type { DetectorResult, Evidence, Finding, ProbeStatus, RuleDescriptor } from "@slop/core";

const evidence = (locator: string): Evidence => ({ kind: "selector", locator, observed: "observed value" });

const rule = (over: Partial<RuleDescriptor> & { id: string }): RuleDescriptor & { maxHits?: number } => ({
  family: "builder-fingerprint",
  title: `title for ${over.id}`,
  polarity: "signal",
  baseWeight: 1,
  severity: "medium",
  explanation: "explanation",
  falsePositiveNote: "caveat",
  since: "corpus-2026.09",
  ...over,
});

const probes = (over: Partial<ProbeStatus>[] = []): ProbeStatus[] => [
  { id: "a", ran: true, denominator: 10, weight: 1 },
  ...(over as ProbeStatus[]),
];

function resultOf(findings: Finding[], over: Partial<DetectorResult> = {}): DetectorResult {
  return {
    detectorId: "test.detector",
    modality: "web",
    evidenceKind: "deterministic",
    corpusVersion: "corpus-2026.09",
    input: { kind: "url", url: "https://example.test/" },
    startedAt: "2026-08-23T00:00:00.000Z",
    finishedAt: "2026-08-23T00:00:01.000Z",
    findings,
    coverage: { ratio: 1, probes: probes(), examined: "everything" },
    rulesEvaluated: findings.map((f) => f.ruleId),
    ...over,
  };
}

describe("the receipt reconciles", () => {
  it("prior plus every printed contribution equals the printed score, exactly, in integers", () => {
    const findings = [
      makeFinding(rule({ id: "a.one", baseWeight: 1.8 }), [evidence("#a"), evidence("#b")]),
      makeFinding(rule({ id: "b.two", family: "visual-default", baseWeight: 0.6 }), [evidence(".hero")]),
      makeFinding(rule({ id: "c.three", family: "craft-floor", baseWeight: 0.3 }), [evidence("head > title")]),
      makeFinding(rule({ id: "d.counter", family: "counter-evidence", polarity: "counter", baseWeight: -0.8 }), [
        evidence("@font-face"),
      ]),
    ];
    const report = buildReport([resultOf(findings)]);
    const sum = report.receipt.lines.reduce((a, l) => a + l.points, 0);
    expect(report.receipt.priorPoints + sum).toBe(report.receipt.computedScore);
    expect(report.score).toBe(report.receipt.computedScore);
    // The rendered receipt must show the same arithmetic a reader would redo by hand.
    expect(formatReceipt(report)).toContain(`TOTAL (base ${report.receipt.priorPoints}`);
  });

  it("never reaches certainty, no matter how much evidence piles up", () => {
    const findings = Array.from({ length: 12 }, (_, i) =>
      makeFinding(rule({ id: `r.${i}`, family: `fam-${i}`, baseWeight: 6 }), [evidence(`#n${i}`)]),
    );
    const report = buildReport([resultOf(findings)]);
    expect(report.score).toBeLessThanOrEqual(MAX_SCORE);
    expect(report.score).not.toBe(100);
  });
});

describe("family caps", () => {
  it("one family cannot carry the score: eight tells in one family are capped at its share", () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      makeFinding(rule({ id: `visual.${i}`, family: "visual-default", baseWeight: 1.2 }), [evidence(`#v${i}`)]),
    );
    const report = buildReport([resultOf(many)]);
    const family = report.receipt.families.find((f) => f.id === "visual-default");
    expect(family?.atCap).toBe(true);
    expect(Math.abs(family?.cappedLogit ?? 0)).toBeCloseTo(0.25 * DEFAULT_CONFIG.logitBudget, 6);
    // At-cap findings are still PRINTED, with zero points, because "we saw this and it did
    // not move the number" is information the reader is entitled to.
    expect(report.receipt.lines.some((l) => l.cappedOut)).toBe(true);
  });

  it("counter-evidence subtracts", () => {
    const signals = [makeFinding(rule({ id: "s.one", baseWeight: 1.8 }), [evidence("#a")])];
    const withCounter = [
      ...signals,
      makeFinding(rule({ id: "c.one", family: "counter-evidence", polarity: "counter", baseWeight: -0.9 }), [
        evidence("@font-face src"),
      ]),
    ];
    const a = buildReport([resultOf(signals)]);
    const b = buildReport([resultOf(withCounter)]);
    expect(b.receipt.computedScore).toBeLessThan(a.receipt.computedScore);
    expect(b.counterEvidence).toHaveLength(1);
  });
});

describe("abstention is a status, not a low score", () => {
  it("low coverage withholds the score with a coded reason", () => {
    const report = buildReport([
      resultOf([], { coverage: { ratio: 0.2, probes: probes(), examined: "a fetch, nothing else" } }),
    ]);
    expect(report.status).toBe("inconclusive");
    expect(report.score).toBeNull();
    expect(report.band).toBeNull();
    expect(report.abstention.map((a) => a.code)).toContain("coverage_below_floor");
  });

  it("a full read with nothing firing is a real result, not an abstention", () => {
    const report = buildReport([resultOf([])]);
    expect(report.status).toBe("assessed");
    expect(report.band).toBe("few-signals");
    expect(report.score).toBe(report.receipt.priorPoints);
  });

  it("a high score built on one family is withheld", () => {
    const oneFamily = Array.from({ length: 4 }, (_, i) =>
      makeFinding(rule({ id: `builder.${i}`, baseWeight: 1.8 }), [evidence(`#b${i}`)]),
    );
    const report = buildReport([resultOf(oneFamily)]);
    expect(report.receipt.computedScore).toBeGreaterThanOrEqual(DEFAULT_CONFIG.minFamiliesAppliesAtOrAbove);
    expect(report.status).toBe("inconclusive");
    expect(report.abstention.map((a) => a.code)).toContain("single_family_only");
  });

  it("not_assessed and inconclusive are different statuses and neither is a score", () => {
    const never = notAssessed("opted_out", "the owner of this artifact has opted out of assessment.");
    expect(never.status).toBe("not_assessed");
    expect(never.score).toBeNull();
    expect(buildReport([]).status).toBe("not_assessed");
    // The two silences must not collapse into one another.
    const thin = buildReport([resultOf([], { coverage: { ratio: 0.1, probes: probes(), examined: "nothing much" } })]);
    expect(thin.status).toBe("inconclusive");
    expect(thin.status).not.toBe(never.status);
  });

  it("the top band cannot be reached on look alone", () => {
    const lookOnly = [
      ...Array.from({ length: 3 }, (_, i) =>
        makeFinding(rule({ id: `visual.${i}`, family: "visual-default", baseWeight: 3 }), [evidence(`#v${i}`)]),
      ),
      ...Array.from({ length: 3 }, (_, i) =>
        makeFinding(rule({ id: `craft.${i}`, family: "craft-floor", baseWeight: 3 }), [evidence(`#c${i}`)]),
      ),
      ...Array.from({ length: 3 }, (_, i) =>
        makeFinding(rule({ id: `struct.${i}`, family: "structural-uniformity", baseWeight: 3 }), [evidence(`#s${i}`)]),
      ),
      ...Array.from({ length: 3 }, (_, i) =>
        makeFinding(rule({ id: `copy.${i}`, family: "copy-tell", baseWeight: 3 }), [evidence(`#p${i}`)]),
      ),
    ];
    const report = buildReport([resultOf(lookOnly)]);
    if (report.receipt.computedScore >= DEFAULT_CONFIG.topBandFloor) {
      expect(report.band).not.toBe("heavy-template-signature");
      expect(report.bandDemotedFrom).toBe("heavy-template-signature");
    }
    expect(report.band).not.toBe("heavy-template-signature");
  });
});

describe("the verdict describes what we did, never who anyone is", () => {
  const cases = [
    buildReport([
      resultOf([
        makeFinding(rule({ id: "a.one" }), [evidence("#a")]),
        makeFinding(rule({ id: "b.one", family: "visual-default", baseWeight: 0.5 }), [evidence(".hero")]),
      ]),
    ]),
    buildReport([resultOf([], { coverage: { ratio: 0.1, probes: probes(), examined: "nothing" } })]),
    notAssessed("no_detector_for_input", "no detector accepts this input kind."),
  ];

  it.each(cases.map((c, i) => [i, c] as const))("verdict %i contains no forbidden phrasing", (_i, report) => {
    const lower = report.verdict.toLowerCase();
    for (const phrase of FORBIDDEN_VERDICT_PHRASES) {
      expect(lower, `verdict must not contain "${phrase}": ${report.verdict}`).not.toContain(phrase);
    }
  });

  it("an assessed verdict prints the denominator, not just the hits", () => {
    const report = cases[0]!;
    expect(report.verdict).toMatch(/against \d+ deterministic rules/);
    expect(report.verdict).toMatch(/and \d+ matched/);
  });
});

describe("the contract is enforced, loudly", () => {
  it("a finding with no evidence cannot be constructed", () => {
    expect(() => makeFinding(rule({ id: "x.one" }), [])).toThrow(/no evidence/i);
  });

  it("evidence with an empty locator is rejected", () => {
    const bad: Finding = {
      ...makeFinding(rule({ id: "x.one" }), [evidence("#a")]),
      evidence: [{ kind: "selector", locator: "", observed: "something" }],
    };
    expect(() => assertWellFormedResult(resultOf([bad]))).toThrow(MalformedResultError);
  });

  it("a rule that fired but is missing from rulesEvaluated is rejected", () => {
    const f = makeFinding(rule({ id: "x.one" }), [evidence("#a")]);
    expect(() => assertWellFormedResult(resultOf([f], { rulesEvaluated: [] }))).toThrow(/rulesEvaluated/);
  });

  it("a probe that ran and collected nothing throws instead of scoring low", () => {
    const dead: ProbeStatus = { id: "chunks", ran: true, denominator: 0, expectsNonEmpty: true, weight: 2 };
    expect(() =>
      assertWellFormedResult(resultOf([], { coverage: { ratio: 0.9, probes: [dead], examined: "chunks(0)" } })),
    ).toThrow(VacuousProbeError);
  });

  it("a counter with a positive weight is rejected", () => {
    const f = makeFinding(rule({ id: "c.one", family: "counter-evidence", polarity: "counter" }), [evidence("#a")]);
    const bad: Finding = { ...f, weight: 0.5 };
    expect(() => assertWellFormedResult(resultOf([bad]))).toThrow(/counter-evidence must lower/);
  });
});
