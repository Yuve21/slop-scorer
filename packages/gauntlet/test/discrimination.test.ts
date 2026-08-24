/**
 * The published table, and the two ways it could become a lie.
 *
 *  1. BY DIVIDING TOO EARLY. A "68% of people found it" over nineteen guesses is not a measurement,
 *     and it is the exact shape of claim the FTC's *In re Workado* order is about: a performance
 *     figure the respondent could not substantiate. So the gate is tested from both sides - it must
 *     refuse below the minimum and it must compute above it - and the interval must be present
 *     whenever the rate is.
 *  2. BY BEING WRITTEN DOWN. `no-claims.test.ts` in core scans this repository for hardcoded
 *     accuracy figures. This suite adds the reciprocal check: everything the module prints is
 *     derived from rows handed to it in the same call.
 */

import { describe, expect, it } from "vitest";
import type { DiscriminationRow } from "@slop/db";
import { MINIMUM_SAMPLE, formatCalibrationExport, summarize, toSubstantiationRun, wilson } from "@slop/gauntlet";

const row = (over: Partial<DiscriminationRow> & { artifactId: string }): DiscriminationRow => ({
  corpus: "code",
  label: "human",
  source: "a source",
  provenance: "a provenance sentence long enough to be a real one for the purposes of this fixture",
  timesShown: 0,
  timesChosenAsHuman: 0,
  timesWasTheAnswer: 0,
  timesAnswerFound: 0,
  medianElapsedMs: null,
  ...over,
});

const OPTIONS = { corpusVersion: "test-v1", computedAt: "2026-08-24T00:00:00.000Z" };

describe("the minimum sample gate", () => {
  it("refuses to state a rate one guess below the threshold", () => {
    const x = summarize(
      [row({ artifactId: "a", timesShown: 100, timesWasTheAnswer: MINIMUM_SAMPLE - 1, timesAnswerFound: 20 })],
      OPTIONS,
    );
    const a = x.artifacts[0];
    expect(a?.humanDiscriminationRate).toBeNull();
    expect(a?.humanDiscriminationInterval).toBeNull();
    expect(a?.belowMinimumSample).toBe(true);
    // The counts are still published. Refusing the rate is not refusing the evidence.
    expect(a?.timesAnswerFound).toBe(20);
  });

  it("states it one guess above", () => {
    const x = summarize(
      [row({ artifactId: "a", timesShown: 100, timesWasTheAnswer: MINIMUM_SAMPLE, timesAnswerFound: 20 })],
      OPTIONS,
    );
    expect(x.artifacts[0]?.humanDiscriminationRate).toBeCloseTo(20 / MINIMUM_SAMPLE, 10);
    expect(x.artifacts[0]?.humanDiscriminationInterval).not.toBeNull();
  });

  it("never states a rate without an interval, in either direction", () => {
    const rows = [
      row({ artifactId: "a", timesShown: 200, timesWasTheAnswer: 120, timesAnswerFound: 84 }),
      row({ artifactId: "b", label: "generated", timesShown: 300, timesChosenAsHuman: 41 }),
      row({ artifactId: "c", timesShown: 4, timesWasTheAnswer: 2, timesAnswerFound: 2 }),
    ];
    for (const stat of summarize(rows, OPTIONS).artifacts) {
      expect(stat.humanDiscriminationRate === null).toBe(stat.humanDiscriminationInterval === null);
      expect(stat.mistakenForHumanRate === null).toBe(stat.mistakenForHumanInterval === null);
    }
  });

  it("keeps a below-threshold artifact out of the pooled figure and says how many it dropped", () => {
    const x = summarize(
      [
        row({ artifactId: "a", timesShown: 200, timesWasTheAnswer: 100, timesAnswerFound: 70 }),
        row({ artifactId: "b", timesShown: 20, timesWasTheAnswer: 10, timesAnswerFound: 10 }),
      ],
      OPTIONS,
    );
    const o = x.overallHumanDiscrimination;
    expect(o.trials).toBe(100);
    expect(o.found).toBe(70);
    expect(o.artifactsIncluded).toBe(1);
    expect(o.artifactsBelowMinimum).toBe(1);
  });

  it("computes nothing at all from an empty corpus rather than printing zeroes", () => {
    const x = summarize([], OPTIONS);
    expect(x.overallHumanDiscrimination.rate).toBeNull();
    expect(x.overallHumanDiscrimination.interval).toBeNull();
    expect(formatCalibrationExport(x)).toContain("not computed");
  });

  it("reports a generated artifact by how often it was MISTAKEN for the human one", () => {
    const x = summarize(
      [row({ artifactId: "g", label: "generated", timesShown: 400, timesChosenAsHuman: 96 })],
      OPTIONS,
    );
    const g = x.artifacts[0];
    expect(g?.mistakenForHumanRate).toBeCloseTo(0.24, 10);
    // A generated artifact is never the answer, so the human-discrimination figures stay null
    // rather than being computed over a denominator of zero.
    expect(g?.humanDiscriminationRate).toBeNull();
  });
});

