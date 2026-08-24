import { describe, expect, it } from "vitest";
import { analyzeRepoArtifact, CODE_CONFIG, CODE_RULES } from "@slop/detectors-code";
import type { RepoArtifact } from "@slop/detectors-code";
import {
  assertNegativeCorpus,
  buildReport,
  checkNegativeCorpus,
  formatCalibration,
  runCalibration,
} from "@slop/core";
import {
  CODE_CORPUS,
  CODE_CORPUS_INDEX,
  CODE_GENERATED_CORPUS,
  CODE_GENERATED_REAL_CORPUS,
  CODE_NEGATIVE_CORPUS,
  CODE_SYNTHETIC_CORPUS,
} from "./corpus/index.js";

/**
 * The code detector's regression tripwire.
 *
 * Ten repositories a person wrote, replayed from pinned scans, plus one synthetic scaffold
 * that must score high. Until this file existed, half the product had no defence against
 * flagging genuine human work: the web corpus had five provenanced negatives and the code
 * corpus had none, so every code rule was free to drift into accusing careful engineers and
 * nothing would have gone red.
 *
 * WHAT THESE TEN ARE. Named authorship, substantial pre-2022 history, an institution behind
 * them, and the provenance sentence is stored with the artifact so a stranger can check the
 * claim rather than take it. Five languages, deliberately: the first capture run proved the
 * cost of a JavaScript-shaped corpus by reporting gin, a repository that is roughly half
 * tests, as having none, because the test-path pattern could not express `*_test.go`.
 *
 * WHAT IT DOES NOT DO. It does not establish a false-positive rate. Ten artifacts cannot, and
 * no number computed here is published anywhere; `no-claims.test.ts` enforces that
 * separately. Ten artifacts are a tripwire, and a tripwire is the job.
 */

const score = (artifact: RepoArtifact, id: string) =>
  buildReport([analyzeRepoArtifact(artifact, { kind: "repo", path: `calibration://${id}` })], { config: CODE_CONFIG });

const calibration = runCalibration(CODE_CONFIG.corpusVersion, CODE_CORPUS, score);
const humans = calibration.rows.filter((r) => r.label === "human");

/**
 * The two real generated repositories the engine declines to score, pinned by name.
 *
 * Both are v0 builds whose only accusing finding is `scaffold.unused-dependencies`, and one
 * family on its own is a correlated observation rather than corroboration, so the engine
 * abstains at `single_family_only` rather than publishing a 47. That is the advertised
 * behaviour working on a case where it costs us: these two ARE generated and we are declining
 * to say so, because saying so on one family's evidence is the accusation this product exists
 * not to make. It is pinned here rather than described anywhere, so a rule change that turns
 * either of them into a confident number is a visible, deliberate edit to this list.
 */
const ABSTAINERS: readonly string[] = ["buildrs-social-network", "nano-banana-hackathon"];

/**
 * The base rate: what the engine prints for an artifact with NO evidence either way. A human
 * negative that scores above it has been moved by the corpus, in the accusing direction, on
 * the strength of rules that were supposed to be about generated code.
 */
const BASE_RATE = buildReport(
  [analyzeRepoArtifact(CODE_NEGATIVE_CORPUS[0]!.artifact, { kind: "repo", path: "base-rate" }, { rules: [] })],
  { config: CODE_CONFIG },
).receipt.priorPoints;

