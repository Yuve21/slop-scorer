/**
 * The corpus training loop's guards.
 *
 * Every test here names the source mutation that should turn it red, in a comment, because a test
 * whose author never watched it fail is a decoration (HOUSE-KNOWLEDGE, the disqualifying class).
 * The mutations were run while writing this file and each one did turn the named case red.
 *
 * The leak tests deliberately build the record BY HAND and push it through the guard, rather than
 * asserting that a well-behaved projection produced a clean record. Asserting that clean input
 * stays clean is the shape of LEARNINGS L-06: the gauntlet redaction suite asserted "contains no
 * email" over 20 artifacts that contained no email to begin with, and deleting the redactor kept it
 * green. So each case here first proves the dangerous value IS present in the input.
 */

import { describe, expect, it } from "vitest";
import {
  assertObservationCarriesNoContent,
  assertWellFormedCandidate,
  bucketScore,
  bucketSize,
  jsonlLine,
  MalformedCandidateError,
  MIN_SUPPORTING_OBSERVATIONS,
  OBSERVATION_SCHEMA_VERSION,
  ObservationLeakError,
  observationFrom,
  observationSink,
  SHAPE_MARKERS,
} from "../src/observation.js";
import type { CandidateRule, CorpusObservation } from "../src/observation.js";
import type { DetectorResult } from "../src/types.js";

const KNOWN = new Set(["css.stock-gradient", "dom.eyebrow-count", "counter.real-photography"]);

const result = (over: Partial<DetectorResult> = {}): DetectorResult =>
  ({
    detectorId: "web",
    corpusVersion: "corpus-2026.09",
    modality: "web",
    evidenceKind: "deterministic",
    findings: [
      {
        ruleId: "css.stock-gradient",
        family: "visual-default",
        title: "t",
        polarity: "signal",
        severity: "low",
        baseWeight: 0.5,
        explanation: "e",
        falsePositiveNote: "f",
        evidence: [{ kind: "css", locator: "body", observed: "linear-gradient(...)" }],
      },
    ],
    rulesEvaluated: ["css.stock-gradient", "dom.eyebrow-count", "counter.real-photography"],
    coverage: { ratio: 0.8123, probes: [{ id: "render", ran: true, denominator: 1 }], examined: "the rendered DOM" },
    abstention: [],
    ...over,
  }) as unknown as DetectorResult;

const report = (over: Record<string, unknown> = {}) =>
  ({
    corpusVersion: "corpus-2026.09",
    status: "assessed" as const,
    band: "some-signals" as const,
    score: 43,
    coverage: { ratio: 0.8123, probes: [{ id: "render", denominator: 1 }] },
    abstention: [] as { code: string }[],
    ...over,
  }) as Parameters<typeof observationFrom>[0]["report"];

const shape = { sizeBucket: bucketSize(42), extensions: [{ ext: ".ts", share: 0.6666 }], markers: ["has-typescript"] as const };

const build = (over: Partial<Parameters<typeof observationFrom>[0]> = {}) =>
  observationFrom({
    results: [result()],
    report: report(),
    shape: { ...shape, markers: [...shape.markers] },
    knownRuleIds: KNOWN,
    now: new Date("2026-08-26T17:04:31.123Z"),
    ...over,
  });