describe("the Wilson interval", () => {
  it("brackets the point estimate and stays inside [0, 1]", () => {
    for (const [k, n] of [
      [0, 30],
      [1, 30],
      [15, 30],
      [30, 30],
      [700, 1000],
    ] as const) {
      const i = wilson(k, n);
      expect(i).not.toBeNull();
      if (i === null) continue;
      expect(i.low).toBeGreaterThanOrEqual(0);
      expect(i.high).toBeLessThanOrEqual(1);
      expect(i.low).toBeLessThanOrEqual(k / n);
      expect(i.high).toBeGreaterThanOrEqual(k / n);
    }
  });

  it("does not collapse to a point at the boundary, which is where the normal approximation fails", () => {
    // 30 of 30 under the normal approximation gives [1, 1], which would read as certainty from
    // thirty observations. Wilson does not.
    const i = wilson(30, 30);
    expect(i?.low).toBeLessThan(0.95);
    expect(i?.high).toBe(1);
    const zero = wilson(0, 30);
    expect(zero?.low).toBe(0);
    expect(zero?.high).toBeGreaterThan(0.05);
  });

  it("narrows as n grows", () => {
    const small = wilson(35, 50) as { low: number; high: number };
    const large = wilson(700, 1000) as { low: number; high: number };
    expect(large.high - large.low).toBeLessThan(small.high - small.low);
  });

  it("returns null rather than NaN at n = 0", () => {
    expect(wilson(0, 0)).toBeNull();
  });
});

describe("the rendered table", () => {
  const x = summarize(
    [
      row({ artifactId: "code:flask", timesShown: 260, timesWasTheAnswer: 130, timesAnswerFound: 91 }),
      row({ artifactId: "code:scaffold", label: "generated", timesShown: 260, timesChosenAsHuman: 22 }),
      row({ artifactId: "web:new", timesShown: 8, timesWasTheAnswer: 4, timesAnswerFound: 1 }),
    ],
    OPTIONS,
  );
  const text = formatCalibrationExport(x);

  it("prints the numerator and the denominator on every line that has a rate", () => {
    expect(text).toContain("found 91 of 130");
    expect(text).toContain("picked 22 of 260");
    expect(text).toContain("pooled: 91 of 130");
    expect(text).toContain("[");
  });

  it("names what it excluded and why", () => {
    expect(text).toContain("below the minimum sample");
    expect(text).toContain(`minimum sample before any rate is stated: ${MINIMUM_SAMPLE}`);
  });

  it("states the corpus version and the moment of computation on the first line", () => {
    expect(text.split("\n")[0]).toContain("test-v1");
    expect(text.split("\n")[0]).toContain(OPTIONS.computedAt);
  });

  it("computes every figure it prints from the rows it was handed", () => {
    // Change one input; the printed figure must move. Without this the formatter could be printing
    // a constant and every assertion above would still pass.
    const moved = formatCalibrationExport(
      summarize(
        [row({ artifactId: "code:flask", timesShown: 260, timesWasTheAnswer: 130, timesAnswerFound: 92 })],
        OPTIONS,
      ),
    );
    expect(moved).toContain("found 92 of 130");
    expect(moved).not.toContain("found 91 of 130");
  });
});

describe("packaging a run for substantiation", () => {
  it("hoists the denominator into a column and leaves the row unpublished", () => {
    const x = summarize(
      [row({ artifactId: "a", timesShown: 200, timesWasTheAnswer: 100, timesAnswerFound: 70 })],
      OPTIONS,
    );
    const run = toSubstantiationRun(x, { runId: "run_1", producedBy: "@slop/gauntlet test" });
    expect(run.sampleSize).toBe(100);
    expect(run.minimumSample).toBe(MINIMUM_SAMPLE);
    expect(run.corpusVersion).toBe("test-v1");
    // A row is evidence; a published row is a claim, and the transition is a deliberate act.
    expect(run.publishedAt).toBeNull();
  });
});