describe("calibration against ten repositories a person wrote", () => {
  it("prints the distribution so a regression is visible, not just red", () => {
    // eslint-disable-next-line no-console -- the table is the point of the run
    console.log(`\n${formatCalibration(calibration)}\n`);
    expect(calibration.rows).toHaveLength(CODE_CORPUS.length);
    expect(humans).toHaveLength(10);
  });

  it("no known-human repository reaches the 'some signals' band", () => {
    const violations = checkNegativeCorpus(calibration, "some-signals");
    expect(violations.map((v) => v.message)).toEqual([]);
    expect(() => assertNegativeCorpus(calibration, "some-signals")).not.toThrow();
  });

  it("every known-human repository scores at or below the base rate", () => {
    // The strict form of the tripwire. A rule change that starts flagging human work shows up
    // here first, and the failure names the repository and every rule that fired on it.
    for (const row of humans) {
      expect(
        row.score ?? 0,
        `${row.id} (${row.source}) scored ${row.score} against a base rate of ${BASE_RATE}. Rules that fired: ${
          row.firedRules.join(", ") || "(none)"
        }`,
      ).toBeLessThanOrEqual(BASE_RATE);
    }
  });

  it("every member was actually examined, and the two abstentions are named ones", () => {
    for (const row of calibration.rows) {
      expect(row.coverage, `${row.id} coverage`).toBeGreaterThanOrEqual(0.6);
    }
    // Every human negative and both synthetic specimens are SCORED. If one of them ever went
    // quiet, the tripwire below would be measuring a shrinking set without saying so.
    for (const row of calibration.rows.filter((r) => !ABSTAINERS.includes(r.id))) {
      expect(row.status, `${row.id} status`).toBe("assessed");
    }
    expect(calibration.byLabel.human.scored).toBe(humans.length);
    // And the two that DO abstain are pinned by name, with the reason. See the block below for
    // why this is the engine working rather than the engine failing.
    for (const id of ABSTAINERS) {
      expect(calibration.rows.find((r) => r.id === id)?.status, `${id} status`).toBe("inconclusive");
    }
  });

  it("the corpus is not vacuous: a signal rule does fire on human work", () => {
    // If nothing accusing ever fired on any of the ten, this file would be passing because
    // the rules are dead rather than because the rules are careful. The negatives are chosen
    // to include work that trips things; the assertion is that tripping is not enough.
    const signals = new Set(CODE_RULES.filter((r) => r.polarity === "signal").map((r) => r.id));
    const fired = humans.flatMap((r) => r.firedRules).filter((id) => signals.has(id));
    expect(fired.length, "no signal rule fired on any of the ten, so this corpus measured nothing").toBeGreaterThan(0);
  });

  it("the corpus is not one language wearing ten hats", () => {
    const extensions = new Set(
      CODE_NEGATIVE_CORPUS.flatMap((c) => c.artifact.files.map((f) => f.ext)).filter((e) => e.length > 1),
    );
    expect([...extensions].sort().join(" ")).toBeTruthy();
    expect(extensions.size, `only ${[...extensions].join(", ")} in the corpus`).toBeGreaterThanOrEqual(5);
  });

  it("every negative states HOW we know the label, and pins the commit", () => {
    for (const entry of CODE_CORPUS_INDEX.filter((e) => e.label === "human")) {
      expect(entry.provenance.length, `${entry.id} has no stated basis for its label`).toBeGreaterThan(120);
      expect(entry.sha, `${entry.id} is not pinned to a commit, so the capture is not reproducible`).toMatch(
        /^[0-9a-f]{40}$/,
      );
      expect(entry.capturedAt).toBeTruthy();
    }
  });
});