describe("the observation record", () => {
  it("records the three rule sets, and the not-fired set is the valuable one", () => {
    const o = build();
    // Denominator first: this assertion is only meaningful because the input HAD rules that did
    // not fire. Without this line the next expect could pass over an empty corpus.
    expect(result().rulesEvaluated.length).toBe(3);
    expect(o.rulesFired).toEqual(["css.stock-gradient"]);
    expect(o.rulesEvaluatedNotFired).toEqual(["counter.real-photography", "dom.eyebrow-count"]);
    // Mutation: drop `rulesEvaluatedNotFired` from `observationFrom`'s projection. Red here.
    // That set is what tells a steward a rule is DEAD (LEARNINGS L-05), which is the whole reason
    // this loop is worth running.
  });

  it("buckets and coarsens everything that could correlate", () => {
    const o = build();
    expect(o.day).toBe("2026-08-26");
    expect(o.day).not.toContain("T"); // never a millisecond timestamp
    expect(o.scoreBucket).toBe("40-59");
    expect(o).not.toHaveProperty("score");
    expect(o.coverageRatio).toBe(0.81);
    expect(o.shape.extensions[0]!.share).toBe(0.7);
    expect(o.schemaVersion).toBe(OBSERVATION_SCHEMA_VERSION);
    // Mutation: return `now.toISOString()` instead of `.slice(0, 10)`. Red on the `day` assertions.
  });

  it("withholds the score bucket when the score itself was withheld", () => {
    const o = build({ report: report({ status: "inconclusive", band: null, score: null, abstention: [{ code: "coverage_below_floor" }] }) });
    expect(o.scoreBucket).toBeNull();
    expect(o.band).toBeNull();
    expect(o.abstentionCodes).toEqual(["coverage_below_floor"]);
    // A withheld score must not reappear in the training data either. Mutation: make scoreBucket
    // fall back to `bucketScore(0)`. Red, and it would have taught the corpus that abstentions
    // are low scores, which is the one thing the output contract refuses to say.
  });

  it("buckets sizes at their boundaries rather than near them", () => {
    expect(bucketSize(10)).toBe("tiny");
    expect(bucketSize(11)).toBe("small");
    expect(bucketSize(1_000)).toBe("medium");
    expect(bucketSize(1_001)).toBe("large");
    expect(bucketSize(10_000_000)).toBe("huge");
    expect(bucketScore(0)).toBe("0-19");
    expect(bucketScore(99)).toBe("80-99");
    expect(bucketScore(80)).toBe("80-99");
    // The clamp guards the OUT-OF-RANGE inputs, not 99. This assertion is here because the first
    // version of this test claimed in a comment that deleting the clamp would turn it red, the
    // mutation was actually run, and it stayed GREEN: `Math.floor(99 / 20) * 20` is 80 either way.
    // A comment naming a mutation nobody ran is the same defect as a test nobody watched fail, so
    // the cases below are the ones that really exercise it. Verified red on
    // `const lo = Math.floor(score / 20) * 20`, which yields "100-119" and "-20--1".
    expect(bucketScore(120)).toBe("80-99");
    expect(bucketScore(-5)).toBe("0-19");
  });
});

