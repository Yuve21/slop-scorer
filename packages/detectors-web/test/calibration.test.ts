import { describe, expect, it } from "vitest";
import { analyzeArtifact, NEGATIVE_CORPUS, CORPUS_VERSION } from "@slop/detectors-web";
import { assertNegativeCorpus, buildReport, checkNegativeCorpus, formatCalibration, runCalibration } from "@slop/core";

/**
 * The regression tripwire.
 *
 * Five artifacts a person made, four of them read out of a live browser and written up
 * field by field. Every one of them trips something: three use the warm off-white background
 * that every competing detector treats as a tell, two set very large display type, one uses a
 * single free Google serif for the entire page, and one ships two megabytes of JavaScript.
 *
 * If a rule change starts calling any of them a finding, this test fails and NAMES THE RULE.
 * That failure mode, not a missed generator, is the one that kills products in this category:
 * `image-detection-reality.md` documents four people publicly accused of being machines, and
 * in the canonical case the artist offered his layered source files and was told
 * "I don't believe you".
 *
 * WHAT THIS TEST DOES NOT DO. It does not establish a false-positive rate. Five artifacts
 * cannot, and no number computed here is published anywhere. `no-claims.test.ts` enforces
 * that separately by scanning the source and the READMEs for accuracy figures.
 */

const report = (artifact: Parameters<typeof analyzeArtifact>[0], id: string) =>
  buildReport([analyzeArtifact(artifact, { kind: "url", url: `https://calibration.invalid/${id}` })]);

const calibration = runCalibration(CORPUS_VERSION, NEGATIVE_CORPUS, report);

describe("calibration against known-human work", () => {
  it("prints the distribution so a regression is visible, not just red", () => {
    // eslint-disable-next-line no-console -- the table is the point of the run
    console.log(`\n${formatCalibration(calibration)}\n`);
    expect(calibration.rows).toHaveLength(NEGATIVE_CORPUS.length);
  });

  it("no known-human artifact reaches the 'many signals' band", () => {
    const violations = checkNegativeCorpus(calibration, "many-signals");
    expect(violations.map((v) => v.message)).toEqual([]);
    expect(() => assertNegativeCorpus(calibration, "many-signals")).not.toThrow();
  });

  it("no known-human artifact is even scored above the midpoint", () => {
    for (const row of calibration.rows) {
      expect(row.score ?? 0, `${row.id} (${row.source}) scored ${row.score}`).toBeLessThan(50);
    }
  });

  it("every member was actually examined: none of them abstained for lack of coverage", () => {
    // An abstention on a human artifact is correct behaviour, but if ALL of them abstained
    // this test would be passing without measuring anything, which is the vacuous-pass shape.
    for (const row of calibration.rows) {
      expect(row.coverage, `${row.id} coverage`).toBeGreaterThanOrEqual(0.6);
    }
    expect(calibration.byLabel.human.scored, "every negative must have produced a real score").toBe(
      NEGATIVE_CORPUS.length,
    );
  });

  it("the corpus is not vacuous: at least one negative trips at least one rule", () => {
    // If nothing fires on any of them, this suite proves nothing. The negatives are chosen
    // BECAUSE they trip things; the assertion is that tripping things is not enough.
    const anyFired = calibration.rows.some((r) => r.firedRules.length > 0);
    expect(anyFired, "no rule fired on any negative, so this calibration measured nothing").toBe(true);
  });

  it("the cream palette is counter-evidence, not a tell", () => {
    // Three of four funded, design-literate comparables use a warm off-white. Encoding it as
    // a positive rule would fail three quarters of the corpus's own negative set.
    const cream = calibration.rows.filter((r) => ["overtone", "rodeo"].includes(r.id));
    expect(cream).toHaveLength(2);
    for (const row of cream) {
      expect(row.firedRules, `${row.id} must not be penalised for a warm paper background`).not.toContain(
        "css.cream-palette",
      );
    }
    const overtone = NEGATIVE_CORPUS.find((c) => c.id === "overtone")!;
    const full = report(overtone.artifact, overtone.id);
    expect(full.counterEvidence.map((c) => c.ruleId)).toContain("counter.category-convention-palette");
  });

  it("every negative provenance says HOW we know the label", () => {
    for (const c of NEGATIVE_CORPUS) {
      expect(c.provenance.length, `${c.id} has no stated basis for its label`).toBeGreaterThan(60);
      expect(c.label).toBe("human");
      expect(c.capturedAt).toBeTruthy();
    }
  });
});
