import { describe, expect, it } from "vitest";
import { analyzeArtifact, NEGATIVE_CORPUS, CORPUS_VERSION } from "@slop/detectors-web";
import { assertNegativeCorpus, buildReport, checkNegativeCorpus, formatCalibration, runCalibration } from "@slop/core";
import { WEB_GENERATED_CORPUS, WEB_GENERATED_INDEX } from "./corpus/index.js";

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
 *
 * THE OTHER HALF OF THE TABLE. Four pages a generator made are calibrated alongside the five,
 * from `test/corpus/`. They are not written here: each one is a live public page that names
 * its own builder in its own markup, captured through the real probe and frozen to disk. The
 * distribution below is therefore two-sided, and the gap between the sides is asserted rather
 * than admired, because a corpus of five quiet negatives is satisfiable by deleting every rule.
 */

const report = (artifact: Parameters<typeof analyzeArtifact>[0], id: string) =>
  buildReport([analyzeArtifact(artifact, { kind: "url", url: `https://calibration.invalid/${id}` })]);

/** Human and generated in one run, so one table shows both sides and one seed shows the gap. */
const FULL_CORPUS = [...NEGATIVE_CORPUS, ...WEB_GENERATED_CORPUS];
const calibration = runCalibration(CORPUS_VERSION, FULL_CORPUS, report);
const humanRows = calibration.rows.filter((r) => r.label === "human");
const generatedRows = calibration.rows.filter((r) => r.label === "generated");

describe("calibration against known-human work", () => {
  it("prints the distribution so a regression is visible, not just red", () => {
    // eslint-disable-next-line no-console -- the table is the point of the run
    console.log(`\n${formatCalibration(calibration)}\n`);
    expect(calibration.rows).toHaveLength(FULL_CORPUS.length);
    expect(humanRows).toHaveLength(NEGATIVE_CORPUS.length);
    expect(generatedRows).toHaveLength(WEB_GENERATED_CORPUS.length);
  });

  it("no known-human artifact reaches the 'many signals' band", () => {
    const violations = checkNegativeCorpus(calibration, "many-signals");
    expect(violations.map((v) => v.message)).toEqual([]);
    expect(() => assertNegativeCorpus(calibration, "many-signals")).not.toThrow();
  });

  it("no known-human artifact is even scored above the midpoint", () => {
    for (const row of humanRows) {
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
    const anyFired = humanRows.some((r) => r.firedRules.length > 0);
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

describe("the generated half of the web corpus", () => {
  it("every member declares its own generator, in a locator a stranger can re-read", () => {
    // The whole basis of these four labels. It is stated as a locator (a meta tag, a runtime
    // script host) rather than as an opinion about how the page looks, because inferring the
    // label from the page's shape would be circular: the shape is the thing under test.
    expect(WEB_GENERATED_INDEX).toHaveLength(4);
    for (const entry of WEB_GENERATED_INDEX) {
      expect(entry.label).toBe("generated");
      expect(entry.origin, `${entry.id} is not a real-world capture`).toBe("real");
      expect(entry.declaration.length, `${entry.id} states no declaration`).toBeGreaterThan(20);
      expect(entry.provenance.length, `${entry.id} has no stated basis for its label`).toBeGreaterThan(120);
      expect(entry.capturedAt, `${entry.id} is not pinned to a capture date`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("is not one vendor wearing four hats", () => {
    // A corpus of one tool's output measures that tool's habits. Three of these are v0 and one
    // is Lovable, and the assertion is on the DECLARATIONS rather than on a comment saying so.
    const vendors = new Set(
      WEB_GENERATED_INDEX.map((e) => (/v0\.app/i.test(e.declaration) ? "v0" : /lovable|gpteng/i.test(e.declaration) ? "lovable" : e.id)),
    );
    expect([...vendors].sort()).toEqual(["lovable", "v0"]);
  });

  it("every one of them is scored, not abstained on", () => {
    for (const row of generatedRows) {
      expect(row.status, `${row.id} status`).toBe("assessed");
      expect(row.coverage, `${row.id} coverage`).toBeGreaterThanOrEqual(0.6);
    }
    expect(calibration.byLabel.generated.scored).toBe(WEB_GENERATED_CORPUS.length);
  });

  it("every one of them clears the midpoint the human side stays under", () => {
    for (const row of generatedRows) {
      expect(row.score ?? 0, `${row.id} scored ${row.score}; rules: ${row.firedRules.join(", ") || "(none)"}`).toBeGreaterThan(50);
    }
  });

  it("fires across several independent families on each, not one", () => {
    // A single-family read is the shape the engine is supposed to abstain on. If one of these
    // ever drops to one family it stops being scored at all, silently, and the gap below would
    // then be computed over a shrinking set.
    for (const c of WEB_GENERATED_CORPUS) {
      const full = report(c.artifact, c.id);
      expect(full.familiesFired, `${c.id} fired only ${full.familiesFired} family`).toBeGreaterThanOrEqual(3);
    }
  });

  it("the gap between the human maximum and the generated minimum is wide", () => {
    const worstHuman = Math.max(...humanRows.map((r) => r.score ?? 0));
    const bestGenerated = Math.min(...generatedRows.map((r) => r.score ?? 0));
    expect(
      bestGenerated - worstHuman,
      `human max ${worstHuman}, generated min ${bestGenerated}`,
    ).toBeGreaterThan(30);
  });

  it("does not lean on the generator meta tag alone", () => {
    // The tag is how we KNOW the label. If it were also the only thing scoring them, the
    // detector would be reading the answer key rather than the page, and it would collapse the
    // day a vendor stops writing the tag. Re-scored with the declaration removed, each page
    // must still be moved by the rest of the corpus, and must still clear the human maximum -
    // a weaker bar than the unblinded one, stated at its real strength rather than inflated.
    // Only one of the four (study-snapshot-space) never had the tag to begin with.
    const worstHuman = Math.max(...humanRows.map((r) => r.score ?? 0));
    for (const c of WEB_GENERATED_CORPUS) {
      const blinded = { ...c.artifact, head: { ...c.artifact.head, generator: null } };
      const full = report(blinded, c.id);
      expect(full.receipt.lines.map((l) => l.ruleId)).not.toContain("builder.ai-generator-meta");
      expect(
        full.score ?? 0,
        `${c.id} scored ${full.score} blinded, against a human maximum of ${worstHuman}`,
      ).toBeGreaterThan(worstHuman * 2);
    }
  });
});