describe("the leak guard refuses content rather than sanitising it", () => {
  // Each case builds a record that DOES contain the dangerous value, asserts it is there, and only
  // then asserts the guard throws. Proving the presence before asserting the refusal is the lesson
  // of L-06 and it is why these are not four copies of `expect(fn).toThrow()`.
  const clean = build();

  const withField = (patch: Partial<CorpusObservation>): CorpusObservation => ({ ...clean, ...patch });

  it("refuses a rule id the corpus does not know, because its provenance is unknown", () => {
    const dirty = withField({ rulesFired: ["/home/alice/secret-project/src/app.ts"] });
    expect(dirty.rulesFired[0]).toContain("/home/alice");
    expect(() => assertObservationCarriesNoContent(dirty, KNOWN)).toThrow(ObservationLeakError);
    // Mutation: delete the `checkRuleIds` calls. Red. Without them a caller could put anything at
    // all into rulesFired, which is the widest hole in the record.
  });

  it("refuses a timestamp where a day belongs", () => {
    const dirty = withField({ day: "2026-08-26T17:04:31.123Z" });
    expect(dirty.day).toContain("17:04:31");
    expect(() => assertObservationCarriesNoContent(dirty, KNOWN)).toThrow(/YYYY-MM-DD/);
  });

  it("refuses a marker outside the closed vocabulary", () => {
    const dirty = withField({ shape: { ...clean.shape, markers: ["uses-acme-internal-sdk" as never] } });
    expect(SHAPE_MARKERS as readonly string[]).not.toContain("uses-acme-internal-sdk");
    expect(() => assertObservationCarriesNoContent(dirty, KNOWN)).toThrow(/closed marker vocabulary/);
    // Mutation: make markers `readonly string[]` and drop the membership check. Red. A free-text
    // marker is where a dependency name, and therefore a company, would end up.
  });

  it("refuses an extension that is really a path", () => {
    const dirty = withField({ shape: { ...clean.shape, extensions: [{ ext: "../../etc/passwd", share: 1 }] } });
    expect(dirty.shape.extensions[0]!.ext).toContain("..");
    expect(() => assertObservationCarriesNoContent(dirty, KNOWN)).toThrow(/bare file extension/);
  });

  it("refuses a probe id carrying a path", () => {
    const dirty = withField({ probeDenominators: { "C:\\Users\\alice\\repo": 3 } });
    expect(Object.keys(dirty.probeDenominators)[0]).toContain("\\");
    expect(() => assertObservationCarriesNoContent(dirty, KNOWN)).toThrow(/probeDenominators/);
  });

  it("projects EXACTLY the allowlisted keys, so a new field cannot ride along", () => {
    // An equality, not a subset check, and it lives here rather than in the sink's suite because
    // this is where `observationFrom` actually runs. The first version of this assertion was in
    // the mcp-server tests against a hand-built fixture, and the mutation below was run and stayed
    // GREEN, because a hand-built record cannot notice a change to the projection. A test placed
    // where the code under test does not run is the placement version of a vacuous test.
    //
    // Mutation, verified red here: add `targetPath: "/home/alice/repo" as never` to the object
    // literal in `observationFrom`. That is precisely the shape of leak this loop must never grow,
    // and a denylist ("strip these fields") would have failed open for it.
    expect(Object.keys(clean).sort()).toEqual(
      [
        "abstentionCodes",
        "band",
        "corpusVersion",
        "coverageRatio",
        "day",
        "detectorId",
        "modality",
        "probeDenominators",
        "rulesEvaluatedNotFired",
        "rulesFired",
        "schemaVersion",
        "scoreBucket",
        "shape",
        "status",
      ].sort(),
    );
    expect(Object.keys(clean.shape).sort()).toEqual(["extensions", "markers", "sizeBucket"]);
  });

  it("lets a legitimate record through, so the guard is not simply refusing everything", () => {
    // Without this, every test above would pass on `assertObservationCarriesNoContent = () => {
    // throw }`. A guard that refuses everything is as broken as one that refuses nothing.
    expect(() => assertObservationCarriesNoContent(clean, KNOWN)).not.toThrow();
    expect(clean.rulesFired.length).toBeGreaterThan(0);
  });
});

describe("the sink writes locally and cannot be pointed at a network", () => {
  it("writes one JSON object per line, through an injected writer", async () => {
    const written: string[] = [];
    const sink = observationSink({ append: (line) => void written.push(line) }, KNOWN);
    await sink.record(build());
    expect(written).toHaveLength(1);
    expect(written[0]!.endsWith("\n")).toBe(true);
    const parsed = JSON.parse(written[0]!) as CorpusObservation;
    expect(parsed.corpusVersion).toBe("corpus-2026.09");
    expect(jsonlLine(build())).toBe(written[0]);
  });

  it("re-checks at the sink, not only at construction", async () => {
    const written: string[] = [];
    const sink = observationSink({ append: (line) => void written.push(line) }, KNOWN);
    const handBuilt = { ...build(), rulesFired: ["/etc/shadow"] };
    await expect(sink.record(handBuilt)).rejects.toThrow(ObservationLeakError);
    expect(written).toHaveLength(0);
    // Mutation: delete `assertObservationCarriesNoContent` from `observationSink.record`. Red.
    // The two calls look redundant and are not: one guards today's constructor, the other guards
    // a record somebody builds by hand tomorrow.
  });

  it("has no field anywhere in its type that could name a network destination", () => {
    // A structural assertion, deliberately: the sink takes a writer that receives TEXT, so there
    // is no `url`, `host` or `endpoint` for a future caller to fill in. This is checked as source
    // text because that is where the property actually lives.
    const written: string[] = [];
    const sink = observationSink({ append: (l) => void written.push(l) }, KNOWN);
    expect(Object.keys(sink)).toEqual(["record"]);
  });
});

