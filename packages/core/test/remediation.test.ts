import { describe, expect, it } from "vitest";
import {
  applicabilityOf,
  assertWellFormedRemediation,
  assertWellFormedResult,
  assertWithinTarget,
  attachRemedies,
  isApplicable,
  isDestructive,
  makeFinding,
  MAX_SCORE,
  REMEDIATION_KINDS,
} from "@slop/core";
import type { DeleteFileRemediation, DetectorResult, Evidence, Remediation, Rule, RuleDescriptor } from "@slop/core";

/**
 * The remediation contract, tested where it is enforced rather than where it is used.
 *
 * Everything in here is a refusal. A remediation is an ASSERTION that something is wrong,
 * carried to another agent that will act on it, so the interesting behaviour of this module is
 * the set of proposals it will not let out: one attached to counter-evidence, one that names a
 * path outside the target, one with no stop condition, one that proposes what is already
 * there, and one that asserts certainty on a read that abstained from it.
 */

const rebuttal = "This rule reads a convention that a careful person also produces on purpose, so it can be wrong.";
const stop = "the file is a deliberate part of how the team works.";

const goodDelete = (): DeleteFileRemediation => ({
  kind: "delete_file",
  path: "CLAUDE.md",
  destructive: true,
  summary: "Remove CLAUDE.md from the repository.",
  rebuttal,
  doNotApplyIf: stop,
  blastRadius: "file",
  addresses: ["CLAUDE.md"],
});

const descriptor = (overrides: Partial<RuleDescriptor> = {}): RuleDescriptor => ({
  id: "test.rule",
  family: "agent-artifact",
  title: "A test rule",
  polarity: "signal",
  baseWeight: 1,
  severity: "high",
  explanation: "An explanation long enough to be a real sentence about what was observed here.",
  falsePositiveNote: rebuttal,
  since: "test",
  ...overrides,
});

const evidence: readonly Evidence[] = [{ kind: "file", locator: "CLAUDE.md", observed: "4200 bytes" }];

describe("the shape of a proposal", () => {
  it("classifies every kind exactly once, and only deletion is destructive", () => {
    const seen = new Set(REMEDIATION_KINDS.map((k) => k));
    expect(seen.size, "a kind is listed twice").toBe(REMEDIATION_KINDS.length);
    expect(applicabilityOf(goodDelete())).toBe("confirm");
    expect(isDestructive(goodDelete())).toBe(true);
    expect(isApplicable(goodDelete())).toBe(true);
    expect(
      applicabilityOf({
        kind: "manual",
        locator: "src/a.ts:4",
        guidance: "Say why this line is the way it is, or delete the comment.",
        summary: "Rewrite the comment.",
        rebuttal,
        doNotApplyIf: stop,
        blastRadius: "line",
        addresses: ["src/a.ts:4"],
      }),
    ).toBe("manual");
  });

  it("refuses a proposal with no rebuttal and no stop condition", () => {
    expect(() => assertWellFormedRemediation("r", { ...goodDelete(), rebuttal: "" })).toThrow(/rebuttal/);
    expect(() => assertWellFormedRemediation("r", { ...goodDelete(), doNotApplyIf: "" })).toThrow(/do not apply if/i);
  });

  it("refuses a patch that proposes exactly what is already there", () => {
    expect(() =>
      assertWellFormedRemediation("r", {
        kind: "replace_range",
        path: "README.md",
        startLine: 1,
        endLine: 1,
        before: "# app",
        after: "# app",
        summary: "Rewrite the first line.",
        rebuttal,
        doNotApplyIf: stop,
        blastRadius: "line",
        addresses: ["README.md:1"],
      }),
    ).toThrow(/already there/);
  });

  it("refuses a proposal that addresses no citation", () => {
    expect(() => assertWellFormedRemediation("r", { ...goodDelete(), addresses: [] })).toThrow(/addresses no evidence/);
  });
});