describe("discrimination: the corpus must still be able to fire", () => {
  const generated = calibration.rows.filter((r) => r.label === "generated");
  const syntheticIds = CODE_SYNTHETIC_CORPUS.map((c) => c.id);
  const synthetic = generated.filter((r) => syntheticIds.includes(r.id));

  it("both synthetic specimens score high", () => {
    // Without these, ten quiet negatives could be satisfied by deleting every rule. Both are
    // written to disk by the capture script and read by the SAME scanner as the ten
    // repositories, so a scanner that breaks breaks this too.
    //
    // Scoped to the SYNTHETIC pair deliberately. These two are ours, written to trip things,
    // and they establish a sensitivity floor - not a recall figure, and not a claim about what
    // real generated code looks like. The four real ones are held to their own, measured bar
    // in the block below, and the two numbers are never pooled.
    expect(synthetic).toHaveLength(2);
    expect(generated.length).toBeGreaterThan(synthetic.length);
    for (const row of synthetic) {
      expect(row.score ?? 0, `${row.id} scored ${row.score}`).toBeGreaterThan(70);
    }
    expect(calibration.rows.find((r) => r.id === "synthetic-scaffold")?.band).toBe("heavy-template-signature");
  });

  it("the specimen with no agent artifact is still caught, by shape alone", () => {
    // The case the product has to survive once everyone learns to delete CLAUDE.md. It cannot
    // reach the top band by design (that band requires an agent artifact) and it must not need
    // to: uniform files, uniform functions and a test that cannot fail are enough.
    const row = calibration.rows.find((r) => r.id === "synthetic-agent-pass");
    expect(row?.firedRules ?? []).not.toContain("agent.instruction-file-committed");
    expect(row?.score ?? 0).toBeGreaterThan(60);
    expect(["many-signals", "heavy-template-signature"]).toContain(row?.band);
  });

  it("every signal rule in the corpus fires on at least one artifact", () => {
    // The vacuous-corpus check, at the level of the whole corpus rather than one rule. A rule
    // that fires on nothing anywhere is indistinguishable from a rule that has gone stale, and
    // three of these were exactly that until the sweep: uniform.function-length,
    // verify.tautological-tests and agent.transcript-committed fired on no artifact at all.
    const firedAnywhere = new Set(calibration.rows.flatMap((r) => r.firedRules));
    const dead = CODE_RULES.filter((r) => r.polarity === "signal" && !firedAnywhere.has(r.id)).map((r) => r.id);
    expect(dead, `these rules fire on nothing in the whole corpus: ${dead.join(", ")}`).toEqual([]);
  });

  it("the gap between the human maximum and the synthetic minimum is wide", () => {
    const worstHuman = Math.max(...humans.map((r) => r.score ?? 0));
    const bestGenerated = Math.min(...synthetic.map((r) => r.score ?? 0));
    expect(bestGenerated - worstHuman, `human max ${worstHuman}, synthetic min ${bestGenerated}`).toBeGreaterThan(40);
  });

  it("the generated case trips the families the corpus is built around", () => {
    const fired = new Set(CODE_GENERATED_CORPUS.flatMap((c) => score(c.artifact, c.id).receipt.lines.map((l) => l.family)));
    for (const family of ["agent-artifact", "scaffold-residue", "verification-floor", "history"]) {
      expect(fired.has(family), `the generated fixture fired nothing in "${family}"`).toBe(true);
    }
  });
});

/**
 * The four repositories a GENERATOR wrote, and what this detector actually does with them.
 *
 * This block exists because the synthetic pair cannot answer the only question that matters:
 * the specimens we wrote score 99 and 74 because we wrote them to. These four are public,
 * pinned by SHA, and labelled from what somebody else recorded - each README is written by the
 * generator and names it, and every commit in each history is the vendor's own bot account, so
 * the label is not an inference from how the code looks. `scripts/capture-code-corpus.mjs`
 * re-checks both conditions against the checkout on every capture.
 *
 * WHAT IS PINNED HERE IS THE MEASURED RESULT, NOT A HOPE. Two are scored and land above every
 * human negative; two abstain at `single_family_only`. Writing down the honest version, with
 * the two abstentions named, is the whole point: this is the number a customer would get, and
 * a rule change that quietly moves it - in EITHER direction - has to come through this file.
 */