describe("a candidate rule cannot exist without its false-positive note", () => {
  const candidate = (over: Partial<CandidateRule> = {}): CandidateRule =>
    ({
      id: "css.default-radius-everywhere",
      family: "visual-default",
      title: "Every corner uses the same default radius",
      polarity: "signal",
      proposedWeight: 0.4,
      rationale: "Observed on 9 scans where the builder-fingerprint family also fired.",
      falsePositiveNote: "A design system that deliberately standardises on one radius token trips this, and most mature design systems do exactly that.",
      corpus: "web",
      proposedSince: "corpus-2026.11",
      support: { observations: 9, days: ["2026-08-01", "2026-08-02", "2026-08-03", "2026-08-05", "2026-08-08", "2026-08-11", "2026-08-14", "2026-08-19", "2026-08-24"], note: "nine distinct scans" },
      status: "proposed",
      review: { corpusSteward: null, falsePositiveHunter: null, decidedOn: null, reason: null },
      ...over,
    }) as CandidateRule;

  it("accepts a well-formed candidate, so the refusals below mean something", () => {
    expect(() => assertWellFormedCandidate(candidate())).not.toThrow();
  });

  it("refuses an empty false-positive note", () => {
    expect(() => assertWellFormedCandidate(candidate({ falsePositiveNote: "" }))).toThrow(/falsePositiveNote is empty/);
  });

  it("refuses a hedge dressed as a note", () => {
    for (const hedge of ["May occasionally be wrong in some cases and needs review later on.", "TODO: work out when this misfires and write it up properly here.", "N/A"]) {
      expect(() => assertWellFormedCandidate(candidate({ falsePositiveNote: hedge })), hedge).toThrow(MalformedCandidateError);
    }
    // Mutation: delete the HEDGES loop. Red on the first two. "May occasionally be wrong" is what
    // gets written when nobody looked, and it reads like a filled-in field in a diff.
  });

  it("refuses a note too short to name a legitimate artifact", () => {
    expect(() => assertWellFormedCandidate(candidate({ falsePositiveNote: "Cream sites." }))).toThrow(/characters/);
  });

  it("refuses a support count that disagrees with its own evidence", () => {
    expect(() => assertWellFormedCandidate(candidate({ support: { observations: 9, days: ["2026-08-01"], note: "x" } }))).toThrow(/disagrees with its own evidence/);
    // A count that only agrees with itself is not a verification (HOUSE-KNOWLEDGE). Here the count
    // and the dates are two independent statements, so they can disagree, so the check can fail.
  });

  it("refuses acceptance on one reviewer", () => {
    const oneReviewer = candidate({ status: "accepted", review: { corpusSteward: "passed 2026-08-26", falsePositiveHunter: null, decidedOn: "2026-08-26", reason: "clear" } });
    expect(() => assertWellFormedCandidate(oneReviewer)).toThrow(/both reviewers/);
    const both = candidate({ status: "accepted", review: { corpusSteward: "passed", falsePositiveHunter: "9 human artifacts scored, none reached a finding band", decidedOn: "2026-08-26", reason: "clear" } });
    expect(() => assertWellFormedCandidate(both)).not.toThrow();
    // Mutation: drop the falsePositiveHunter conjunct. Red on the first case AND the second still
    // passes, which is what proves the check discriminates rather than refusing everything.
  });

  it("refuses acceptance below the support threshold", () => {
    const thin = candidate({
      status: "accepted",
      support: { observations: 2, days: ["2026-08-01", "2026-08-02"], note: "thin" },
      review: { corpusSteward: "ok", falsePositiveHunter: "ok", decidedOn: "2026-08-26", reason: "r" },
    });
    expect(MIN_SUPPORTING_OBSERVATIONS).toBeGreaterThan(2);
    expect(() => assertWellFormedCandidate(thin)).toThrow(/below the threshold/);
  });

  it("refuses a rejection with no reason, because a rejected candidate is the useful one", () => {
    expect(() => assertWellFormedCandidate(candidate({ status: "rejected" }))).toThrow(/no reason/);
  });

  it("refuses a counter rule proposing a positive weight, and the reverse", () => {
    expect(() => assertWellFormedCandidate(candidate({ polarity: "counter", proposedWeight: 0.4 }))).toThrow(/negative weight/);
    expect(() => assertWellFormedCandidate(candidate({ polarity: "signal", proposedWeight: -0.4 }))).toThrow(/positive weight/);
  });
});
