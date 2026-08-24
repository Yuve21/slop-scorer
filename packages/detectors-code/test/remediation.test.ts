import { describe, expect, it } from "vitest";
import { analyzeRepoArtifact, CODE_RULES, neutralRepo } from "@slop/detectors-code";
import type { ProbeId, RepoArtifact } from "@slop/detectors-code";
import { applicabilityOf, assertWellFormedResult } from "@slop/core";
import { expectRemediationsAreHonest, zeroed } from "../../core/test/meta.js";

const corpus = {
  name: "code corpus",
  rules: CODE_RULES,
  neutral: () => neutralRepo(),
  probeIds: [] as readonly ProbeId[],
  analyze: (artifact: RepoArtifact, rules?: typeof CODE_RULES) =>
    analyzeRepoArtifact(artifact, { kind: "repo", path: "/tmp/x" }, rules ? { rules } : {}),
  zeroProbe: (artifact: RepoArtifact, probe: ProbeId) => ({ ...artifact, probes: zeroed(artifact.probes, probe) }),
};

describe("every code rule says what to change, and nothing else does", () => {
  it("the whole corpus proposes honestly", () => {
    expectRemediationsAreHonest(corpus);
  });

  it("the proposals reach the findings through the real analyze path", () => {
    const rule = CODE_RULES.find((r) => r.id === "agent.instruction-file-committed");
    if (!rule) throw new Error("agent.instruction-file-committed is gone from the corpus");
    const artifact = rule.fixtures.positive(neutralRepo()).artifact;
    const result = assertWellFormedResult(corpus.analyze(artifact, [rule]));
    const finding = result.findings.find((f) => f.ruleId === rule.id);

    // The pair, and both halves of it. Deleting the file alone leaves the working directory
    // that produced it still writing one; ignoring it alone leaves the committed copy exactly
    // where it was.
    expect(finding?.remediation?.map((r) => r.kind)).toEqual(["delete_file", "insert"]);
    const del = finding?.remediation?.[0];
    expect(del?.kind === "delete_file" && del.destructive).toBe(true);
    expect(del?.kind === "delete_file" && del.path).toBe("CLAUDE.md");
    expect(del?.doNotApplyIf).toMatch(/deliberate/);
    expect(del?.rebuttal, "the fix must carry the rule's own rebuttal").toBe(rule.falsePositiveNote);
  });

  it("the README fix quotes the line it read and proposes removing it", () => {
    const rule = CODE_RULES.find((r) => r.id === "scaffold.readme-template-markers");
    if (!rule) throw new Error("scaffold.readme-template-markers is gone from the corpus");
    const artifact = rule.fixtures.positive(neutralRepo()).artifact;
    const evidence = rule.detect(artifact, { priorFindings: [] });
    const proposals = rule.remediate?.(evidence, artifact) ?? [];
    const first = proposals[0];
    expect(first?.kind).toBe("replace_range");
    if (first?.kind !== "replace_range") throw new Error("expected a range replacement");
    expect(first.path).toBe("README.md");
    expect(first.startLine).toBe(1);
    expect(first.after).toBe("");
    expect(first.before, "the before text must be the line the scanner actually read").toContain(
      "bootstrapped with [`create-next-app`]",
    );
  });

  it("the shape families propose nothing to apply, and say so rather than staying silent", () => {
    for (const id of ["uniform.function-length", "uniform.file-length", "history.single-sitting", "history.uniform-message-shape"]) {
      const rule = CODE_RULES.find((r) => r.id === id);
      if (!rule) throw new Error(`${id} is gone from the corpus`);
      const artifact = rule.fixtures.positive(neutralRepo()).artifact;
      const proposals = rule.remediate?.(rule.detect(artifact, { priorFindings: [] }), artifact) ?? [];
      expect(proposals.length, `${id} proposed nothing at all`).toBeGreaterThan(0);
      for (const p of proposals) {
        expect(applicabilityOf(p), `${id} proposed an applicable patch for a shape measurement`).toBe("manual");
        expect(p.blastRadius).toBe("none");
      }
    }
  });

  it("no counter finding produced by the corpus carries a remediation", () => {
    // Through the real path, not by reading the rule table: the analyze layer is where a
    // remediation is attached, and it is where the mistake would be made.
    let counters = 0;
    for (const rule of CODE_RULES.filter((r) => r.polarity === "counter")) {
      const artifact = rule.fixtures.positive(neutralRepo()).artifact;
      const result = corpus.analyze(artifact, [rule]);
      for (const f of result.findings) {
        counters += 1;
        expect(f.remediation, `${f.ruleId} is counter-evidence and carried a fix`).toBeUndefined();
      }
    }
    expect(counters, "no counter rule fired, so this assertion proved nothing").toBeGreaterThan(0);
  });
});
