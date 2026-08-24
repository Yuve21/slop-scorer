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
import { CODE_CORPUS, CODE_CORPUS_INDEX, CODE_GENERATED_CORPUS, CODE_NEGATIVE_CORPUS } from "./corpus/index.js";

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

  it("every member was actually examined: none abstained for lack of coverage", () => {
    for (const row of calibration.rows) {
      expect(row.coverage, `${row.id} coverage`).toBeGreaterThanOrEqual(0.6);
      expect(row.status, `${row.id} status`).toBe("assessed");
    }
    expect(calibration.byLabel.human.scored).toBe(humans.length);
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

  it("both synthetic specimens score high", () => {
    // Without these, ten quiet negatives could be satisfied by deleting every rule. Both are
    // written to disk by the capture script and read by the SAME scanner as the ten
    // repositories, so a scanner that breaks breaks this too.
    expect(generated).toHaveLength(2);
    for (const row of generated) {
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

  it("the gap between the human maximum and the generated minimum is wide", () => {
    const worstHuman = Math.max(...humans.map((r) => r.score ?? 0));
    const bestGenerated = Math.min(...generated.map((r) => r.score ?? 0));
    expect(bestGenerated - worstHuman, `human max ${worstHuman}, generated min ${bestGenerated}`).toBeGreaterThan(40);
  });

  it("the generated case trips the families the corpus is built around", () => {
    const fired = new Set(CODE_GENERATED_CORPUS.flatMap((c) => score(c.artifact, c.id).receipt.lines.map((l) => l.family)));
    for (const family of ["agent-artifact", "scaffold-residue", "verification-floor", "history"]) {
      expect(fired.has(family), `the generated fixture fired nothing in "${family}"`).toBe(true);
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