describe("the four repositories a generator actually wrote", () => {
  const realIds = CODE_GENERATED_REAL_CORPUS.map((c) => c.id);
  const rows = calibration.rows.filter((r) => realIds.includes(r.id));
  const worstHuman = Math.max(...humans.map((r) => r.score ?? 0));

  it("is four real, pinned, self-declared captures and not one fixture", () => {
    expect(CODE_GENERATED_REAL_CORPUS).toHaveLength(4);
    for (const entry of CODE_CORPUS_INDEX.filter((e) => e.label === "generated" && e.origin === "real")) {
      expect(entry.sha, `${entry.id} is not pinned to a commit`).toMatch(/^[0-9a-f]{40}$/);
      expect(entry.declaration, `${entry.id} states no self-declaration`).toBeTruthy();
      expect(entry.provenance.length, `${entry.id} has no stated basis for its label`).toBeGreaterThan(120);
      expect(entry.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("is not one vendor wearing four hats", () => {
    // Two Lovable exports and two v0 builds. A corpus of one tool's output measures that
    // tool's habits, and the assertion reads the declarations rather than a comment.
    const declarations = CODE_CORPUS_INDEX.filter((e) => e.label === "generated" && e.origin === "real").map(
      (e) => e.declaration ?? "",
    );
    expect(declarations.filter((d) => /Lovable/i.test(d))).toHaveLength(2);
    expect(declarations.filter((d) => /v0\.app/i.test(d))).toHaveLength(2);
  });

  it("scores the two it can, and both land clear of every human negative", () => {
    const scored = rows.filter((r) => r.status === "assessed");
    expect(scored.map((r) => r.id).sort()).toEqual(["master-quiz-nexus", "unifiedteam"]);
    for (const row of scored) {
      expect(
        row.score ?? 0,
        `${row.id} scored ${row.score} against a human maximum of ${worstHuman}; rules: ${row.firedRules.join(", ")}`,
      ).toBeGreaterThan(worstHuman * 3);
    }
  });

  it("declines to score the other two, for a stated reason, rather than guessing", () => {
    // The honest failure, pinned. Both fire `scaffold.unused-dependencies` and nothing else,
    // and one family is a correlated observation rather than corroboration. The engine would
    // otherwise print 47 on a single rule, which is the accusation shape this product refuses.
    for (const id of ABSTAINERS) {
      const c = CODE_GENERATED_REAL_CORPUS.find((x) => x.id === id)!;
      const full = score(c.artifact, id);
      expect(full.status, `${id} status`).toBe("inconclusive");
      expect(full.score, `${id} must publish no number`).toBeNull();
      expect(full.familiesFired, `${id} families`).toBe(1);
      expect(full.abstention.map((a) => a.code), `${id} abstention`).toContain("single_family_only");
      // Not a quiet zero: the computed number exists and is well above the human maximum. The
      // engine is withholding a real reading, not failing to take one.
      expect(full.receipt.computedScore).toBeGreaterThan(worstHuman * 3);
    }
  });

  it("never puts one of them below a human negative", () => {
    // The regression that would matter most and is easiest to miss: a rule change that leaves
    // the synthetic pair at 99 and 74 while quietly sinking the real captures into the noise.
    for (const c of CODE_GENERATED_REAL_CORPUS) {
      const full = score(c.artifact, c.id);
      expect(
        full.receipt.computedScore,
        `${c.id} computes ${full.receipt.computedScore}, at or under the human maximum of ${worstHuman}`,
      ).toBeGreaterThan(worstHuman);
    }
  });
});

describe("suppression is bounded", () => {
  it("can only lower a score or leave it unchanged, never raise it", () => {
    // A suppressor that could raise a score would be the same bug pointed the other way:
    // withdrawing exculpatory evidence. Checked on every member, suppressed against
    // unsuppressed, rather than argued for in a comment.
    for (const c of CODE_CORPUS) {
      const withSuppression = buildReport([analyzeRepoArtifact(c.artifact, { kind: "repo", path: c.id })], {
        config: CODE_CONFIG,
      });
      const without = buildReport(
        [analyzeRepoArtifact(c.artifact, { kind: "repo", path: c.id }, { suppressors: [] })],
        { config: CODE_CONFIG },
      );
      expect(
        withSuppression.receipt.computedScore,
        `${c.id}: suppression moved the score UP, from ${without.receipt.computedScore} to ${withSuppression.receipt.computedScore}`,
      ).toBeLessThanOrEqual(without.receipt.computedScore);
    }
  });

  it("names the rule, the file and the reason whenever it withdraws evidence", () => {
    for (const c of CODE_CORPUS) {
      const result = analyzeRepoArtifact(c.artifact, { kind: "repo", path: c.id });
      const unsuppressed = analyzeRepoArtifact(c.artifact, { kind: "repo", path: c.id }, { suppressors: [] });
      const changed =
        JSON.stringify(result.findings.map((f) => [f.ruleId, f.evidence.length])) !==
        JSON.stringify(unsuppressed.findings.map((f) => [f.ruleId, f.evidence.length]));
      if (!changed) continue;
      const warning = (result.warnings ?? []).join("\n");
      expect(warning, `${c.id}: evidence was withdrawn with no warning saying so`).toContain("suppression(s) applied");
    }
  });
});