describe("nothing outside the scanned target", () => {
  const escapes = ["/etc/hosts", "C:\\Windows\\system32\\drivers\\etc\\hosts", "../../.ssh/authorized_keys", "~/.bashrc", "\\\\server\\share", ""];

  it.each(escapes)("refuses a path that leaves the target: %s", (p) => {
    expect(() => assertWithinTarget("test.rule", p)).toThrow(/inside the scanned target/);
    expect(() => assertWellFormedRemediation("test.rule", { ...goodDelete(), path: p })).toThrow(/inside the scanned target/);
  });

  it("allows an ordinary repository-relative path", () => {
    expect(() => assertWithinTarget("test.rule", "src/app/page.tsx")).not.toThrow();
    expect(() => assertWithinTarget("test.rule", ".gitignore")).not.toThrow();
  });

  it("the check is not dead: it accepts the good path and rejects the bad one in the same call shape", () => {
    // Mutation-testing the guard itself. A path check that cannot express a traversal fails
    // silently, and a silent path check is the whole reason this function exists.
    const results = ["src/a.ts", "../a.ts"].map((p) => {
      try {
        assertWithinTarget("r", p);
        return "allowed";
      } catch {
        return "refused";
      }
    });
    expect(results).toEqual(["allowed", "refused"]);
  });
});

describe("counter-evidence is never remediable", () => {
  it("makeFinding throws when a counter rule proposes a fix", () => {
    expect(() =>
      makeFinding({ ...descriptor({ polarity: "counter", baseWeight: -1 }) }, evidence, { remediation: [goodDelete()] }),
    ).toThrow(/nothing here to fix/);
  });

  it("attachRemedies throws when a counter rule is given one", () => {
    const counter = {
      id: "counter.thing",
      polarity: "counter",
      falsePositiveNote: rebuttal,
    } as unknown as Rule<unknown, string>;
    expect(() => attachRemedies([counter], { "counter.thing": () => [goodDelete()] })).toThrow(/Counter-evidence/);
  });

  it("attachRemedies throws when a signal rule has none, and when the table names a rule that is gone", () => {
    const signal = { id: "sig.thing", polarity: "signal", falsePositiveNote: rebuttal } as unknown as Rule<unknown, string>;
    expect(() => attachRemedies([signal], {})).toThrow(/has no remediation/);
    expect(() => attachRemedies([signal], { "sig.thing": () => [], "sig.gone": () => [] })).toThrow(/gone stale/);
  });

  it("injects the rule's own false-positive note as the rebuttal, so the two cannot diverge", () => {
    const signal = { id: "sig.thing", polarity: "signal", falsePositiveNote: rebuttal } as unknown as Rule<unknown, string>;
    const [attached] = attachRemedies([signal], { "sig.thing": () => [{ ...goodDelete(), rebuttal: "" }] });
    const produced = attached?.remediate?.([], undefined)[0];
    expect(produced?.rebuttal).toBe(rebuttal);
  });
});

describe("only a deterministic read may assert a patch", () => {
  const resultWith = (kind: DetectorResult["evidenceKind"], remediation: readonly Remediation[]): DetectorResult => ({
    detectorId: "test.detector",
    modality: "image",
    evidenceKind: kind,
    corpusVersion: "test",
    input: { kind: "text", text: "x" },
    startedAt: "2026-01-01T00:00:00.000Z",
    finishedAt: "2026-01-01T00:00:01.000Z",
    findings: [makeFinding(descriptor(), evidence, { remediation })],
    coverage: { ratio: 1, probes: [{ id: "p", ran: true }], examined: "everything" },
    rulesEvaluated: ["test.rule"],
  });

  it("refuses an applicable patch on a probabilistic result", () => {
    expect(() => assertWellFormedResult(resultWith("probabilistic", [goodDelete()]))).toThrow(/abstains from certainty/);
  });

  it("refuses an applicable patch on a provenance result", () => {
    expect(() => assertWellFormedResult(resultWith("provenance", [goodDelete()]))).toThrow(/abstains from certainty/);
  });

  it("allows a manual remediation on either, because guidance is not an assertion of certainty", () => {
    const guidance: Remediation = {
      kind: "manual",
      locator: "the file",
      guidance: "A person has to look at this one; nothing here determines the right answer.",
      summary: "Have a person look at this.",
      rebuttal,
      doNotApplyIf: "always, since there is nothing to apply.",
      blastRadius: "none",
      addresses: ["CLAUDE.md"],
    };
    expect(() => assertWellFormedResult(resultWith("probabilistic", [guidance]))).not.toThrow();
    expect(() => assertWellFormedResult(resultWith("deterministic", [goodDelete()]))).not.toThrow();
  });
});

describe("the invariants remediation was added next to are untouched", () => {
  it("still refuses a finding with no evidence, and still stops at 99", () => {
    expect(() => makeFinding(descriptor(), [])).toThrow(/No evidence, no finding/);
    expect(MAX_SCORE).toBe(99);
  });

  it("a finding with no remediation carries no remediation field at all", () => {
    expect(makeFinding(descriptor(), evidence).remediation).toBeUndefined();
  });
});
